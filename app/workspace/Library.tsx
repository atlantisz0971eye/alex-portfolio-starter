"use client";

import { Loader2, Plus } from "lucide-react";
import { useMemo, useRef } from "react";
import type { WorkspaceLibraryItem } from "../lib/workspaceStore";
import type { OcrState } from "./OcrSheet";
import { PageTitle, TopRow } from "./Shell";

type Props = {
  documents: WorkspaceLibraryItem[];
  loading: boolean;
  uploading: boolean;
  ocr: OcrState;
  onOpen: (id: string) => void;
  onAdd: (file: File) => void;
  onSignOut: () => void;
};

const title = (name: string) => name.replace(/\.[^.]+$/, "");
const percentOf = (item: WorkspaceLibraryItem) => item.progress ? Math.min(100, Math.round((item.progress / Math.max(1, item.characterCount)) * 100)) : 0;

/** A quiet typographic cover; the hue comes from the title so each book is recognisable. */
function Cover({ item }: { item: WorkspaceLibraryItem }) {
  let hash = 0;
  for (const char of item.name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return <span className="cover" style={{ background: `linear-gradient(160deg, hsl(${hash} 14% 26%), hsl(${hash} 12% 9%))` }}>
    <span className="cover__title">{title(item.name)}</span>
    <span className="cover__badge">{item.mimeType === "application/pdf" ? "PDF" : "TXT"}</span>
  </span>;
}

export function Library({ documents, loading, uploading, ocr, onOpen, onAdd, onSignOut }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const current = useMemo(() => documents
    .filter((item) => percentOf(item) > 0 && percentOf(item) < 99)
    .sort((a, b) => (b.progressAt ?? "").localeCompare(a.progressAt ?? ""))[0], [documents]);

  return <main className="page">
    <TopRow onSignOut={onSignOut} />
    <div className="page__inner">
      <PageTitle actions={<button type="button" className="ws-round" onClick={() => input.current?.click()} disabled={uploading} aria-label="Add document">{uploading ? <Loader2 className="ws-spin" size={20} /> : <Plus size={22} />}</button>}>Library</PageTitle>
      <input ref={input} type="file" accept=".pdf,.txt,.md,.html,.htm" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAdd(file); event.target.value = ""; }} />
      {uploading && <p className="library__status" role="status"><Loader2 className="ws-spin" size={14} /> Importing and reading the text…</p>}

      {loading ? <div className="grid" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="tile"><span className="cover skeleton" /><span className="skeleton skeleton--line" /></div>)}</div>
        : documents.length === 0 ? <div className="empty">
          <p>Your library is empty.</p>
          <button type="button" className="ws-pill" onClick={() => input.current?.click()}><Plus size={16} /> Add a book</button>
          <small>PDF · TXT · Markdown · HTML, up to 25 MB</small>
        </div> : <>
          {current && <section aria-labelledby="continue-heading">
            <h2 id="continue-heading" className="section-label">Continue reading</h2>
            <button type="button" className="continue" onClick={() => onOpen(current.id)}>
              <Cover item={current} />
              <span className="continue__meta">
                <strong>{title(current.name)}</strong>
                <small>{percentOf(current)}% read{current.pageCount ? ` · ${current.pageCount} pages` : ""}</small>
                <i><b style={{ width: `${percentOf(current)}%` }} /></i>
              </span>
            </button>
          </section>}
          <section aria-labelledby="books-heading">
            <h2 id="books-heading" className="section-label">All books <span>{documents.length}</span></h2>
            <ul className="grid">
              {documents.map((item) => <li key={item.id}>
                <button type="button" className="tile" onClick={() => onOpen(item.id)}>
                  <Cover item={item} />
                  <span className="tile__title">{title(item.name)}</span>
                  <small>{ocr?.running && ocr.docId === item.id ? `Recognizing text ${Math.round((ocr.done / Math.max(1, ocr.total)) * 100)}%` : item.ocrPending?.length ? "Scanned · needs text recognition" : percentOf(item) ? `${percentOf(item)}% read` : "New"}{item.pageCount ? ` · ${item.pageCount} pages` : ""}</small>
                </button>
              </li>)}
            </ul>
          </section>
        </>}
    </div>
  </main>;
}
