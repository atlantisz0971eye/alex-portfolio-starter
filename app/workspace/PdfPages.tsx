"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "pdfjs-dist/web/pdf_viewer.css";

type PdfDocument = import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentProxy;
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

export type PdfSelection = { text: string; context: string; dock: "top" | "bottom" };

type Props = {
  url: string;
  /** Page to land on first (1-based). */
  initialPage: number;
  /** Set to scroll to a page; each request carries a new `seq`. */
  goto: { seq: number; page: number } | null;
  onPage: (page: number, total: number) => void;
  onSelect: (selection: PdfSelection | null) => void;
  onTap: () => void;
};

const MAX_WIDTH = 980;
const KEEP = 3;

// Served from /public (see scripts/copy-pdf-worker.mjs); a variable keeps the bundler from trying to resolve it.
const PDFJS_URL: string = "/pdf.min.mjs";
let loader: Promise<Pdfjs> | null = null;
/** pdf.js is large, so it is loaded the first time a page is shown in its original form. */
function loadPdfjs() {
  loader ??= (import(/* webpackIgnore: true */ PDFJS_URL) as Promise<Pdfjs>).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return pdfjs;
  });
  return loader;
}

/**
 * A PDF shown exactly as printed: every page is drawn from the file itself, so pictures, figures and layout
 * are all there, with an invisible text layer on top so words can still be selected, looked up and translated.
 */
export default function PdfPages({ url, initialPage, goto, onPage, onSelect, onTap }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [pdfjs, setPdfjs] = useState<Pdfjs | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [firstRatio, setFirstRatio] = useState(1.4);
  const [live, setLive] = useState<Set<number>>(new Set());
  const landed = useRef(false);
  const tap = useRef<{ x: number; y: number } | null>(null);
  const callbacks = useRef({ onPage, onSelect, onTap });
  callbacks.current = { onPage, onSelect, onTap };
  const onSize = useCallback((page: number, ratio: number) => setRatios((current) => Math.abs((current[page] ?? 0) - ratio) < 0.001 ? current : { ...current, [page]: ratio }), []);

  useEffect(() => {
    let cancelled = false;
    let opened: PdfDocument | null = null;
    void (async () => {
      try {
        const lib = await loadPdfjs();
        const loaded = await lib.getDocument({ url, withCredentials: true, isEvalSupported: false } as never).promise;
        if (cancelled) { void loaded.destroy(); return; }
        opened = loaded;
        const first = await loaded.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        setFirstRatio(viewport.height / viewport.width);
        setPdfjs(lib);
        setDoc(loaded);
      } catch (error) {
        console.error("The PDF could not be opened", error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; void opened?.destroy(); };
  }, [url]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(MAX_WIDTH, Math.max(240, el.clientWidth - 24)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = doc?.numPages ?? 0;
  const heightOf = (page: number) => Math.round(width * (ratios[page] ?? firstRatio));

  // Pages near the view are drawn; far ones are released, so a long book does not fill the memory.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !total) return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const page = Number((entry.target as HTMLElement).dataset.page);
        if (entry.isIntersecting) visible.add(page); else visible.delete(page);
      }
      const next = new Set<number>();
      visible.forEach((page) => { for (let d = -1; d <= 1; d += 1) if (page + d >= 1 && page + d <= total) next.add(page + d); });
      setLive((current) => {
        const merged = new Set(next);
        // Keep recently drawn neighbours for a moment so scrolling back is instant.
        current.forEach((page) => { if ([...next].some((near) => Math.abs(near - page) <= KEEP)) merged.add(page); });
        return merged;
      });
    }, { root, rootMargin: "120% 0px" });
    root.querySelectorAll("[data-page]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [total, width, ratios]);

  // Which page is in view, for the position display and for saving progress.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !total) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const middle = root.scrollTop + root.clientHeight * 0.35;
        let current = 1;
        root.querySelectorAll<HTMLElement>("[data-page]").forEach((node) => { if (node.offsetTop <= middle) current = Number(node.dataset.page); });
        callbacks.current.onPage(current, total);
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => { root.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [total, width]);

  const scrollToPage = useCallback((page: number, smooth: boolean) => {
    const root = scroller.current;
    const node = root?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (root && node) root.scrollTo({ top: node.offsetTop - 12, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (!total || !width || landed.current) return;
    landed.current = true;
    const first = Math.min(Math.max(1, initialPage), total);
    scrollToPage(first, false);
    callbacks.current.onPage(first, total);
  }, [total, width, initialPage, scrollToPage]);
  const lastGoto = useRef(0);
  useEffect(() => {
    if (!goto || goto.seq === lastGoto.current || !total) return;
    lastGoto.current = goto.seq;
    scrollToPage(Math.min(Math.max(1, goto.page), total), true);
  }, [goto, total, scrollToPage]);

  // Selecting words in the text layer.
  useEffect(() => {
    const onChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const root = scroller.current;
      if (!selection || !text || !selection.rangeCount || !root?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        callbacks.current.onSelect(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const layer = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest(".textLayer");
      const whole = layer?.textContent ?? "";
      const at = Math.max(0, whole.indexOf(text.slice(0, 40)));
      const rect = range.getBoundingClientRect();
      callbacks.current.onSelect({ text: text.slice(0, 6000), context: whole.slice(Math.max(0, at - 400), at + text.length + 400), dock: rect.top + rect.height / 2 > window.innerHeight * 0.5 ? "top" : "bottom" });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  if (failed) return <div className="pdf-original pdf-original--note"><p>This PDF could not be shown in its original form on this device.</p></div>;
  return <div className="pdf-original" ref={scroller}
    onPointerDown={(event) => { tap.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={(event) => {
      const start = tap.current;
      tap.current = null;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8 && !window.getSelection()?.toString().trim()) callbacks.current.onTap();
    }}>
    {!doc && <p className="pdf-original__loading"><Loader2 className="ws-spin" size={16} /> Opening the PDF…</p>}
    {doc && pdfjs && Array.from({ length: total }, (_, index) => index + 1).map((page) => <PdfPage key={page} doc={doc} pdfjs={pdfjs} page={page} width={width} height={heightOf(page)} live={live.has(page)} onSize={onSize} />)}
  </div>;
}

type PageProps = { doc: PdfDocument; pdfjs: Pdfjs; page: number; width: number; height: number; live: boolean; onSize: (page: number, ratio: number) => void };

function PdfPage({ doc, pdfjs, page, width, height, live, onSize }: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!live || !width) { setReady(false); return; }
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    let layer: { cancel: () => void } | null = null;
    void (async () => {
      try {
        const proxy = await doc.getPage(page);
        if (cancelled) return;
        const base = proxy.getViewport({ scale: 1 });
        const scale = width / base.width;
        onSize(page, base.height / base.width);
        const viewport = proxy.getViewport({ scale });
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        const render = proxy.render({ canvasContext: context, viewport: proxy.getViewport({ scale: scale * ratio }), canvas } as never);
        task = render;
        const container = textRef.current;
        if (container) {
          container.replaceChildren();
          container.style.setProperty("--total-scale-factor", String(scale));
          const textLayer = new pdfjs.TextLayer({ textContentSource: proxy.streamTextContent(), container, viewport });
          layer = textLayer;
          await textLayer.render();
        }
        await render.promise;
        if (!cancelled) setReady(true);
      } catch {
        // A cancelled render rejects; anything else leaves the page blank until it is scrolled back into view.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
      const canvas = canvasRef.current;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      textRef.current?.replaceChildren();
    };
  }, [doc, pdfjs, page, width, live, onSize]);

  return <div className={`pdf-page${ready ? " is-ready" : ""}`} data-page={page} style={{ width, height }}>
    <canvas ref={canvasRef} style={{ width, height }} />
    <div ref={textRef} className="textLayer pdf-text" />
    <span className="pdf-page__num" aria-hidden="true">{page}</span>
  </div>;
}
