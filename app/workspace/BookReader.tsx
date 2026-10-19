"use client";

import { Bookmark, ChevronLeft, Highlighter, Languages, List, MessageCircle, ScanText, Type } from "lucide-react";
import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { displayTitle } from "../lib/bookTitle";
import type { Chapter } from "../lib/workspaceOutline";
import type { MarkColor, WorkspaceBookmark, WorkspaceDocument, WorkspaceMark } from "../lib/workspaceStore";
import { MarkPopover, NoteSheet, renderMarked, TranslateCard, type StreamFn } from "./ReaderExtras";
import { ContentsSheet, SettingsSheet } from "./ReaderSheets";
import { isTranslatable, toBlocks } from "./readerText";
import { useReaderPrefs } from "./readerPrefs";
import type { PdfSelection } from "./PdfPages";
import { useBookmarks } from "./useBookmarks";
import { useTranslations } from "./useTranslations";

const PdfPages = dynamic(() => import("./PdfPages"), { ssr: false });

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
/** The toolbar docks to the top or bottom edge, away from the system menu and handles that sit at the selection. */
type SelectionState = { text: string; dock: "top" | "bottom" };

const GAP = 40;
const SWIPE_DISTANCE = 48;

type Props = {
  book: OpenedBook;
  onBack: (offset: number) => void;
  onAssistant: (mode: "open" | "translate" | "ask", selection?: string, offset?: number) => void;
  onError: (message: string) => void;
  stream: StreamFn;
  /** A page cited by the assistant; each request has a new `seq`. */
  citation: { seq: number; page: number } | null;
  /** Changes when recognized text was saved, so the visible part is reloaded. */
  reloadKey: number;
  /** Pages still without text, and how to offer recognizing them. */
  ocrPending: number;
  onOcr: () => void;
};

export default function BookReader({ book, onBack, onAssistant, onError, stream, citation, reloadKey, ocrPending, onOcr }: Props) {
  const [prefs, setPrefs] = useReaderPrefs();
  const documentId = book.document.id;
  const isPdf = book.document.mimeType === "application/pdf";
  const [segment, setSegment] = useState<SegmentData>(book);
  const [chrome, setChrome] = useState(false);
  const [sheet, setSheet] = useState<"settings" | "contents" | null>(null);
  const [contentsTab, setContentsTab] = useState<"contents" | "bookmarks">("contents");
  // Held sideways on a wide screen, facing pages are possible.
  const [wide, setWide] = useState(false);
  const [scrollEnd, setScrollEnd] = useState(0);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [offset, setOffset] = useState(book.target);
  const [scrub, setScrub] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [marks, setMarks] = useState<WorkspaceMark[]>([]);
  const [activeMark, setActiveMark] = useState<{ id: string; x: number; y: number } | null>(null);
  const [noteMark, setNoteMark] = useState<string | null>(null);
  const [translating, setTranslating] = useState<{ text: string; context: string } | null>(null);
  const marksLoaded = useRef(false);
  const marksTimer = useRef<number | undefined>(undefined);
  const rangeRef = useRef<Range | null>(null);
  const hoverChrome = useRef(false);

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
  // The paragraph at the top of the view and how far below the top edge it sits, so scrolling keeps its place
  // when text above grows (a translation arriving) or the browser forgets the scroll position.
  const anchorRef = useRef<{ offset: number; delta: number } | null>(null);

  const chapterMap = useMemo(() => new Map(segment.chapters.map((chapter) => [chapter.offset, chapter.title])), [segment.chapters]);
  const keepSet = useMemo(() => new Set(segment.chapters.filter((chapter) => chapter.keep).map((chapter) => chapter.offset)), [segment.chapters]);
  const blocks = useMemo(() => toBlocks(segment.text, segment.start, isPdf, chapterMap, keepSet), [segment.text, segment.start, isPdf, chapterMap, keepSet]);
  const paged = prefs.mode === "page";
  // A PDF can be shown exactly as printed; words there are translated by selecting them.
  const original = isPdf && prefs.mode === "original";
  const bilingual = prefs.bilingual !== "off" && !original;
  // English on the left page and its Chinese on the right, paragraph by paragraph.
  const side = prefs.bilingual === "side" && wide && !original;

  // The first paragraphs of the next section, if it is loaded, so translation can run ahead across the boundary.
  const nextBlocks = useCallback(() => {
    const next = cache.current.get(segment.index + 1);
    return next ? toBlocks(next.text, next.start, isPdf, new Map(next.chapters.map((chapter) => [chapter.offset, chapter.title])), new Set(next.chapters.filter((chapter) => chapter.keep).map((chapter) => chapter.offset))) : [];
  }, [segment.index, isPdf]);
  const translation = useTranslations({ enabled: bilingual, documentId, blocks, offsetRef, nextBlocks });
  const [originalPage, setOriginalPage] = useState(1);
  const [originalTotal, setOriginalTotal] = useState(0);
  const [pageScrub, setPageScrub] = useState<number | null>(null);
  const [goto, setGoto] = useState<{ seq: number; page: number } | null>(null);
  const [pdfSelection, setPdfSelection] = useState<PdfSelection | null>(null);
  const pageTimer = useRef<number | undefined>(undefined);
  const [translationMenu, setTranslationMenu] = useState<{ offset: number; x: number; y: number } | null>(null);

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
    saveTimer.current = window.setTimeout(() => flushProgress(), 700);
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

  useEffect(() => {
    const query = window.matchMedia("(min-width: 760px) and (orientation: landscape)");
    const check = () => setWide(query.matches);
    check();
    query.addEventListener("change", check);
    return () => query.removeEventListener("change", check);
  }, []);

  // ---- highlights -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/workspace/marks?id=${encodeURIComponent(documentId)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ marks: WorkspaceMark[] }> : null)
      .then((data) => { if (!cancelled && data) { setMarks(data.marks); marksLoaded.current = true; } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [documentId]);

  const [bookmarks, updateBookmarks] = useBookmarks(documentId, onError);

  const updateMarks = useCallback((change: (current: WorkspaceMark[]) => WorkspaceMark[]) => {
    setMarks((current) => {
      const next = change(current);
      window.clearTimeout(marksTimer.current);
      // Never write before the saved list has loaded, or it would be overwritten.
      if (marksLoaded.current) {
        marksTimer.current = window.setTimeout(() => {
          void fetch("/api/workspace/marks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: documentId, marks: next }), keepalive: true })
            .then((response) => { if (!response.ok) onError("Could not save highlights."); })
            .catch(() => onError("Could not save highlights."));
        }, 600);
      }
      return next;
    });
  }, [documentId, onError]);

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
      const view = viewRef.current;
      const anchor = anchorRef.current;
      if (!pending.current && anchor && view) {
        // Nothing asked to move: keep the paragraph the reader is looking at exactly where it was.
        const el = blockEls.current[blocks.findIndex((block) => block.heading === undefined && block.offset === anchor.offset)];
        if (el) {
          const want = el.offsetTop - anchor.delta;
          if (Math.abs(view.scrollTop - want) > 1.5) view.scrollTop = want;
        }
      } else {
        const target: Restore = pending.current ?? { kind: "offset", value: offsetRef.current };
        let index = 0;
        if (target.kind === "offset") for (let i = 0; i < blocks.length; i += 1) if (blocks[i].offset <= target.value) index = i;
        if (target.kind === "last") index = blocks.length - 1;
        view?.scrollTo({ top: target.kind === "first" ? 0 : Math.max(0, (blockEls.current[index]?.offsetTop ?? 0) - 24) });
        const el = blockEls.current[index];
        if (el && view) anchorRef.current = { offset: blocks[index].offset, delta: el.offsetTop - view.scrollTop };
      }
    }
    pending.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, size.w, size.h, paged, prefs.fontSize, prefs.font, prefs.lineHeight, bilingual, side, translation.version]);

  // Scroll mode tracks the first block in view.
  useEffect(() => {
    if (paged) return;
    const view = viewRef.current;
    if (!view) return;
    let frame = 0;
    // The first paragraph reaching below the top edge; offsets only grow down the page, so a binary search finds it.
    const firstVisible = () => {
      const limit = view.scrollTop + 30;
      let low = 0;
      let high = blockEls.current.length - 1;
      let found = 0;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const el = blockEls.current[middle];
        if (el && el.offsetTop + el.offsetHeight > limit) { found = middle; high = middle - 1; } else low = middle + 1;
      }
      return found;
    };
    const onScroll = () => {
      // The anchor is kept current on every scroll event, so a translation arriving between frames cannot pull the page back.
      const index = firstVisible();
      const el = blockEls.current[index];
      if (blocks[index] && el) anchorRef.current = { offset: blocks[index].offset, delta: el.offsetTop - view.scrollTop };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (blocks[index]) reportOffset(blocks[index].offset);
        let last = index;
        for (let i = index; i < blockEls.current.length; i += 1) {
          const item = blockEls.current[i];
          if (item && item.offsetTop < view.scrollTop + view.clientHeight) last = i;
          else break;
        }
        setScrollEnd(blocks[last + 1]?.offset ?? segment.end);
      });
    };
    view.addEventListener("scroll", onScroll, { passive: true });
    // Coming back from another app, a browser may have put the view at the top again; put it back where it was.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      requestAnimationFrame(() => {
        const anchor = anchorRef.current;
        const el = anchor ? blockEls.current[blocks.findIndex((block) => block.heading === undefined && block.offset === anchor.offset)] : null;
        if (anchor && el && Math.abs(view.scrollTop - (el.offsetTop - anchor.delta)) > 40) view.scrollTop = el.offsetTop - anchor.delta;
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => { view.removeEventListener("scroll", onScroll); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("pageshow", onVisible); cancelAnimationFrame(frame); };
  }, [blocks, paged, reportOffset, segment.end]);

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

  // New text arrived from OCR: drop cached segments and reload where the reader is.
  const seenReload = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey === seenReload.current) return;
    seenReload.current = reloadKey;
    cache.current.clear();
    void loadSegment(`offset=${Math.max(0, Math.floor(offsetRef.current))}`, null, { kind: "offset", value: offsetRef.current });
  }, [reloadKey, loadSegment]);

  // Warm the next segment so turning the last page feels instant.
  useEffect(() => {
    const next = segment.index + 1;
    if (next >= segment.starts.length || cache.current.has(next) || (paged && page < pageCount - 3)) return;
    void fetchSegment(`segment=${next}`).then((data) => cache.current.set(next, data)).catch(() => undefined);
  }, [segment.index, segment.starts.length, page, pageCount, paged, fetchSegment]);

  // Asks the server to read the book's bookmarks or printed contents again, then reloads where the reader is.
  const [rebuilding, setRebuilding] = useState(false);
  const rebuildContents = useCallback(async () => {
    setRebuilding(true);
    try {
      const response = await fetch(`/api/workspace/documents/${encodeURIComponent(documentId)}/enrich`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parts: ["outline"] }) });
      if (!response.ok) throw new Error("rebuild");
      cache.current.clear();
      await loadSegment(`offset=${Math.max(0, Math.floor(offsetRef.current))}`, null, { kind: "offset", value: offsetRef.current });
    } catch {
      onError("Could not read the contents of this book. Try again in a moment.");
    } finally {
      setRebuilding(false);
    }
  }, [documentId, loadSegment, onError]);

  // In the original view the position is a page; saving it still means a text offset, found from the page marker.
  const onOriginalPage = useCallback((page: number, total: number) => {
    setOriginalPage(page);
    setOriginalTotal(total);
    window.clearTimeout(pageTimer.current);
    pageTimer.current = window.setTimeout(() => {
      void fetch(`/api/workspace/documents?id=${encodeURIComponent(documentId)}&page=${page}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<{ offset: number }> : null)
        .then((data) => { if (data) reportOffset(data.offset); })
        .catch(() => undefined);
    }, 600);
  }, [documentId, reportOffset]);

  const pageOfOffset = useCallback((data: SegmentData, target: number) => {
    const upTo = data.text.slice(0, Math.max(0, target - data.start));
    const found = [...upTo.matchAll(/\[Page (\d+)\]/g)];
    return found.length ? Number(found[found.length - 1][1]) : null;
  }, []);

  const jumpTo = useCallback((target: number) => {
    setSheet(null);
    if (original) {
      void (async () => {
        try {
          const data = target >= segment.start && target < segment.end ? segment : await fetchSegment(`offset=${Math.max(0, Math.floor(target))}`);
          const page = pageOfOffset(data, target);
          if (page) setGoto({ seq: Date.now(), page });
        } catch { onError("Could not find that place in the PDF."); }
      })();
      return;
    }
    if (target >= segment.start && target < segment.end) {
      restore({ kind: "offset", value: target }, true);
    } else {
      void loadSegment(`offset=${Math.max(0, Math.floor(target))}`, null, { kind: "offset", value: target });
    }
  }, [loadSegment, restore, segment, original, fetchSegment, pageOfOffset, onError]);

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
    const translated = (event.target as HTMLElement).closest?.("[data-tr-offset]") as HTMLElement | null;
    if (translated?.dataset.trOffset) {
      const box = translated.getBoundingClientRect();
      setTranslationMenu({ offset: Number(translated.dataset.trOffset), x: Math.min(Math.max(box.left + box.width / 2, 120), window.innerWidth - 120), y: Math.min(box.bottom + 8, window.innerHeight - 70) });
      return;
    }
    const hit = (event.target as HTMLElement).closest?.("mark[data-mark]") as HTMLElement | null;
    if (hit?.dataset.mark) {
      const box = hit.getBoundingClientRect();
      setActiveMark({ id: hit.dataset.mark, x: Math.min(Math.max(box.left + box.width / 2, 130), window.innerWidth - 130), y: Math.min(box.bottom + 10, window.innerHeight - 70) });
      return;
    }
    const ratio = (event.clientX - rect.left) / rect.width;
    if (paged && ratio < 0.25) turn(-1);
    else if (paged && ratio > 0.75) turn(1);
    else { hoverChrome.current = false; setChrome((value) => !value); }
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
      rangeRef.current = current.getRangeAt(0).cloneRange();
      const rect = current.getRangeAt(0).getBoundingClientRect();
      // Dock opposite the selection: a selection in the lower half puts the toolbar at the top, and the reverse.
      setSelection({ text: text.slice(0, 6000), dock: rect.top + rect.height / 2 > window.innerHeight * 0.5 ? "top" : "bottom" });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  // Saves a looked-up word to the Vocabulary note with the sentence it appeared in.
  const saveWord = async (word: string, answer: string, paragraph: string) => {
    const needle = word.toLowerCase();
    const sentence = paragraph.split(/(?<=[.!?。！？])\s+/).find((part) => part.toLowerCase().includes(needle)) ?? "";
    const response = await fetch("/api/workspace/vocabulary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, entry: answer, sentence, source: `${displayTitle(book.document)}${currentPageRef.current ? `, p. ${currentPageRef.current}` : ""}` }),
    });
    const data = await response.json().catch(() => ({})) as { duplicate?: boolean };
    if (!response.ok) throw new Error("save failed");
    return data.duplicate ? "duplicate" as const : "saved" as const;
  };

  const clearSelection = () => { window.getSelection()?.removeAllRanges(); setSelection(null); setPdfSelection(null); };

  const askAbout = () => {
    if (!selection) return;
    onAssistant("ask", selection.text, offsetRef.current);
    clearSelection();
  };

  const translateSelection = () => {
    if (!selection) return;
    // The paragraph the selection starts in gives a word its meaning in context.
    const start = rangeRef.current?.startContainer;
    const element = start instanceof Element ? start : start?.parentElement;
    const index = blockEls.current.findIndex((el) => !!el && !!element && el.contains(element));
    setTranslating({ text: selection.text, context: index >= 0 ? blocks[index]?.text ?? "" : "" });
    clearSelection();
  };

  const highlight = (color: MarkColor = "yellow") => {
    const range = rangeRef.current;
    if (!range) return;
    const created: WorkspaceMark[] = [];
    blockEls.current.forEach((el, index) => {
      const block = blocks[index];
      if (!el || !block || block.heading !== undefined || !range.intersectsNode(el)) return;
      const whole = document.createRange();
      whole.selectNodeContents(el);
      let from = 0;
      let to = block.text.length;
      if (range.compareBoundaryPoints(Range.START_TO_START, whole) > 0) {
        const before = document.createRange();
        before.selectNodeContents(el);
        before.setEnd(range.startContainer, range.startOffset);
        from = before.toString().length;
      }
      if (range.compareBoundaryPoints(Range.END_TO_END, whole) < 0) {
        const before = document.createRange();
        before.selectNodeContents(el);
        before.setEnd(range.endContainer, range.endOffset);
        to = before.toString().length;
      }
      const slice = block.text.slice(from, to);
      from += slice.length - slice.trimStart().length;
      to = from + slice.trim().length;
      if (to > from) created.push({ id: crypto.randomUUID(), blockOffset: block.offset, from, to, text: block.text.slice(from, to), color, createdAt: new Date().toISOString() });
    });
    if (!created.length) return;
    updateMarks((current) => [
      ...current.filter((mark) => !created.some((item) => item.blockOffset === mark.blockOffset && mark.from < item.to && item.from < mark.to)),
      ...created,
    ]);
    clearSelection();
  };

  const marksByBlock = useMemo(() => {
    const map = new Map<number, WorkspaceMark[]>();
    for (const mark of marks) map.set(mark.blockOffset, [...(map.get(mark.blockOffset) ?? []), mark]);
    return map;
  }, [marks]);
  const popoverMark = marks.find((mark) => mark.id === activeMark?.id) ?? null;

  // A page cited in the assistant's answer: find it in the text and go there.
  const lastCitation = useRef(0);
  useEffect(() => {
    if (!citation || citation.seq === lastCitation.current) return;
    lastCitation.current = citation.seq;
    void fetch(`/api/workspace/documents?id=${encodeURIComponent(documentId)}&page=${citation.page}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ offset: number }> : Promise.reject(new Error("missing")))
      .then(({ offset: target }) => jumpTo(target))
      .catch(() => onError(`Page ${citation.page} was not found in this book.`));
  }, [citation, documentId, jumpTo, onError]);

  // ---- bookmarks ------------------------------------------------------------
  // The stretch of text on screen: a bookmark inside it marks this page.
  const viewStart = useMemo(() => {
    if (!paged) return offset;
    const index = blockPages.current.findIndex((value) => value === page);
    return index >= 0 && blocks[index] ? Math.min(offset, blocks[index].offset) : offset;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, offset, page, blocks, pageCount]);
  const viewEnd = useMemo(() => {
    if (!paged) return Math.max(scrollEnd, offset + 1);
    const index = blockPages.current.findIndex((value) => value > page);
    return index >= 0 && blocks[index] ? blocks[index].offset : segment.end;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, scrollEnd, offset, page, blocks, segment.end, pageCount]);
  const bookmarked = original ? bookmarks.some((item) => item.page === originalPage) : bookmarks.some((item) => item.offset >= viewStart && item.offset < viewEnd);

  const toggleBookmark = () => {
    if (bookmarked) {
      updateBookmarks((current) => current.filter((item) => original ? item.page !== originalPage : !(item.offset >= viewStart && item.offset < viewEnd)));
      return;
    }
    const here = offsetRef.current;
    const label = original ? "" : (blocks.find((block) => block.text && block.offset >= here)?.text ?? "").replace(/\s+/g, " ").slice(0, 110);
    const created: WorkspaceBookmark = {
      id: crypto.randomUUID(),
      offset: Math.max(0, Math.floor(here)),
      page: (original ? originalPage : currentPageRef.current) ?? undefined,
      chapter: currentChapter || undefined,
      label,
      createdAt: new Date().toISOString(),
    };
    updateBookmarks((current) => [...current, created]);
  };

  const jumpBookmark = (item: WorkspaceBookmark) => {
    if (original && item.page) { setSheet(null); setGoto({ seq: Date.now(), page: item.page }); return; }
    jumpTo(item.offset);
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
  const currentPageRef = useRef<number | null>(null);
  currentPageRef.current = currentPage;
  const shown = scrub ?? offset;
  const percent = Math.min(100, Math.round((shown / Math.max(1, segment.totalLength)) * 100));
  const style = { "--ws-size": `${prefs.fontSize}px`, "--ws-leading": prefs.lineHeight } as React.CSSProperties;

  blockEls.current = [];

  // With a mouse there is no tap, so the bars appear when the pointer nears the top or bottom edge.
  const onHover = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || sheet || event.buttons) return;
    const near = event.clientY < 72 || event.clientY > window.innerHeight - 112;
    if (near && !chrome) { hoverChrome.current = true; setChrome(true); }
    else if (!near && chrome && hoverChrome.current) { hoverChrome.current = false; setChrome(false); }
  };

  return <div className="reader" onPointerMove={onHover} data-theme={prefs.theme} data-font={prefs.font} data-mode={prefs.mode} data-spread={side ? "on" : "off"} data-chrome={chrome ? "on" : "off"} style={style}>
    <header className="reader-bar reader-bar--top">
      <button type="button" className="reader-icon" onClick={() => { flushProgress(true); onBack(offsetRef.current); }} aria-label="Back to library"><ChevronLeft size={22} /><span>Library</span></button>
      <h1>{displayTitle(book.document)}</h1>
      <div className="reader-bar__actions">
        {ocrPending > 0 && <button type="button" className="reader-icon" onClick={onOcr} aria-label="Recognize text"><ScanText size={20} /></button>}
        <button type="button" className="reader-icon" onClick={() => { setContentsTab("contents"); setSheet("contents"); }} aria-label="Contents"><List size={20} /></button>
        <button type="button" className="reader-icon" onClick={toggleBookmark} aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"} aria-pressed={bookmarked}><Bookmark size={20} fill={bookmarked ? "currentColor" : "none"} /></button>
        <button type="button" className="reader-icon" onClick={() => setSheet("settings")} aria-label="Appearance"><Type size={20} /></button>
        <button type="button" className="reader-icon" onClick={() => onAssistant("open", undefined, offsetRef.current)} aria-label="Ask DeepSeek"><MessageCircle size={20} /></button>
      </div>
    </header>

    {original ? <div className="reader-view reader-view--original">
      <PdfPages url={`/api/workspace/documents/${documentId}/file`} initialPage={currentPage ?? 1} goto={goto} onPage={onOriginalPage} onSelect={setPdfSelection} onTap={() => { hoverChrome.current = false; setChrome((value) => !value); }} />
    </div> : <div className="reader-view" ref={viewRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { gesture.current = null; if (paged) showPage(page, true); }}>
      <article className="reader-pages" ref={pagesRef} lang={/[㐀-鿿]/.test(segment.text.slice(0, 400)) ? "zh" : "en"}>
        {blocks.map((block, index) => block.heading !== undefined
          ? <h2 key={`h${block.offset}`} className="reader-chapter" ref={(el) => { blockEls.current[index] = el; }}>{block.heading.split(" · ").map((part, i) => i === 0 ? <small key={i}>{part}</small> : <span key={i}>{part}</span>)}</h2>
          : side ? <div key={block.offset} className="reader-row">
            <p ref={(el) => { blockEls.current[index] = el; }} className={isPdf ? "" : "reader-pre"}>{renderMarked(block.text, marksByBlock.get(block.offset) ?? [])}</p>
            <div className="reader-row__tr">
              {translation.translations[block.offset]
                ? <p className="reader-tr" lang="zh-Hans" data-tr-offset={block.offset}>{translation.translations[block.offset]}</p>
                : translation.queued.has(block.offset) && <p className="reader-tr reader-tr--wait" aria-hidden="true" />}
            </div>
          </div>
          : <Fragment key={block.offset}>
            <p ref={(el) => { blockEls.current[index] = el; }} className={isPdf ? "" : "reader-pre"}>{renderMarked(block.text, marksByBlock.get(block.offset) ?? [])}</p>
            {bilingual && translation.translations[block.offset] && <p className="reader-tr" lang="zh-Hans" data-tr-offset={block.offset}>{translation.translations[block.offset]}</p>}
            {bilingual && !translation.translations[block.offset] && translation.queued.has(block.offset) && <p className="reader-tr reader-tr--wait" aria-hidden="true" />}
          </Fragment>)}
        {!paged && <div className="reader-scroll-end">
          {segment.index > 0 && <button type="button" className="ws-text-button" onClick={() => void loadSegment(`segment=${segment.index - 1}`, segment.index - 1, { kind: "first" })}>Previous section</button>}
          {segment.index < segment.starts.length - 1 && <button type="button" className="ws-text-button" onClick={() => void loadSegment(`segment=${segment.index + 1}`, segment.index + 1, { kind: "first" })}>Next section</button>}
        </div>}
      </article>
      {loading && <div className="reader-loading" aria-live="polite"><span /></div>}
    </div>}

    <footer className="reader-bar reader-bar--bottom">
      {original ? <input type="range" min={1} max={Math.max(2, originalTotal)} step={1} value={pageScrub ?? originalPage} aria-label="Page"
        onChange={(event) => setPageScrub(Number(event.target.value))}
        onPointerUp={() => { if (pageScrub !== null) { setGoto({ seq: Date.now(), page: pageScrub }); setPageScrub(null); } }}
        onKeyUp={() => { if (pageScrub !== null) { setGoto({ seq: Date.now(), page: pageScrub }); setPageScrub(null); } }} />
      : <input type="range" min={0} max={Math.max(1, segment.totalLength - 1)} step={1} value={shown} aria-label="Reading position"
        onChange={(event) => setScrub(Number(event.target.value))}
        onPointerUp={() => { if (scrub !== null) { jumpTo(scrub); setScrub(null); } }}
        onKeyUp={() => { if (scrub !== null) { jumpTo(scrub); setScrub(null); } }} />}
      <div className="reader-bar__meta"><span>{currentChapter || displayTitle(book.document)}</span><span>{bilingual && translation.total > 0 && (translation.status === "error" ? <button type="button" className="reader-tr-status is-error" onClick={translation.retry}>Translation paused · Retry</button> : <span className="reader-tr-status">{translation.done < translation.total ? `译 ${translation.done}/${translation.total} · ` : ""}</span>)}{original ? `p. ${pageScrub ?? originalPage} / ${originalTotal || "…"}` : <>{isPdf && currentPage ? `p. ${currentPage} · ` : ""}{percent}%</>}</span></div>
    </footer>

    {bookmarked && <button type="button" className="reader-ribbon" aria-label="Bookmarks" onClick={() => { setContentsTab("bookmarks"); setSheet("contents"); }} />}

    {!chrome && !original && <div className="reader-folio" aria-hidden="true"><span>{currentChapter}</span><span>{isPdf && currentPage ? currentPage : `${percent}%`}</span></div>}

    {selection && <div className={`reader-selection is-${selection.dock}`} onPointerDown={(event) => event.preventDefault()}>
      <button type="button" onClick={() => highlight()}><Highlighter size={15} /> Highlight</button>
      <button type="button" onClick={translateSelection}><Languages size={15} /> Translate</button>
      <button type="button" onClick={askAbout}><MessageCircle size={15} /> Ask</button>
    </div>}

    {pdfSelection && original && <div className={`reader-selection is-${pdfSelection.dock}`} onPointerDown={(event) => event.preventDefault()}>
      <button type="button" onClick={() => { setTranslating({ text: pdfSelection.text, context: pdfSelection.context }); clearSelection(); }}><Languages size={15} /> Translate</button>
      <button type="button" onClick={() => { onAssistant("ask", pdfSelection.text, offsetRef.current); clearSelection(); }}><MessageCircle size={15} /> Ask</button>
    </div>}

    {translating && <TranslateCard source={translating.text} context={translating.context} documentId={documentId} stream={stream} onSave={(answer) => saveWord(translating.text, answer, translating.context)} onClose={() => setTranslating(null)} onAsk={() => { onAssistant("ask", translating.text, offsetRef.current); setTranslating(null); }} />}

    {activeMark && popoverMark && <MarkPopover mark={popoverMark} x={activeMark.x} y={activeMark.y}
      onColor={(color) => { updateMarks((current) => current.map((mark) => mark.id === popoverMark.id ? { ...mark, color } : mark)); setActiveMark(null); }}
      onNote={() => { setNoteMark(popoverMark.id); setActiveMark(null); }}
      onDelete={() => { updateMarks((current) => current.filter((mark) => mark.id !== popoverMark.id)); setActiveMark(null); }}
      onClose={() => setActiveMark(null)} />}
    <NoteSheet mark={marks.find((mark) => mark.id === noteMark) ?? null} onSave={(note) => { updateMarks((current) => current.map((mark) => mark.id === noteMark ? { ...mark, note: note.trim() || undefined } : mark)); setNoteMark(null); }} />

    {translationMenu && <>
      <div className="reader-popover-scrim" onPointerDown={() => setTranslationMenu(null)} />
      <div className="reader-popover" style={{ left: translationMenu.x, top: translationMenu.y }}>
        <button type="button" onClick={() => { const target = blocks.find((item) => item.offset === translationMenu.offset); setTranslationMenu(null); if (target) void translation.redo(target).catch((cause) => onError(cause instanceof Error ? cause.message : "Could not translate again.")); }}>Translate again</button>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(translation.translations[translationMenu.offset] ?? ""); setTranslationMenu(null); }}>Copy</button>
      </div>
    </>}

    <SettingsSheet open={sheet === "settings"} onClose={() => setSheet(null)} prefs={prefs} update={setPrefs} pdf={isPdf} />
    <ContentsSheet open={sheet === "contents"} onClose={() => setSheet(null)} chapters={segment.chapters} starts={segment.starts} offset={offset} totalLength={segment.totalLength} marks={marks} bookmarks={bookmarks} initialTab={contentsTab} onJump={jumpTo} onJumpBookmark={jumpBookmark} onRemoveBookmark={(id) => updateBookmarks((current) => current.filter((item) => item.id !== id))} onRebuild={isPdf ? () => void rebuildContents() : undefined} rebuilding={rebuilding} />
  </div>;
}
