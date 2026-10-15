"use client";

import { upload } from "@vercel/blob/client";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceDocument, WorkspaceLibraryItem } from "../lib/workspaceStore";
import { AssistantSheet, type AssistantIntent } from "./AssistantSheet";
import BookReader, { type OpenedBook } from "./BookReader";
import { errors, parseResponse, streamNdjson } from "./api";
import { Library } from "./Library";
import { OcrSheet, type OcrState } from "./OcrSheet";
import { Calendar } from "./Calendar";
import { GlobalAssistant } from "./GlobalAssistant";
import { Mail } from "./Mail";
import { Sidebar, TabBar, type Tab } from "./Shell";

type Props = { authorized: boolean; configured: boolean };

const GLASS_LIGHT = ".ws-pill, .ws-round, .mail-chips button, .mail-chips a, .ef__cats button, .ef__days button, .sidebar__assistant, .sidebar__nav button, .ws-segment button, .mail-search, .ws-card, .continue";

const MAIL_NOTES: Record<string, string> = {
  too_many_accounts: "Two Gmail accounts are already connected. Disconnect one first.",
  denied: "Gmail access was not granted.",
  invalid_state: "The Gmail sign-in expired. Try connecting again.",
  not_configured: "Mail is not set up yet.",
  failed: "Could not connect Gmail. Try again.",
};

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

  return <main className="login">
    <a className="ws-text-button login__back" href="/"><ArrowLeft size={16} /> Portfolio</a>
    <div className="login__content">
      <h1>Workspace</h1>
      <p>Private reading room</p>
      {configured ? <form onSubmit={enter}>
        <input id="workspace-key" type="password" autoComplete="current-password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder="Access key" aria-label="Access key" required />
        {error && <p className="login__error" role="alert">{error}</p>}
        <button type="submit" className="ws-pill ws-pill--solid" disabled={busy || !accessKey}>{busy ? <Loader2 className="ws-spin" size={18} /> : "Enter"}</button>
      </form> : <p className="login__note">Access is not configured yet.</p>}
    </div>
  </main>;
}

export default function WorkspaceClient({ authorized, configured }: Props) {
  // Track the visual viewport: iOS keeps 100dvh unchanged when the keyboard opens.
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--ws-vh", `${viewport?.height ?? window.innerHeight}px`);
      if (viewport && viewport.offsetTop > 0) window.scrollTo(0, 0);
    };
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      root.style.removeProperty("--ws-vh");
    };
  }, []);
  // The highlight on glass controls follows the pointer, like light moving across a pane.
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const target = (event.target as Element).closest<HTMLElement>(GLASS_LIGHT);
    if (!target) return;
    const box = target.getBoundingClientRect();
    target.style.setProperty("--mx", `${((event.clientX - box.left) / Math.max(1, box.width)) * 100}%`);
    target.style.setProperty("--my", `${((event.clientY - box.top) / Math.max(1, box.height)) * 100}%`);
  };
  return <div className="ws-root" onPointerMove={onPointerMove}>{authorized ? <App /> : <Login configured={configured} />}</div>;
}

function App() {
  const [documents, setDocuments] = useState<WorkspaceLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [book, setBook] = useState<OpenedBook | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [intent, setIntent] = useState<AssistantIntent | null>(null);
  const [citation, setCitation] = useState<{ seq: number; page: number } | null>(null);
  const [tab, setTab] = useState<Tab>("library");
  const [globalOpen, setGlobalOpen] = useState(false);
  const [calendarRefresh, setCalendarRefresh] = useState(0);
  const [error, setError] = useState("");
  const [ocr, setOcr] = useState<OcrState>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const intentId = useRef(0);
  const ocrStop = useRef(false);
  const ocrPrompted = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await parseResponse<{ documents: WorkspaceLibraryItem[] }>(await fetch("/api/workspace/documents", { cache: "no-store" }));
      setDocuments(data.documents);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setGlobalOpen((value) => !value); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Back from Google's consent screen: show the outcome and drop the query string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("mail");
    if (!result) return;
    setTab("mail");
    if (result === "error") setError(MAIL_NOTES[params.get("reason") ?? ""] ?? MAIL_NOTES.failed);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  // Recognizes scanned pages a few at a time; the server is authoritative about what is still pending.
  async function runOcr(documentId: string, pages: number[]) {
    if (ocr?.running) return;
    ocrStop.current = false;
    const total = pages.length;
    let remaining = [...pages];
    let batches = 0;
    setOcr({ docId: documentId, total, done: 0, running: true });
    const settle = (left: number[]) => {
      const pending = left.length ? left : undefined;
      setDocuments((items) => items.map((item) => item.id === documentId ? { ...item, ocrPending: pending } : item));
      setBook((current) => current && current.document.id === documentId ? { ...current, document: { ...current.document, ocrPending: pending } } : current);
    };
    try {
      while (remaining.length && !ocrStop.current) {
        const data = await parseResponse<{ pending: number[] }>(await fetch(`/api/workspace/documents/${documentId}/ocr`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: remaining.slice(0, 4) }),
        }));
        remaining = data.pending;
        batches += 1;
        setOcr({ docId: documentId, total, done: total - remaining.length, running: true });
        if (batches % 5 === 0) { settle(remaining); setReloadKey((value) => value + 1); }
      }
      settle(remaining);
      setReloadKey((value) => value + 1);
      setOcr({ docId: documentId, total, done: total - remaining.length, running: false, finished: remaining.length === 0 });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : errors.ocr_failed;
      settle(remaining);
      setOcr({ docId: documentId, total, done: total - remaining.length, running: false, error: message });
      setError(message);
    }
  }

  async function openDocument(id: string) {
    if (opening) return;
    setOpening(true);
    try {
      const opened = await parseResponse<OpenedBook>(await fetch(`/api/workspace/documents?id=${encodeURIComponent(id)}`, { cache: "no-store" }));
      setBook(opened);
      // Offer text recognition once per session when the book has scanned pages.
      if (opened.document.ocrPending?.length && !ocrPrompted.current.has(id)) { ocrPrompted.current.add(id); setOcrOpen(true); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the document.");
    } finally {
      setOpening(false);
    }
  }

  async function addFile(file: File) {
    if (uploading) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "txt", "md", "html", "htm"].includes(extension)) return setError(errors.unsupported_format);
    if (file.size > 25 * 1024 * 1024) return setError(errors.file_too_large);
    setUploading(true);
    try {
      const id = crypto.randomUUID();
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
      const type = extension === "pdf" ? "application/pdf" : extension === "md" ? "text/markdown" : extension.startsWith("htm") ? "text/html" : "text/plain";
      const blob = await upload(`workspace/files/${id}/${safeName}`, file, {
        access: "private",
        handleUploadUrl: "/api/workspace/upload",
        contentType: type,
        multipart: file.size > 10 * 1024 * 1024,
      });
      const data = await parseResponse<OpenedBook>(await fetch("/api/workspace/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pathname: blob.pathname, name: file.name }),
      }));
      setDocuments((current) => [{ ...data.document, progress: null, progressAt: null }, ...current]);
      setBook(data);
      if (data.document.ocrPending?.length) { ocrPrompted.current.add(data.document.id); setOcrOpen(true); }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/network|fetch|failed to upload/i.test(message) ? "Upload interrupted. Check your connection and try again." : message || errors.upload_failed);
    } finally {
      setUploading(false);
    }
  }

  const streamAssistant = useCallback((body: Record<string, unknown>, onDelta: (text: string) => void, signal: AbortSignal) => streamNdjson("/api/workspace/assistant", body, onDelta, signal), []);

  const openAssistant = useCallback((mode: AssistantIntent["mode"], selection?: string, offset?: number) => {
    intentId.current += 1;
    setIntent({ id: intentId.current, mode, selection, offset });
    setAssistantOpen(true);
  }, []);

  const closeBook = useCallback((offset: number) => {
    setAssistantOpen(false);
    setBook((current) => {
      if (current) setDocuments((items) => items.map((item) => item.id === current.document.id ? { ...item, progress: offset, progressAt: new Date().toISOString() } : item));
      return null;
    });
  }, []);

  async function signOut() {
    await fetch("/api/workspace/session", { method: "DELETE" });
    window.location.reload();
  }

  const updateDocument = (document: WorkspaceDocument) => setBook((current) => current && { ...current, document });

  return <>
    <div className="shell">
      <Sidebar tab={tab} onTab={setTab} onSignOut={() => void signOut()} onAssistant={() => setGlobalOpen(true)} />
      <div className="shell__main">
        {tab === "mail"
          ? <Mail onError={setError} onSignOut={() => void signOut()} />
          : tab === "calendar" ? <Calendar onError={setError} onSignOut={() => void signOut()} onAssistant={() => setGlobalOpen(true)} refresh={calendarRefresh} />
          : <Library documents={documents} loading={loading} uploading={uploading || opening} ocr={ocr} onOpen={(id) => void openDocument(id)} onAdd={(file) => void addFile(file)} onSignOut={() => void signOut()} />}
      </div>
      <TabBar tab={tab} onTab={setTab} onAssistant={() => setGlobalOpen(true)} />
    </div>
    <GlobalAssistant open={globalOpen && !book} onClose={() => setGlobalOpen(false)} screen={tab} onChanged={() => setCalendarRefresh((value) => value + 1)} onError={setError} />
    {book && <>
      <BookReader key={book.document.id} book={book} onBack={closeBook} onAssistant={openAssistant} onError={setError} stream={streamAssistant} citation={citation} reloadKey={reloadKey} ocrPending={book.document.ocrPending?.length ?? 0} onOcr={() => setOcrOpen(true)} />
      <OcrSheet open={ocrOpen} onClose={() => setOcrOpen(false)} document={book.document} state={ocr} onStart={() => void runOcr(book.document.id, book.document.ocrPending ?? [])} onStop={() => { ocrStop.current = true; }} />
      <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} document={book.document} intent={intent} onDocument={updateDocument} stream={streamAssistant} onError={setError} onCite={(page) => { setAssistantOpen(false); setCitation((current) => ({ seq: (current?.seq ?? 0) + 1, page })); }} />
    </>}
    {error && <div className="ws-toast" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
  </>;
}
