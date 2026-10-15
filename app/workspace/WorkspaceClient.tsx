"use client";

import { upload } from "@vercel/blob/client";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceDocument, WorkspaceLibraryItem } from "../lib/workspaceStore";
import { AssistantSheet, type AssistantIntent } from "./AssistantSheet";
import BookReader, { type OpenedBook } from "./BookReader";
import { Library } from "./Library";

type Props = { authorized: boolean; configured: boolean };

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
  invalid_selection: "Select a shorter passage to translate.",
  ai_timeout: "DeepSeek is responding slowly right now. Try again.",
  invalid_question: "Ask a slightly longer question.",
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
      setDocuments((current) => [{ ...data.document, progress: null }, ...current]);
      setBook(data);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/network|fetch|failed to upload/i.test(message) ? "Upload interrupted. Check your connection and try again." : message || errors.upload_failed);
    } finally {
      setUploading(false);
    }
  }

  // Reads the assistant's newline-delimited events, reporting text as it arrives.
  const streamAssistant = useCallback(async (body: Record<string, unknown>, onDelta: (text: string) => void, signal: AbortSignal) => {
    const response = await fetch("/api/workspace/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok || !response.body) return parseResponse<never>(response);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done: { coverage?: "full" | "excerpts" | "retrieved"; messages?: WorkspaceDocument["messages"] } | null = null;
    const handle = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as { t: string; v?: string; code?: string; coverage?: "full" | "excerpts" | "retrieved"; messages?: WorkspaceDocument["messages"] };
      if (event.t === "delta" && event.v) onDelta(event.v);
      else if (event.t === "error") throw new Error(errors[event.code ?? ""] ?? errors.assistant_failed);
      else if (event.t === "done") done = { coverage: event.coverage, messages: event.messages };
    };
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(buffer);
    if (!done) throw new Error("The answer was interrupted. Try again.");
    return done as { coverage?: "full" | "excerpts" | "retrieved"; messages?: WorkspaceDocument["messages"] };
  }, []);

  const openAssistant = useCallback((mode: AssistantIntent["mode"], selection?: string, offset?: number) => {
    intentId.current += 1;
    setIntent({ id: intentId.current, mode, selection, offset });
    setAssistantOpen(true);
  }, []);

  const closeBook = useCallback((offset: number) => {
    setAssistantOpen(false);
    setBook((current) => {
      if (current) setDocuments((items) => items.map((item) => item.id === current.document.id ? { ...item, progress: offset } : item));
      return null;
    });
  }, []);

  async function signOut() {
    await fetch("/api/workspace/session", { method: "DELETE" });
    window.location.reload();
  }

  const updateDocument = (document: WorkspaceDocument) => setBook((current) => current && { ...current, document });

  return <>
    <Library documents={documents} loading={loading} uploading={uploading || opening} onOpen={(id) => void openDocument(id)} onAdd={(file) => void addFile(file)} onSignOut={() => void signOut()} />
    {book && <>
      <BookReader key={book.document.id} book={book} onBack={closeBook} onAssistant={openAssistant} onError={setError} />
      <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} document={book.document} intent={intent} onDocument={updateDocument} stream={streamAssistant} onError={setError} />
    </>}
    {error && <div className="ws-toast" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
  </>;
}
