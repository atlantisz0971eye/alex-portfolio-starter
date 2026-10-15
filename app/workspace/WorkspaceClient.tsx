"use client";

import { upload } from "@vercel/blob/client";
import {
  ArrowLeft, ArrowRight, BookOpen, Check, FileText, FolderOpen,
  Languages, Loader2, LockKeyhole, LogOut, MessageCircle, PanelRightClose,
  PanelRightOpen, Plus, Send, Sparkles, UploadCloud, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { WorkspaceDocument } from "../lib/workspaceStore";

type Props = { authorized: boolean; configured: boolean };
type LoadedDocument = { document: WorkspaceDocument; text: string; section: number; sectionCount: number };

const errors: Record<string, string> = {
  unauthorized: "Session expired. Sign in again.",
  storage_not_configured: "Private storage is not connected yet.",
  ai_not_configured: "DeepSeek is not configured yet.",
  no_extractable_text: "No readable text found. Scanned PDFs need OCR support.",
  unsupported_format: "Supported formats: PDF, TXT, Markdown and HTML.",
  invalid_pdf: "This file is not a valid PDF.",
  pdf_encrypted: "This PDF is password-protected. Remove the password and upload it again.",
  pdf_unreadable: "This PDF is damaged or uses an unsupported structure, so its text could not be read.",
  file_too_large: "Maximum file size: 25 MB.",
  file_not_found: "The upload did not reach storage. Try again.",
  already_exists: "This upload was already processed.",
  storage_failed: "Private storage failed while saving. Nothing was kept; try again.",
  not_found: "That document no longer exists.",
  invalid_request: "The request was not valid. Reload the page and try again.",
  rate_limited: "Too many requests. Try again shortly.",
  processing_failed: "Could not process this document. Check the file and try again.",
  assistant_failed: "The assistant could not complete this request. Try again.",
  upload_failed: "Upload failed. Try again.",
  invalid_access_key: "Invalid access key.",
};

async function parseResponse<T>(response: Response): Promise<T> {
  let data: { error?: string } | null = null;
  try {
    data = await response.json();
  } catch {
    // Platform errors such as gateway timeouts are not JSON.
  }
  if (!response.ok) {
    if (data?.error && errors[data.error]) throw new Error(errors[data.error]);
    if (response.status === 504 || response.status === 408) throw new Error("This took too long to process. Large or complex files may need another try.");
    if (response.status === 413) throw new Error("The request was too large.");
    throw new Error(`Something went wrong (${response.status}). Try again.`);
  }
  return data as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(new Date(value));
}

function readingBlocks(text: string) {
  return text.split(/\n{2,}/).flatMap((section) => {
    const trimmed = section.trim();
    if (!trimmed) return [];
    if (trimmed.length <= 2500) return [trimmed];
    const lines = trimmed.split(/\n|(?<=[.!?])\s+(?=[A-Z])/);
    const blocks: string[] = [];
    let current = "";
    for (const line of lines) {
      if (current.length + line.length > 1800 && current) {
        blocks.push(current.trim());
        current = "";
      }
      if (line.length > 2500) {
        for (let start = 0; start < line.length; start += 1800) blocks.push(line.slice(start, start + 1800));
      } else {
        current += `${current ? "\n" : ""}${line}`;
      }
    }
    if (current.trim()) blocks.push(current.trim());
    return blocks;
  });
}

function Login({ configured }: { configured: boolean }) {
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await parseResponse(await fetch("/api/workspace/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey }),
      }));
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return <main className="workspace-login">
    <div className="workspace-login__glow" />
    <a className="workspace-back workspace-dot-link" href="/" aria-label="Back to Portfolio" title="Back to Portfolio"><span className="workspace-dot-link__content"><ArrowLeft size={15} /> Portfolio</span></a>
    <div className="workspace-login__content">
      <p className="workspace-eyebrow">ALEX / PRIVATE</p>
      <h1>Workspace</h1>
      {configured ? <form onSubmit={enter} className="workspace-login__form">
        <label htmlFor="workspace-key">Access key</label>
        <div className="workspace-login__input"><LockKeyhole size={18} /><input id="workspace-key" type="password" autoComplete="current-password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder="Enter access key" required /></div>
        {error && <p className="workspace-error" role="alert">{error}</p>}
        <button type="submit" className="workspace-dot-action workspace-login__submit" aria-label="Enter Workspace" title="Enter Workspace" disabled={busy || !accessKey}><span className="workspace-dot-action__content">{busy ? <Loader2 className="workspace-spin" size={18} /> : <>Enter <ArrowRight size={17} /></>}</span></button>
      </form> : <p className="workspace-setup-note">Access is not configured yet.</p>}
    </div>
  </main>;
}

export default function WorkspaceClient({ authorized, configured }: Props) {
  if (!authorized) return <Login configured={configured} />;
  return <Reader />;
}

function Reader() {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [active, setActive] = useState<LoadedDocument | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [busy, setBusy] = useState<"upload" | "guide" | "ask" | "translate" | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"text" | "original">("text");
  const [selection, setSelection] = useState("");
  const [translation, setTranslation] = useState("");
  const [question, setQuestion] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<"library" | "reader" | "assistant">("library");
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      const data = await parseResponse<{ documents: WorkspaceDocument[] }>(await fetch("/api/workspace/documents", { cache: "no-store" }));
      setDocuments(data.documents);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the library.");
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // iOS keeps 100dvh unchanged when the keyboard opens, which would hide the
  // question box. Track the visual viewport so the layout shrinks with it.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--ws-vh", `${viewport.height}px`);
      if (viewport.offsetTop > 0) window.scrollTo(0, 0);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      root.style.removeProperty("--ws-vh");
    };
  }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [active?.document.messages?.length]);

  async function openDocument(id: string, section = 0) {
    setLoadingSection(true);
    setError("");
    setSelection("");
    setTranslation("");
    setView("text");
    try {
      const data = await parseResponse<LoadedDocument>(await fetch(`/api/workspace/documents?id=${encodeURIComponent(id)}&section=${section}`, { cache: "no-store" }));
      setActive(data);
      setPanelOpen(true);
      setMobileSection("reader");
      document.querySelector(".workspace-reader__scroll")?.scrollTo({ top: 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the document.");
    } finally {
      setLoadingSection(false);
    }
  }

  async function addFile(file: File) {
    if (busy) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "txt", "md", "html", "htm"].includes(extension)) {
      setError(errors.unsupported_format);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Maximum file size: 25 MB.");
      return;
    }
    setBusy("upload");
    setError("");
    try {
      const id = crypto.randomUUID();
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
      const pathname = `workspace/files/${id}/${safeName}`;
      const type = extension === "pdf" ? "application/pdf" : extension === "md" ? "text/markdown" : extension.startsWith("htm") ? "text/html" : "text/plain";
      const blob = await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/workspace/upload",
        contentType: type,
        multipart: file.size > 10 * 1024 * 1024,
      });
      const data = await parseResponse<LoadedDocument>(await fetch("/api/workspace/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pathname: blob.pathname, name: file.name }),
      }));
      setActive(data);
      setPanelOpen(true);
      setDocuments((current) => [data.document, ...current]);
      setMobileSection("reader");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/network|fetch|failed to upload/i.test(message) ? "Upload interrupted. Check your connection and try again." : message || errors.upload_failed);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function assistant(action: "guide" | "ask" | "translate") {
    if (!active || busy) return;
    setBusy(action);
    setError("");
    try {
      const data = await parseResponse<{ answer: string; coverage?: "full" | "excerpts"; messages?: WorkspaceDocument["messages"] }>(await fetch("/api/workspace/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, documentId: active.document.id, question, selection }),
      }));
      if (action === "guide") {
        const document = { ...active.document, guide: data.answer, guideCoverage: data.coverage };
        setActive({ ...active, document });
        setDocuments((current) => current.map((item) => item.id === document.id ? document : item));
      } else if (action === "translate") {
        setTranslation(data.answer);
        setMobileSection("assistant");
      } else {
        setActive({ ...active, document: { ...active.document, messages: data.messages } });
        setQuestion("");
        setMobileSection("assistant");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : errors.assistant_failed);
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    await fetch("/api/workspace/session", { method: "DELETE" });
    window.location.reload();
  }

  const paragraphs = active ? readingBlocks(active.text) : [];

  return <div className={`workspace-shell ${panelOpen ? "" : "workspace-shell--panel-closed"}`}>
    <div className="workspace-atmosphere" aria-hidden="true" />
    <header className="workspace-header">
      <a href="/" className="workspace-brand workspace-dot-link" aria-label="Back to Portfolio" title="Back to Portfolio">
        <span className="workspace-dot-link__content"><ArrowLeft size={15} /> Portfolio</span>
      </a>
      <span className="workspace-header__title">Workspace</span>
      <div className="workspace-header__actions">
        <span className="workspace-private"><LockKeyhole size={12} /> PRIVATE</span>
        <button type="button" className="workspace-dot-action workspace-icon-only" onClick={logout} aria-label="Sign out" title="Sign out">
          <span className="workspace-dot-action__content"><LogOut size={15} /> Sign out</span>
        </button>
      </div>
    </header>

    <aside className={`workspace-library ${mobileSection === "library" ? "is-mobile-active" : ""}`}>
      <div className="workspace-library__top">
        <p className="workspace-eyebrow">INDEX</p>
        <h2>Library <span>{documents.length.toString().padStart(2, "0")}</span></h2>
      </div>
      <button type="button" className="workspace-dot-action workspace-upload" onClick={() => inputRef.current?.click()} aria-label={busy === "upload" ? "Processing document" : "Add document"} title="Add document" disabled={busy === "upload"}>
        <span className="workspace-dot-action__content">{busy === "upload" ? <Loader2 className="workspace-spin" size={17} /> : <Plus size={17} />} {busy === "upload" ? "Processing…" : "Add document"}</span>
      </button>
      <input ref={inputRef} type="file" accept=".pdf,.txt,.md,.html,.htm" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void addFile(file); }} />
      <div className="workspace-library__label"><FolderOpen size={14} /> DOCUMENTS</div>
      <div className="workspace-document-list">
        {loadingLibrary ? <div className="workspace-list-empty"><Loader2 className="workspace-spin" size={18} /> Loading</div> : documents.length ? documents.map((document) =>
          <div key={document.id} className={`workspace-document ${active?.document.id === document.id ? "is-active" : ""}`} onClick={() => void openDocument(document.id)}>
            <FileText size={18} />
            <div className="workspace-document__meta"><strong>{document.name}</strong><small>{formatDate(document.createdAt)} · {document.pageCount ? `${document.pageCount} pages` : `${Math.max(1, Math.round(document.characterCount / 1000))}k characters`}</small></div>
            <button type="button" className="workspace-dot-action workspace-document__open" aria-label={`Open ${document.name}`} title={`Open ${document.name}`}><span className="workspace-dot-action__content"><ArrowRight size={14} /> Open</span></button>
          </div>
        ) : <div className="workspace-list-empty"><span>No documents yet.</span></div>}
      </div>
      <div className="workspace-library__bottom"><span className="workspace-status-dot" /> DEEPSEEK <span>READY</span></div>
    </aside>

    <main className={`workspace-reader ${mobileSection === "reader" ? "is-mobile-active" : ""}`}>
      {active ? <>
        <div className="workspace-reader__toolbar">
          <div><p className="workspace-eyebrow">{active.document.mimeType === "application/pdf" ? "PDF" : "TEXT"} / DOCUMENT</p><h1>{active.document.name}</h1></div>
          <div className="workspace-reader__controls">
            <div className="workspace-segmented">
              <button type="button" className={`workspace-dot-action ${view === "text" ? "is-active" : ""}`} aria-label="Text view" title="Text view" onClick={() => setView("text")}><span className="workspace-dot-action__content">Text</span></button>
              {active.document.mimeType === "application/pdf" && <button type="button" className={`workspace-dot-action ${view === "original" ? "is-active" : ""}`} aria-label="Original PDF" title="Original PDF" onClick={() => setView("original")}><span className="workspace-dot-action__content">PDF</span></button>}
            </div>
            <button type="button" className="workspace-dot-action workspace-panel-toggle" aria-label={panelOpen ? "Hide assistant" : "Show assistant"} title={panelOpen ? "Hide assistant" : "Show assistant"} onClick={() => setPanelOpen(!panelOpen)}><span className="workspace-dot-action__content">{panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />} Assistant</span></button>
          </div>
        </div>
        {view === "original" ? <iframe className="workspace-pdf" title={active.document.name} src={`/api/workspace/documents/${active.document.id}/file`} /> : <div className="workspace-reader__scroll"><div className="workspace-paper"><p className="workspace-paper__label">SOURCE TEXT <span>·</span> SELECT A PARAGRAPH TO TRANSLATE</p>{paragraphs.map((paragraph, index) => <div role="button" tabIndex={0} aria-pressed={selection === paragraph} key={`${active.document.id}-${index}`} className={`workspace-paragraph ${selection === paragraph ? "is-selected" : ""}`} onClick={() => { if (window.getSelection()?.toString()) return; setSelection(paragraph); setTranslation(""); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelection(paragraph); setTranslation(""); } }}>{paragraph}</div>)}</div></div>}
        {view === "text" && active.sectionCount > 1 && <nav className="workspace-sections" aria-label="Reading sections">
          <button type="button" className="workspace-dot-action" aria-label="Previous section" title="Previous section" disabled={loadingSection || !!busy || active.section === 0} onClick={() => void openDocument(active.document.id, active.section - 1)}><span className="workspace-dot-action__content"><ArrowLeft size={15} /> Previous</span></button>
          <span aria-live="polite">{loadingSection ? "Loading…" : `Section ${active.section + 1} / ${active.sectionCount}`}</span>
          <button type="button" className="workspace-dot-action" aria-label="Next section" title="Next section" disabled={loadingSection || !!busy || active.section + 1 >= active.sectionCount} onClick={() => void openDocument(active.document.id, active.section + 1)}><span className="workspace-dot-action__content"><ArrowRight size={15} /> Next</span></button>
        </nav>}
        {selection && view === "text" && <div className="workspace-selection">
          <span><Check size={14} /> PARAGRAPH SELECTED</span>
          <button type="button" className="workspace-dot-action" aria-label="Translate paragraph" title="Translate paragraph" onClick={() => void assistant("translate")} disabled={busy === "translate"}><span className="workspace-dot-action__content">{busy === "translate" ? <Loader2 className="workspace-spin" size={16} /> : <Languages size={16} />} Translate</span></button>
          <button type="button" className="workspace-dot-action" onClick={() => { setSelection(""); setTranslation(""); }} aria-label="Clear selection" title="Clear selection"><span className="workspace-dot-action__content"><X size={15} /> Clear</span></button>
        </div>}
      </> : <div className="workspace-welcome">
        <p className="workspace-eyebrow">READER</p>
        <p className="workspace-welcome__state">No document selected.</p>
        <button type="button" className="workspace-dot-action workspace-welcome__upload" onClick={() => inputRef.current?.click()} aria-label="Add document" title="Add document"><span className="workspace-dot-action__content"><UploadCloud size={17} /> Add document</span></button>
        <small>PDF · TXT · MD · HTML / 25 MB MAX</small>
      </div>}
    </main>

    {panelOpen && <aside className={`workspace-assistant ${mobileSection === "assistant" ? "is-mobile-active" : ""}`}>
      <div className="workspace-assistant__head"><div><p className="workspace-eyebrow">ASSISTANT</p><h2>DeepSeek</h2></div></div>
      {active ? <div className="workspace-assistant__scroll">
        <section className="workspace-guide">
          <div className="workspace-guide__head"><span><BookOpen size={16} /> Reading guide</span><small>{active.document.guideCoverage === "excerpts" ? "Based on excerpts" : active.document.guideCoverage === "full" ? "Based on full text" : "Not generated"}</small></div>
          {active.document.guide ? <div className="workspace-markdown"><ReactMarkdown>{active.document.guide}</ReactMarkdown></div> : <><p>Key arguments and reading structure.</p><button type="button" className="workspace-dot-action" aria-label="Generate reading guide" title="Generate reading guide" onClick={() => void assistant("guide")} disabled={busy === "guide"}><span className="workspace-dot-action__content">{busy === "guide" ? <Loader2 className="workspace-spin" size={16} /> : <Sparkles size={16} />} Generate</span></button></>}
        </section>
        {translation && <section className="workspace-translation"><span><Languages size={16} /> Translation</span><p>{translation}</p></section>}
        <div className="workspace-conversation">
          <div className="workspace-conversation__label"><MessageCircle size={15} /> DISCUSSION</div>
          {active.document.messages?.length ? active.document.messages.map((message, index) => <div key={index} className={`workspace-message workspace-message--${message.role}`}><span>{message.role === "assistant" ? "DEEPSEEK" : "YOU"}</span><div className="workspace-markdown"><ReactMarkdown>{message.content}</ReactMarkdown></div></div>) : <div className="workspace-conversation__empty">Ask about this document.</div>}
          <div ref={chatEndRef} />
        </div>
      </div> : <div className="workspace-assistant__empty"><p>Select a document to begin.</p></div>}
      {active && <form className="workspace-question" onSubmit={(event) => { event.preventDefault(); void assistant("ask"); }}>
        <label htmlFor="workspace-question">ASK DEEPSEEK</label>
        <div><textarea id="workspace-question" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this document…" /><button type="submit" className="workspace-dot-action" title="Send question" disabled={!question.trim() || !!busy} aria-label="Send question"><span className="workspace-dot-action__content">{busy === "ask" ? <Loader2 className="workspace-spin" size={16} /> : <Send size={16} />} Send</span></button></div>
        <small>Check important details against the source.</small>
      </form>}
    </aside>}

    {error && <div className="workspace-toast" role="alert"><span>{error}</span><button type="button" className="workspace-dot-action" aria-label="Dismiss message" title="Dismiss message" onClick={() => setError("")}><span className="workspace-dot-action__content"><X size={15} /></span></button></div>}
    <nav className="workspace-mobile-nav" aria-label="Workspace sections">
      <button type="button" className={`workspace-dot-action ${mobileSection === "library" ? "is-active" : ""}`} aria-label="Library" title="Library" onClick={() => setMobileSection("library")}><span className="workspace-dot-action__content"><FolderOpen size={16} /> Library</span></button>
      <button type="button" className={`workspace-dot-action ${mobileSection === "reader" ? "is-active" : ""}`} aria-label="Reader" title="Reader" onClick={() => setMobileSection("reader")}><span className="workspace-dot-action__content"><BookOpen size={16} /> Reader</span></button>
      <button type="button" className={`workspace-dot-action ${mobileSection === "assistant" ? "is-active" : ""}`} aria-label="Assistant" title="Assistant" onClick={() => { setPanelOpen(true); setMobileSection("assistant"); }}><span className="workspace-dot-action__content"><Sparkles size={16} /> Assistant</span></button>
    </nav>
  </div>;
}
