"use client";

import { upload } from "@vercel/blob/client";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceDocument, WorkspaceLibraryItem } from "../lib/workspaceStore";
import { AssistantSheet, type AssistantIntent } from "./AssistantSheet";
import BookReader, { type OpenedBook } from "./BookReader";
import { errors, parseResponse, streamNdjson } from "./api";
import { Library } from "./Library";
import { Calendar } from "./Calendar";
import { Mail } from "./Mail";
import { Sidebar, TabBar, type Tab } from "./Shell";

type Props = { authorized: boolean; configured: boolean };

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
  return <div className="ws-root">{authorized ? <App /> : <Login configured={configured} />}</div>;
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
  const [error, setError] = useState("");
  const intentId = useRef(0);

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

  async function openDocument(id: string) {
    if (opening) return;
    setOpening(true);
    try {
      setBook(await parseResponse<OpenedBook>(await fetch(`/api/workspace/documents?id=${encodeURIComponent(id)}`, { cache: "no-store" })));
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
      <Sidebar tab={tab} onTab={setTab} onSignOut={() => void signOut()} />
      <div className="shell__main">
        {tab === "mail"
          ? <Mail onError={setError} onSignOut={() => void signOut()} />
          : tab === "calendar" ? <Calendar onError={setError} onSignOut={() => void signOut()} />
          : <Library documents={documents} loading={loading} uploading={uploading || opening} onOpen={(id) => void openDocument(id)} onAdd={(file) => void addFile(file)} onSignOut={() => void signOut()} />}
      </div>
      <TabBar tab={tab} onTab={setTab} />
    </div>
    {book && <>
      <BookReader key={book.document.id} book={book} onBack={closeBook} onAssistant={openAssistant} onError={setError} stream={streamAssistant} citation={citation} />
      <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} document={book.document} intent={intent} onDocument={updateDocument} stream={streamAssistant} onError={setError} onCite={(page) => { setAssistantOpen(false); setCitation((current) => ({ seq: (current?.seq ?? 0) + 1, page })); }} />
    </>}
    {error && <div className="ws-toast" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
  </>;
}
