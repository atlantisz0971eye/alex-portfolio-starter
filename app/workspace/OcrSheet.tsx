"use client";

import { Loader2, ScanText } from "lucide-react";
import type { WorkspaceDocument } from "../lib/workspaceStore";
import { Sheet } from "./Sheet";

export type OcrState = { docId: string; total: number; done: number; running: boolean; error?: string; finished?: boolean } | null;

type Props = {
  open: boolean;
  onClose: () => void;
  document: WorkspaceDocument;
  state: OcrState;
  onStart: () => void;
  onStop: () => void;
};

/** Offers text recognition for scanned pages and shows its progress. Safe to close: the job keeps running. */
export function OcrSheet({ open, onClose, document, state, onStart, onStop }: Props) {
  const mine = state && state.docId === document.id ? state : null;
  const pending = document.ocrPending?.length ?? 0;
  const percent = mine && mine.total ? Math.round((mine.done / mine.total) * 100) : 0;
  return <Sheet open={open} onClose={onClose} title="Recognize text" size="compact">
    <div className="ocr">
      <p className="ocr__lead"><ScanText size={18} /> {mine?.finished || (!pending && !mine?.running) ? "All pages now have text." : `${mine?.running ? mine.total - mine.done : pending} of ${document.pageCount ?? "?"} pages are scans with no selectable text.`}</p>
      {mine?.running && <div className="ocr__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div>}
      {mine?.running && <p className="ocr__status"><Loader2 className="ws-spin" size={14} /> Recognizing… {mine.done} / {mine.total} pages. You can close this and keep reading.</p>}
      {mine?.error && <p className="ocr__error">{mine.error}</p>}
      {!mine?.running && pending > 0 && <>
        <button type="button" className="ws-pill ws-pill--solid" onClick={onStart}>{mine?.done ? "Continue" : "Recognize text"}</button>
        <p className="ws-note">Page images are sent to Google Cloud Vision to read the text. The first 1,000 pages each month are free; after that it costs about US$1.50 per 1,000 pages. Text is saved to your private library, so this is only needed once per book.</p>
      </>}
      {mine?.running && <button type="button" className="ws-pill" onClick={onStop}>Pause</button>}
    </div>
  </Sheet>;
}
