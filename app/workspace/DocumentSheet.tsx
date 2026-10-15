"use client";

import { BookOpen, ExternalLink, FileSearch, Loader2, RefreshCw, ScanText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkspaceLibraryItem } from "../lib/workspaceStore";
import type { OcrState } from "./OcrSheet";
import { Sheet } from "./Sheet";

export type DocumentActions = {
  open: (id: string) => void;
  rename: (id: string, name: string) => Promise<void>;
  rescan: (id: string) => Promise<{ emptyPages: number; totalPages: number | null }>;
  reextract: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  ocr: (id: string, pages: number[]) => void;
};

type Props = { document: WorkspaceLibraryItem | null; ocr: OcrState; actions: DocumentActions; onClose: () => void };
type Busy = "rename" | "rescan" | "reextract" | "delete" | null;

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, "");

/** Manage one imported file: rename, re-check for scanned pages, run OCR, re-read the original, or delete. */
export function DocumentSheet({ document, ocr, actions, onClose }: Props) {
  const [last, setLast] = useState<WorkspaceLibraryItem | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [confirm, setConfirm] = useState<"reextract" | "delete" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (document) { setLast(document); setTitle(stripExtension(document.name)); setConfirm(null); setNote(""); }
  }, [document?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (document) setLast(document); }, [document]);

  const shown = document ?? last;
  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(kind);
    try { await work(); } finally { setBusy(null); setConfirm(null); }
  };

  const mine = shown && ocr && ocr.docId === shown.id ? ocr : null;
  const pending = shown?.ocrPending?.length ?? 0;
  const changed = shown ? title.trim() !== stripExtension(shown.name) && title.trim().length > 0 : false;

  return <Sheet open={!!document} onClose={onClose} title="Document" size="tall">
    {shown && <div className="doc">
      <label className="doc__title">
        <span>Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={170} aria-label="Title" />
        {changed && <button type="button" className="ws-pill ws-pill--solid" disabled={busy !== null} onClick={() => void run("rename", () => actions.rename(shown.id, title))}>{busy === "rename" ? <Loader2 className="ws-spin" size={14} /> : "Save"}</button>}
      </label>
      <p className="doc__meta">{shown.mimeType === "application/pdf" ? "PDF" : "Text"}{shown.pageCount ? ` · ${shown.pageCount} pages` : ""} · {Math.round(shown.characterCount / 1000)}k characters · {pending ? `${pending} pages have no text` : "text ready"}</p>

      <div className="doc__group">
        <button type="button" onClick={() => { onClose(); actions.open(shown.id); }}><BookOpen size={18} /> Open</button>
        {shown.mimeType === "application/pdf" && <a href={`/api/workspace/documents/${shown.id}/file`} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Open original PDF</a>}
      </div>

      {shown.mimeType === "application/pdf" && <div className="doc__group">
        <button type="button" disabled={busy !== null || !!mine?.running} onClick={() => void run("rescan", async () => {
          const result = await actions.rescan(shown.id);
          setNote(result.emptyPages ? `${result.emptyPages} of ${result.totalPages ?? "?"} pages have no text. You can recognize them below.` : "Every page already has text.");
        })}>{busy === "rescan" ? <Loader2 className="ws-spin" size={18} /> : <FileSearch size={18} />} Check for scanned pages</button>
        {pending > 0 && !mine?.running && <button type="button" onClick={() => actions.ocr(shown.id, shown.ocrPending ?? [])}><ScanText size={18} /> {mine?.done ? "Continue recognizing" : `Recognize text on ${pending} pages`}</button>}
      </div>}
      {mine?.running && <div className="ocr__bar" role="progressbar" aria-valuenow={Math.round((mine.done / Math.max(1, mine.total)) * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.round((mine.done / Math.max(1, mine.total)) * 100)}%` }} /></div>}
      {mine?.running && <p className="ocr__status"><Loader2 className="ws-spin" size={14} /> Recognizing… {mine.done} / {mine.total} pages</p>}
      {pending > 0 && !mine?.running && <p className="ws-note">Page images are sent to Google Cloud Vision. The first 1,000 pages each month are free.</p>}
      {note && <p className="doc__note" role="status">{note}</p>}

      <div className="doc__group">
        {confirm === "reextract"
          ? <div className="doc__confirm"><p>Read the original file again and replace the saved text? Your reading position stays, highlights may move, and recognized text is lost.</p><div><button type="button" className="ws-pill" disabled={busy !== null} onClick={() => void run("reextract", async () => { await actions.reextract(shown.id); setNote("The file was read again."); })}>{busy === "reextract" ? <Loader2 className="ws-spin" size={14} /> : "Re-read file"}</button><button type="button" className="ws-text-button" onClick={() => setConfirm(null)}>Cancel</button></div></div>
          : <button type="button" disabled={busy !== null} onClick={() => setConfirm("reextract")}><RefreshCw size={18} /> Re-read the original file</button>}
        {confirm === "delete"
          ? <div className="doc__confirm"><p>Delete “{stripExtension(shown.name)}” and everything saved with it: text, highlights and notes?</p><div><button type="button" className="ws-pill ws-pill--danger" disabled={busy !== null} onClick={() => void run("delete", async () => { await actions.remove(shown.id); onClose(); })}>{busy === "delete" ? <Loader2 className="ws-spin" size={14} /> : "Delete permanently"}</button><button type="button" className="ws-text-button" onClick={() => setConfirm(null)}>Cancel</button></div></div>
          : <button type="button" className="is-danger" disabled={busy !== null} onClick={() => setConfirm("delete")}><Trash2 size={18} /> Delete</button>}
      </div>
    </div>}
  </Sheet>;
}
