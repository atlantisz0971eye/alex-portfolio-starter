"use client";

import { BookmarkPlus, Check, Loader2, MessageCircle, NotebookPen, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { MarkColor, WorkspaceMark } from "../lib/workspaceStore";
import { Sheet } from "./Sheet";

export const MARK_COLORS: MarkColor[] = ["yellow", "green", "blue", "pink"];
export type StreamFn = (body: Record<string, unknown>, onDelta: (text: string) => void, signal: AbortSignal) => Promise<unknown>;

/** Splits a block's text around its highlights. Marks whose text no longer matches are skipped. */
export function renderMarked(text: string, marks: WorkspaceMark[]): ReactNode {
  const valid = marks.filter((mark) => mark.to <= text.length && text.slice(mark.from, mark.to) === mark.text).sort((a, b) => a.from - b.from);
  if (!valid.length) return text;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const mark of valid) {
    if (mark.from < cursor) continue;
    if (mark.from > cursor) nodes.push(text.slice(cursor, mark.from));
    nodes.push(<mark key={mark.id} data-mark={mark.id} className={`hl hl-${mark.color}${mark.note ? " hl-note" : ""}`}>{text.slice(mark.from, mark.to)}</mark>);
    cursor = mark.to;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

type PopoverProps = { mark: WorkspaceMark; x: number; y: number; onColor: (color: MarkColor) => void; onNote: () => void; onDelete: () => void; onClose: () => void };

export function MarkPopover({ mark, x, y, onColor, onNote, onDelete, onClose }: PopoverProps) {
  return <>
    <div className="reader-popover-scrim" onPointerDown={onClose} />
    <div className="reader-popover" style={{ left: x, top: y }}>
      <div className="reader-popover__colors">
        {MARK_COLORS.map((color) => <button key={color} type="button" className={`swatch swatch-${color}`} aria-label={`${color} highlight`} onClick={() => onColor(color)}>{mark.color === color && <Check size={14} />}</button>)}
      </div>
      <button type="button" onClick={onNote} aria-label="Note"><NotebookPen size={18} /></button>
      <button type="button" onClick={onDelete} aria-label="Remove highlight"><Trash2 size={18} /></button>
    </div>
  </>;
}

export function NoteSheet({ mark, onSave }: { mark: WorkspaceMark | null; onSave: (note: string) => void }) {
  const [value, setValue] = useState("");
  useEffect(() => { setValue(mark?.note ?? ""); }, [mark?.id, mark?.note]);
  return <Sheet open={!!mark} onClose={() => onSave(value)} title="Note">
    {mark && <>
      <p className="ws-quote">{mark.text.slice(0, 240)}{mark.text.length > 240 ? "…" : ""}</p>
      <textarea className="ws-note-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Add a note" rows={5} autoFocus />
    </>}
  </Sheet>;
}

type TranslateProps = { source: string; context?: string; documentId: string; stream: StreamFn; onClose: () => void; onAsk: () => void; /** Saves a looked-up word to the Vocabulary note. */ onSave?: (answer: string) => Promise<"saved" | "duplicate"> };

/** A small non-modal card that translates the selected passage without leaving the page. */
export function TranslateCard({ source, context, documentId, stream, onClose, onAsk, onSave }: TranslateProps) {
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "duplicate" | "error">("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let received = "";
    setText("");
    setError("");
    setDone(false);
    setSaved("idle");
    stream({ action: "translate", documentId, selection: source, context }, (delta) => {
      if (controller.signal.aborted) return;
      received += delta;
      setText(received);
    }, controller.signal)
      .then(() => { if (!controller.signal.aborted) setDone(true); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not translate."); });
    return () => controller.abort();
  }, [source, context, documentId, stream, attempt]);

  return <aside className="reader-translate" aria-live="polite">
    <header>
      <span>{source.trim().split(/\s+/).length <= 4 && source.length <= 60 ? "Dictionary" : "Translation"}</span>
      <div>
        <button type="button" onClick={onAsk} aria-label="Ask about this passage"><MessageCircle size={17} /></button>
        <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
    </header>
    <p className="reader-translate__source">{source.slice(0, 160)}{source.length > 160 ? "…" : ""}</p>
    {error
      ? <p className="reader-translate__error">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button></p>
      : text ? <div className="reader-translate__text ws-markdown"><ReactMarkdown>{text}</ReactMarkdown></div> : <p className="reader-translate__wait"><Loader2 className="ws-spin" size={14} /> Translating…</p>}
    {done && onSave && source.trim().split(/\s+/).length <= 4 && source.length <= 60 && <button type="button" className="ws-pill reader-translate__save" disabled={saved === "saving" || saved === "saved" || saved === "duplicate"} onClick={() => { setSaved("saving"); onSave(text).then(setSaved).catch(() => setSaved("error")); }}>
      {saved === "saving" ? <Loader2 className="ws-spin" size={14} /> : saved === "saved" || saved === "duplicate" ? <Check size={15} /> : <BookmarkPlus size={15} />} {saved === "saved" ? "Saved to Vocabulary" : saved === "duplicate" ? "Already in Vocabulary" : saved === "error" ? "Could not save · Try again" : "Save to Vocabulary"}
    </button>}
  </aside>;
}
