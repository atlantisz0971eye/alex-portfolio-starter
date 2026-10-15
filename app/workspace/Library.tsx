"use client";

import { FileText, Loader2, LogOut, Plus } from "lucide-react";
import { useRef, type ReactNode } from "react";
import type { WorkspaceLibraryItem } from "../lib/workspaceStore";

type Props = {
  documents: WorkspaceLibraryItem[];
  loading: boolean;
  uploading: boolean;
  onOpen: (id: string) => void;
  onAdd: (file: File) => void;
  onSignOut: () => void;
  tabs: ReactNode;
};

const title = (name: string) => name.replace(/\.[^.]+$/, "");

export function Library({ documents, loading, uploading, onOpen, onAdd, onSignOut, tabs }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return <main className="library">
    <header className="library__head">
      <a href="/" className="ws-text-button">Portfolio</a>
      <button type="button" className="ws-text-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
    </header>
    {tabs}
    <div className="library__title">
      <h1>Library</h1>
      <button type="button" className="ws-round" onClick={() => input.current?.click()} disabled={uploading} aria-label="Add document">{uploading ? <Loader2 className="ws-spin" size={20} /> : <Plus size={22} />}</button>
      <input ref={input} type="file" accept=".pdf,.txt,.md,.html,.htm" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAdd(file); event.target.value = ""; }} />
    </div>
    {uploading && <p className="library__status"><Loader2 className="ws-spin" size={14} /> Importing and reading the text…</p>}
    {loading ? <p className="library__empty"><Loader2 className="ws-spin" size={18} /></p> : documents.length === 0 ? <div className="library__empty">
      <p>Your library is empty.</p>
      <button type="button" className="ws-pill" onClick={() => input.current?.click()}><Plus size={16} /> Add a book</button>
      <small>PDF · TXT · Markdown · HTML, up to 25 MB</small>
    </div> : <ul className="library__list">
      {documents.map((document) => {
        const percent = document.progress ? Math.min(100, Math.round((document.progress / Math.max(1, document.characterCount)) * 100)) : 0;
        return <li key={document.id}>
          <button type="button" onClick={() => onOpen(document.id)}>
            <span className="library__icon"><FileText size={22} /></span>
            <span className="library__meta">
              <strong>{title(document.name)}</strong>
              <small>{document.mimeType === "application/pdf" ? "PDF" : "Text"}{document.pageCount ? ` · ${document.pageCount} pages` : ""}{percent ? ` · ${percent}% read` : " · New"}</small>
              {percent > 0 && <i style={{ width: `${percent}%` }} />}
            </span>
          </button>
        </li>;
      })}
    </ul>}
  </main>;
}
