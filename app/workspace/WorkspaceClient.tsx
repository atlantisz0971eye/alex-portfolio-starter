"use client";

import { upload } from "@vercel/blob/client";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ENRICH_VERSION } from "../lib/bookTitle";
import type { WorkspaceDocument, WorkspaceLibraryItem } from "../lib/workspaceStore";
import { AssistantSheet, type AssistantIntent } from "./AssistantSheet";
import BookReader, { type OpenedBook } from "./BookReader";
import { errors, parseResponse, streamNdjson } from "./api";
import { DocumentSheet, type DocumentActions } from "./DocumentSheet";
import { Library } from "./Library";
import { OcrSheet, type OcrState } from "./OcrSheet";
import { Calendar } from "./Calendar";
import { GlobalAssistant } from "./GlobalAssistant";
import { Mail } from "./Mail";
import { Devlog } from "./Devlog";
import { Notes } from "./Notes";
import { Members } from "./Members";
import { Sidebar, TabBar, ThemeContext, UserContext, type PublicUser, type Skin, type Tab, type Theme } from "./Shell";
import { Today } from "./Today";

type Props = { authorized: boolean; configured: boolean; user: PublicUser | null };

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

export default function WorkspaceClient({ authorized, configured, user }: Props) {
  const [membersOpen, setMembersOpen] = useState(false);
  const [errorText, setErrorText] = useState("");
  // Track the visual viewport: iOS keeps 100dvh unchanged when the keyboard opens.
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--ws-vh", `${viewport?.height ?? window.innerHeight}px`);
      // When the keyboard opens, iOS pans the visual viewport instead of resizing the page; follow it so nothing is left uncovered.
      root.style.setProperty("--ws-top", `${viewport?.offsetTop ?? 0}px`);
    };
    sync();
    // iOS reports the keyboard height late and scrolls clipped containers to reveal the caret, so re-check and undo both.
    const settle = () => { [60, 250, 600].forEach((delay) => window.setTimeout(sync, delay)); };
    const unscroll = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".ws-root") && (target.scrollTop || target.scrollLeft) && target.matches(".ws-root, .board, .board__canvas, .react-flow, .react-flow__renderer, .react-flow__pane")) { target.scrollTop = 0; target.scrollLeft = 0; }
    };
    window.addEventListener("focusin", settle);
    window.addEventListener("focusout", settle);
    document.addEventListener("scroll", unscroll, true);
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("focusin", settle);
      window.removeEventListener("focusout", settle);
      document.removeEventListener("scroll", unscroll, true);
      root.style.removeProperty("--ws-vh");
      root.style.removeProperty("--ws-top");
    };
  }, []);
  const [theme, setTheme] = useState<Theme>("dark");
  const [skin, setSkin] = useState<Skin>("graphic");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ws-theme");
      if (saved === "dark" || saved === "light") setTheme(saved); else if (!window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("light");
      const savedSkin = localStorage.getItem("ws-skin");
      if (savedSkin === "paper" || savedSkin === "graphic") setSkin(savedSkin);
    } catch { /* storage unavailable */ }
  }, []);
  const toggleSkin = () => setSkin((current) => { const next = current === "graphic" ? "paper" : "graphic"; try { localStorage.setItem("ws-skin", next); } catch { /* storage unavailable */ } return next; });
  const toggle = () => setTheme((current) => { const next = current === "dark" ? "light" : "dark"; try { localStorage.setItem("ws-theme", next); } catch { /* storage unavailable */ } return next; });
  return <ThemeContext.Provider value={{ theme, toggle, skin, toggleSkin }}><div className="ws-root" data-theme={theme} data-skin={skin}>{authorized ? <UserContext.Provider value={{ user, openMembers: () => setMembersOpen(true) }}><App />{user?.role === "owner" && <Members open={membersOpen} onClose={() => setMembersOpen(false)} onError={setErrorText} />}{errorText && <div className="ws-toast" role="alert"><span>{errorText}</span><button type="button" onClick={() => setErrorText("")} aria-label="Dismiss"><X size={16} /></button></div>}</UserContext.Provider> : <Login configured={configured} />}</div></ThemeContext.Provider>;
}

function App() {
  const { user } = useContext(UserContext);
  const [documents, setDocuments] = useState<WorkspaceLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [book, setBook] = useState<OpenedBook | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [intent, setIntent] = useState<AssistantIntent | null>(null);
  const [citation, setCitation] = useState<{ seq: number; page: number } | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [mindstreamRefresh, setMindstreamRefresh] = useState(0);
  const [streamOpenId, setStreamOpenId] = useState<string | null>(null);
  // A link from the devlog only applies to that visit.
  useEffect(() => { if (tab !== "mindstreams") setStreamOpenId(null); }, [tab]);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [calendarRefresh, setCalendarRefresh] = useState(0);
  const [notesRefresh, setNotesRefresh] = useState(0);
  const [todayRefresh, setTodayRefresh] = useState(0);
  const [todayBadge, setTodayBadge] = useState(false);
  const tabRef = useRef<Tab>("today");
  tabRef.current = tab;
  const [error, setError] = useState("");
  const [managing, setManaging] = useState<string | null>(null);
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

  // Books imported before titles, covers and contents were read get them once, quietly, one at a time.
  const enriching = useRef(new Set<string>());
  useEffect(() => {
    const next = documents.find((item) => item.mimeType === "application/pdf" && (!item.enrichedAt || (item.enrichVersion ?? 1) < ENRICH_VERSION) && !enriching.current.has(item.id));
    if (!next || enriching.current.size >= 4) return;
    enriching.current.add(next.id);
    void (async () => {
      try {
        const data = await parseResponse<{ document: WorkspaceLibraryItem }>(await fetch(`/api/workspace/documents/${next.id}/enrich`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
        setDocuments((items) => items.map((item) => item.id === next.id ? { ...item, ...data.document, progress: item.progress, progressAt: item.progressAt } : item));
      } catch { /* it is tried again on the next visit */ }
    })();
  }, [documents]);

  // Look for new mail now and every few minutes; a new plan lights a dot on Today until it is opened.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/workspace/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", zone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
        if (!response.ok || stopped) return;
        const data = await response.json() as { updated?: boolean };
        if (data.updated) { setTodayRefresh((value) => value + 1); if (tabRef.current !== "today") setTodayBadge(true); }
      } catch { /* the next check will try again */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5 * 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  useEffect(() => { if (tab === "today") setTodayBadge(false); }, [tab]);
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

  const patchDocument = (document: WorkspaceDocument) => {
    setDocuments((items) => items.map((item) => item.id === document.id ? { ...item, ...document, progress: item.progress, progressAt: item.progressAt } : item));
    setBook((current) => current && current.document.id === document.id ? { ...current, document } : current);
  };

  // Failures are reported here and re-thrown so the sheet can stop its spinner.
  const manage: DocumentActions = {
    open: (id) => void openDocument(id),
    rename: async (id, name) => {
      try {
        const data = await parseResponse<{ document: WorkspaceDocument }>(await fetch(`/api/workspace/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }));
        patchDocument(data.document);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rename."); throw cause; }
    },
    rescan: async (id) => {
      try {
        const data = await parseResponse<{ document: WorkspaceDocument; emptyPages: number; totalPages: number | null }>(await fetch(`/api/workspace/documents/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rescan" }) }));
        patchDocument(data.document);
        return { emptyPages: data.emptyPages, totalPages: data.totalPages };
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not check the file."); throw cause; }
    },
    reextract: async (id) => {
      try {
        const data = await parseResponse<{ document: WorkspaceDocument }>(await fetch(`/api/workspace/documents/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reextract" }) }));
        patchDocument(data.document);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the file again."); throw cause; }
    },
    remove: async (id) => {
      try {
        await parseResponse(await fetch(`/api/workspace/documents/${id}`, { method: "DELETE" }));
        setDocuments((items) => items.filter((item) => item.id !== id));
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the file."); throw cause; }
    },
    ocr: (id, pages) => void runOcr(id, pages),
  };

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
      const blob = await upload(`${user?.root ?? "workspace/"}files/${id}/${safeName}`, file, {
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
      // The server reads the title, cover and contents of a new book itself; skip the catch-up pass for it.
      enriching.current.add(data.document.id);
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
      <Sidebar tab={tab} onTab={setTab} onSignOut={() => void signOut()} onAssistant={() => setGlobalOpen(true)} badges={{ today: todayBadge }} />
      <div className="shell__main">
        {tab === "today"
          ? <Today onError={setError} onSignOut={() => void signOut()} onTab={setTab} refresh={todayRefresh} onChanged={() => setCalendarRefresh((value) => value + 1)} onSeen={() => setTodayBadge(false)} />
          : tab === "mail"
          ? <Mail onError={setError} onSignOut={() => void signOut()} />
          : tab === "mindstreams" ? <Notes onError={setError} onSignOut={() => void signOut()} refresh={notesRefresh + mindstreamRefresh} openId={streamOpenId} />
          : tab === "devlog" ? <Devlog onError={setError} onSignOut={() => void signOut()} onOpenStream={(id) => { setStreamOpenId(id); setTab("mindstreams"); }} />
          : tab === "calendar" ? <Calendar onError={setError} onSignOut={() => void signOut()} onAssistant={() => setGlobalOpen(true)} refresh={calendarRefresh} />
          : <Library documents={documents} loading={loading} uploading={uploading || opening} ocr={ocr} onOpen={(id) => void openDocument(id)} onManage={setManaging} onAdd={(file) => void addFile(file)} onSignOut={() => void signOut()} />}
      </div>
      <TabBar tab={tab} onTab={setTab} onAssistant={() => setGlobalOpen(true)} badges={{ today: todayBadge }} />
    </div>
    <DocumentSheet document={documents.find((item) => item.id === managing) ?? null} ocr={ocr} actions={manage} onClose={() => setManaging(null)} />
    <GlobalAssistant open={globalOpen && !book} onClose={() => setGlobalOpen(false)} screen={tab} onChanged={() => { setCalendarRefresh((value) => value + 1); setNotesRefresh((value) => value + 1); setMindstreamRefresh((value) => value + 1); }} onError={setError} />
    {book && <>
      <BookReader key={book.document.id} book={book} onBack={closeBook} onAssistant={openAssistant} onError={setError} stream={streamAssistant} citation={citation} reloadKey={reloadKey} ocrPending={book.document.ocrPending?.length ?? 0} onOcr={() => setOcrOpen(true)} />
      <OcrSheet open={ocrOpen} onClose={() => setOcrOpen(false)} document={book.document} state={ocr} onStart={() => void runOcr(book.document.id, book.document.ocrPending ?? [])} onStop={() => { ocrStop.current = true; }} />
      <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} document={book.document} intent={intent} onDocument={updateDocument} stream={streamAssistant} onError={setError} onCite={(page) => { setAssistantOpen(false); setCitation((current) => ({ seq: (current?.seq ?? 0) + 1, page })); }} />
    </>}
    {error && <div className="ws-toast" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
  </>;
}
