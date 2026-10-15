"use client";

import { ChevronLeft, Languages, List, MessageCircle, Type } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Chapter } from "../lib/workspaceOutline";
import type { WorkspaceDocument } from "../lib/workspaceStore";
import { ContentsSheet, SettingsSheet } from "./ReaderSheets";
import { toBlocks } from "./readerText";
import { useReaderPrefs } from "./readerPrefs";

export type SegmentData = {
  text: string;
  start: number;
  end: number;
  index: number;
  starts: number[];
  chapters: Chapter[];
  totalLength: number;
  target: number;
};
export type OpenedBook = SegmentData & { document: WorkspaceDocument };
type Restore = { kind: "offset"; value: number } | { kind: "first" } | { kind: "last" };
type SelectionState = { text: string; x: number; y: number };

const GAP = 40;
const SWIPE_DISTANCE = 48;

type Props = {
  book: OpenedBook;
  onBack: (offset: number) => void;
  onAssistant: (mode: "open" | "translate" | "ask", selection?: string) => void;
  onError: (message: string) => void;
};

export default function BookReader({ book, onBack, onAssistant, onError }: Props) {
  const [prefs, setPrefs] = useReaderPrefs();
  const documentId = book.document.id;
  const isPdf = book.document.mimeType === "application/pdf";
  const [segment, setSegment] = useState<SegmentData>(book);
  const [chrome, setChrome] = useState(false);
  const [sheet, setSheet] = useState<"settings" | "contents" | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [offset, setOffset] = useState(book.target);
  const [scrub, setScrub] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selection, setSelection] = useState<SelectionState | null>(null);

  const viewRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const blockEls = useRef<(HTMLElement | null)[]>([]);
  const blockPages = useRef<number[]>([]);
  // Set when a new segment or jump needs a specific landing spot; otherwise relayout keeps the current offset.
  const pending = useRef<Restore | null>({ kind: "offset", value: book.target });
  const offsetRef = useRef(book.target);
  const animate = useRef(false);
  const cache = useRef(new Map<number, SegmentData>());
  const saveTimer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  const gesture = useRef<{ x: number; y: number; t: number; active: boolean; dx: number } | null>(null);

  const chapterMap = useMemo(() => new Map(segment.chapters.map((chapter) => [chapter.offset, chapter.title])), [segment.chapters]);
  const blocks = useMemo(() => toBlocks(segment.text, segment.start, isPdf, chapterMap), [segment.text, segment.start, isPdf, chapterMap]);
  const paged = prefs.mode === "page";

  // ---- progress -----------------------------------------------------------
  const flushProgress = useCallback((keepalive = false) => {
    window.clearTimeout(saveTimer.current);
    if (!dirty.current) return;
    dirty.current = false;
    void fetch("/api/workspace/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: documentId, offset: offsetRef.current }),
      keepalive,
    }).catch(() => { dirty.current = true; });
  }, [documentId]);

  const reportOffset = useCallback((next: number) => {
    offsetRef.current = next;
    setOffset(next);
    dirty.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => flushProgress(), 1500);
  }, [flushProgress]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushProgress(true); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      flushProgress(true);
    };
  }, [flushProgress]);

  // ---- geometry -------------------------------------------------------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const observer = new ResizeObserver(() => setSize({ w: Math.round(view.clientWidth), h: Math.round(view.clientHeight) }));
    observer.observe(view);
    return () => observer.disconnect();
  }, [paged]);

  const stride = size.w + GAP;

  const offsetForPage = useCallback((target: number) => {
    const pages = blockPages.current;
    let found = -1;
    for (let i = 0; i < pages.length; i += 1) {
      if (pages[i] === target && blocks[i].text) return blocks[i].offset;
      if (pages[i] < target) found = i;
    }
    return found >= 0 ? blocks[found].offset : segment.start;
  }, [blocks, segment.start]);

  const showPage = useCallback((target: number, withAnimation: boolean) => {
    const pages = pagesRef.current;
    if (!pages) return;
    animate.current = withAnimation;
    pages.style.transition = withAnimation ? "transform .32s cubic-bezier(.2,.8,.2,1)" : "none";
    pages.style.transform = `translate3d(${-target * (size.w + GAP)}px,0,0)`;
    setPage(target);
    reportOffset(offsetForPage(target));
  }, [offsetForPage, reportOffset, size.w]);

  const restore = useCallback((target: Restore, withAnimation = false) => {
    if (paged) {
      let next = 0;
      if (target.kind === "last") next = Math.max(0, pageCount - 1);
      if (target.kind === "offset") {
        let index = 0;
        for (let i = 0; i < blocks.length; i += 1) if (blocks[i].offset <= target.value) index = i;
        next = blockPages.current[index] ?? 0;
      }
      showPage(Math.min(next, Math.max(0, pageCount - 1)), withAnimation);
    } else {
      const view = viewRef.current;
      if (!view) return;
      let index = 0;
      if (target.kind === "offset") for (let i = 0; i < blocks.length; i += 1) if (blocks[i].offset <= target.value) index = i;
      if (target.kind === "last") index = blocks.length - 1;
      view.scrollTo({ top: target.kind === "first" ? 0 : Math.max(0, (blockEls.current[index]?.offsetTop ?? 0) - 24), behavior: withAnimation ? "smooth" : "auto" });
    }
  }, [blocks, pageCount, paged, showPage]);

  // Measure and restore the reading position whenever text, typography or size change.
  useLayoutEffect(() => {
    const pages = pagesRef.current;
    if (!pages || !size.w || !size.h) return;
    if (paged) {
      pages.style.width = `${size.w}px`;
      pages.style.height = `${size.h}px`;
      pages.style.columnWidth = `${size.w}px`;
      pages.style.columnGap = `${GAP}px`;
      const origin = pages.getBoundingClientRect().left;
      const stepped = size.w + GAP;
      blockPages.current = blockEls.current.map((el) => {
        const rect = el?.getClientRects()[0];
        return rect ? Math.max(0, Math.floor((rect.left - origin + 2) / stepped)) : 0;
      });
      const count = Math.max(1, Math.round((pages.scrollWidth + GAP) / stepped));
      setPageCount(count);
      const target: Restore = pending.current ?? { kind: "offset", value: offsetRef.current };
      let next = 0;
      let anchor: number | null = null;
      if (target.kind === "last") next = count - 1;
      if (target.kind === "offset") {
        let index = 0;
        for (let i = 0; i < blocks.length; i += 1) if (blocks[i].offset <= target.value) index = i;
        next = blockPages.current[index] ?? 0;
        // Keep the same paragraph as the anchor so repeated relayouts do not drift forward.
        anchor = blocks[index]?.offset ?? null;
      }
      next = Math.min(next, count - 1);
      pages.style.transition = "none";
      pages.style.transform = `translate3d(${-next * stepped}px,0,0)`;
      setPage(next);
      const first = blockPages.current.findIndex((value, i) => value === next && blocks[i].text);
      reportOffset(anchor ?? (first >= 0 ? blocks[first].offset : segment.start));
    } else {
      pages.style.cssText = "";
      const target: Restore = pending.current ?? { kind: "offset", value: offsetRef.current };
      const view = viewRef.current;
      let index = 0;
      if (target.kind === "offset") for (let i = 0; i < blocks.length; i += 1) if (blocks[i].offset <= target.value) index = i;
      if (target.kind === "last") index = blocks.length - 1;
      view?.scrollTo({ top: target.kind === "first" ? 0 : Math.max(0, (blockEls.current[index]?.offsetTop ?? 0) - 24) });
    }
    pending.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, size.w, size.h, paged, prefs.fontSize, prefs.font, prefs.lineHeight]);

  // Scroll mode tracks the first block in view.
  useEffect(() => {
    if (paged) return;
    const view = viewRef.current;
    if (!view) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let index = 0;
        for (let i = 0; i < blockEls.current.length; i += 1) {
          const el = blockEls.current[i];
          if (el && el.offsetTop + el.offsetHeight > view.scrollTop + 30) { index = i; break; }
        }
        if (blocks[index]) reportOffset(blocks[index].offset);
      });
    };
    view.addEventListener("scroll", onScroll, { passive: true });
    return () => { view.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [blocks, paged, reportOffset]);

  // ---- segments -------------------------------------------------------------
  const fetchSegment = useCallback(async (query: string): Promise<SegmentData> => {
    const response = await fetch(`/api/workspace/documents?id=${encodeURIComponent(documentId)}&${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error("load");
    return response.json() as Promise<SegmentData>;
  }, [documentId]);

  const loadSegment = useCallback(async (query: string, cacheKey: number | null, target: Restore) => {
    setLoading(true);
    try {
      const data = (cacheKey !== null && cache.current.get(cacheKey)) || await fetchSegment(query);
      cache.current.set(data.index, data);
      pending.current = target;
      setSegment(data);
    } catch {
      onError("Could not load this part of the book. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [fetchSegment, onError]);

  // Warm the next segment so turning the last page feels instant.
  useEffect(() => {
    const next = segment.index + 1;
    if (next >= segment.starts.length || cache.current.has(next) || (paged && page < pageCount - 3)) return;
    void fetchSegment(`segment=${next}`).then((data) => cache.current.set(next, data)).catch(() => undefined);
  }, [segment.index, segment.starts.length, page, pageCount, paged, fetchSegment]);

  const jumpTo = useCallback((target: number) => {
    setSheet(null);
    if (target >= segment.start && target < segment.end) {
      restore({ kind: "offset", value: target }, true);
    } else {
      void loadSegment(`offset=${Math.max(0, Math.floor(target))}`, null, { kind: "offset", value: target });
    }
  }, [loadSegment, restore, segment.end, segment.start]);

  const turn = useCallback((delta: 1 | -1) => {
    if (loading) return;
    const target = page + delta;
    if (target < 0) {
      if (segment.index > 0) void loadSegment(`segment=${segment.index - 1}`, segment.index - 1, { kind: "last" });
    } else if (target >= pageCount) {
      if (segment.index < segment.starts.length - 1) void loadSegment(`segment=${segment.index + 1}`, segment.index + 1, { kind: "first" });
    } else {
      showPage(target, true);
    }
  }, [loading, loadSegment, page, pageCount, segment.index, segment.starts.length, showPage]);

  // ---- input ----------------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (sheet || (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(event.target.tagName))) return;
      if (event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && paged)) { event.preventDefault(); if (paged) turn(1); }
      else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); if (paged) turn(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paged, sheet, turn]);

  const hasSelection = () => !!window.getSelection()?.toString().trim();

  const onPointerDown = (event: React.PointerEvent) => {
    gesture.current = { x: event.clientX, y: event.clientY, t: Date.now(), active: false, dx: 0 };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !paged || event.pointerType === "mouse" || hasSelection()) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.active && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) g.active = true;
    if (!g.active) return;
    g.dx = dx;
    const pages = pagesRef.current;
    if (pages) {
      // Follow the finger, with resistance where there is no previous or next page.
      const edge = (page === 0 && dx > 0 && segment.index === 0) || (page === pageCount - 1 && dx < 0 && segment.index === segment.starts.length - 1);
      pages.style.transition = "none";
      pages.style.transform = `translate3d(${-page * stride + (edge ? dx / 4 : dx)}px,0,0)`;
    }
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.active) {
      const fast = Math.abs(g.dx) / Math.max(1, Date.now() - g.t) > 0.5;
      if (Math.abs(g.dx) > SWIPE_DISTANCE || fast) {
        turn(g.dx < 0 ? 1 : -1);
        // turn() is a no-op at the ends of the book; settle back either way.
        if ((g.dx < 0 && page === pageCount - 1 && segment.index === segment.starts.length - 1) || (g.dx > 0 && page === 0 && segment.index === 0)) showPage(page, true);
      } else {
        showPage(page, true);
      }
      return;
    }
    if (Math.abs(event.clientX - g.x) > 10 || Math.abs(event.clientY - g.y) > 10 || hasSelection()) return;
    const rect = viewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    if (paged && ratio < 0.25) turn(-1);
    else if (paged && ratio > 0.75) turn(1);
    else setChrome((value) => !value);
  };

  // Selection toolbar: appears under the native selection handles.
  useEffect(() => {
    const onChange = () => {
      const current = window.getSelection();
      const text = current?.toString().trim() ?? "";
      if (!current || !text || current.rangeCount === 0 || !pagesRef.current?.contains(current.getRangeAt(0).commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const rect = current.getRangeAt(0).getBoundingClientRect();
      setSelection({ text: text.slice(0, 6000), x: Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110), y: Math.min(rect.bottom + 14, window.innerHeight - 70) });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const applySelection = (mode: "translate" | "ask") => {
    if (!selection) return;
    onAssistant(mode, selection.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  // ---- display --------------------------------------------------------------
  const currentChapter = useMemo(() => {
    let title = "";
    for (const chapter of segment.chapters) if (chapter.offset <= offset) title = chapter.title.replace(" · ", " — ");
    return title;
  }, [segment.chapters, offset]);
  const currentPage = useMemo(() => {
    let value: number | null = null;
    for (let i = 0; i < blocks.length && blocks[i].offset <= offset; i += 1) value = blocks[i].page ?? value;
    return value;
  }, [blocks, offset]);
  const shown = scrub ?? offset;
  const percent = Math.min(100, Math.round((shown / Math.max(1, segment.totalLength)) * 100));
  const style = { "--ws-size": `${prefs.fontSize}px`, "--ws-leading": prefs.lineHeight } as React.CSSProperties;

  blockEls.current = [];

  return <div className="reader" data-theme={prefs.theme} data-font={prefs.font} data-mode={prefs.mode} data-chrome={chrome ? "on" : "off"} style={style}>
    <header className="reader-bar reader-bar--top">
      <button type="button" className="reader-icon" onClick={() => { flushProgress(true); onBack(offsetRef.current); }} aria-label="Back to library"><ChevronLeft size={22} /><span>Library</span></button>
      <h1>{book.document.name.replace(/\.[^.]+$/, "")}</h1>
      <div className="reader-bar__actions">
        <button type="button" className="reader-icon" onClick={() => setSheet("contents")} aria-label="Contents"><List size={20} /></button>
        <button type="button" className="reader-icon" onClick={() => setSheet("settings")} aria-label="Appearance"><Type size={20} /></button>
        <button type="button" className="reader-icon" onClick={() => onAssistant("open")} aria-label="Ask DeepSeek"><MessageCircle size={20} /></button>
      </div>
    </header>

    <div className="reader-view" ref={viewRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { gesture.current = null; if (paged) showPage(page, true); }}>
      <article className="reader-pages" ref={pagesRef} lang={/[㐀-鿿]/.test(segment.text.slice(0, 400)) ? "zh" : "en"}>
        {blocks.map((block, index) => block.heading !== undefined
          ? <h2 key={block.offset} className="reader-chapter" ref={(el) => { blockEls.current[index] = el; }}>{block.heading.split(" · ").map((part, i) => i === 0 ? <small key={i}>{part}</small> : <span key={i}>{part}</span>)}</h2>
          : <p key={block.offset} ref={(el) => { blockEls.current[index] = el; }} className={isPdf ? "" : "reader-pre"}>{block.text}</p>)}
        {!paged && <div className="reader-scroll-end">
          {segment.index > 0 && <button type="button" className="ws-text-button" onClick={() => void loadSegment(`segment=${segment.index - 1}`, segment.index - 1, { kind: "first" })}>Previous section</button>}
          {segment.index < segment.starts.length - 1 && <button type="button" className="ws-text-button" onClick={() => void loadSegment(`segment=${segment.index + 1}`, segment.index + 1, { kind: "first" })}>Next section</button>}
        </div>}
      </article>
      {loading && <div className="reader-loading" aria-live="polite"><span /></div>}
    </div>

    <footer className="reader-bar reader-bar--bottom">
      <input type="range" min={0} max={Math.max(1, segment.totalLength - 1)} step={1} value={shown} aria-label="Reading position"
        onChange={(event) => setScrub(Number(event.target.value))}
        onPointerUp={() => { if (scrub !== null) { jumpTo(scrub); setScrub(null); } }}
        onKeyUp={() => { if (scrub !== null) { jumpTo(scrub); setScrub(null); } }} />
      <div className="reader-bar__meta"><span>{currentChapter || book.document.name}</span><span>{isPdf && currentPage ? `p. ${currentPage} · ` : ""}{percent}%</span></div>
    </footer>

    {!chrome && <div className="reader-folio" aria-hidden="true"><span>{currentChapter}</span><span>{isPdf && currentPage ? currentPage : `${percent}%`}</span></div>}

    {selection && <div className="reader-selection" style={{ left: selection.x, top: selection.y }} onPointerDown={(event) => event.preventDefault()}>
      <button type="button" onClick={() => applySelection("translate")}><Languages size={15} /> Translate</button>
      <button type="button" onClick={() => applySelection("ask")}><MessageCircle size={15} /> Ask</button>
    </div>}

    <SettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} prefs={prefs} update={setPrefs} />
    <ContentsSheet open={sheet === "contents"} onClose={() => setSheet(null)} chapters={segment.chapters} starts={segment.starts} offset={offset} totalLength={segment.totalLength} onJump={jumpTo} />
  </div>;
}
