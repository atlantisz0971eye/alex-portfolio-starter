"use client";

import { ChevronLeft, ChevronRight, ArrowRightLeft, Download, FilePlus2, FileText, FolderInput, LayoutDashboard, Loader2, MoreHorizontal, Plus, RotateCcw, Search, Smile, Star, Copy, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsonToMarkdown, type JSONNode } from "../lib/notesText";
import type { NoteMeta } from "../lib/notesStore";
import { parseResponse } from "./api";
import { MINDSTREAM_CHANGED, registerFlush, setCurrentMindstream, type ChangedDetail } from "./mindstreamBus";
import { NoteEditor } from "./NoteEditor";
import { Divider, useRemembered, useSplit } from "./useSplit";
import { ConvertSheet, StreamBoard, type Direction } from "./StreamParts";
import { Sheet } from "./Sheet";
import { PageTitle, TopRow } from "./Shell";

type Loaded = { note: NoteMeta; content: JSONNode };
type SearchResult = { meta: NoteMeta; snippet: string };

const EMOJI = "📝 📚 📖 💡 🎯 ✅ 📌 🗓️ 🧠 ✨ 🔬 🎨 🎧 🎬 ✍️ 🗂️ 📊 💬 🌱 🔥 ⭐ 🏠 ✈️ 🍎 ☕ 🧪 🧭 📷 🔖 🧩 🌍 🔒".split(" ");
const api = "/api/workspace/notes";
const jsonHeaders = { "Content-Type": "application/json" };

const label = (note: NoteMeta) => note.title.trim() || "Untitled";

type Props = { onError: (message: string) => void; onSignOut: () => void; refresh: number; openId?: string | null };

/** Mindstreams: a tree of pages, each one a note and a board that stay in step. */
export function Notes({ onError, onSignOut, refresh, openId }: Props) {
  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [view, setView] = useState<"pages" | "trash">("pages");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [wide, setWide] = useState(false);
  const listSplit = useSplit("ws-ms-list", 300, 220, 520);
  const [listState, setListState] = useRemembered("ws-ms-list-open", "open");
  const listOpen = listState !== "closed";

  type Pending = { id: string; title?: string; content?: JSONNode };
  const pending = useRef<Pending | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const contentRef = useRef<JSONNode | null>(null);
  const loadToken = useRef(0);

  useEffect(() => {
    const queryList = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(queryList.matches);
    sync();
    queryList.addEventListener("change", sync);
    try { setExpanded(new Set(JSON.parse(localStorage.getItem("ws-notes-open") ?? "[]"))); } catch { /* storage unavailable */ }
    return () => queryList.removeEventListener("change", sync);
  }, []);

  const loadList = useCallback(async () => {
    try {
      setNotes((await parseResponse<{ notes: NoteMeta[] }>(await fetch(api, { cache: "no-store" }))).notes);
    } catch (cause) {
      setNotes((current) => current ?? []);
      onError(cause instanceof Error ? cause.message : "Could not load notes.");
    }
  }, [onError]);
  useEffect(() => { void loadList(); }, [loadList, refresh]);
  // Boards made before notes and boards were merged get a page in the tree, once per visit.
  useEffect(() => {
    void (async () => {
      try {
        const { adopted } = await parseResponse<{ adopted: number }>(await fetch("/api/workspace/mindstreams/migrate", { method: "POST" }));
        if (adopted > 0) void loadList();
      } catch { /* the tree still works without it */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- saving ---------------------------------------------------------------
  const flush = useCallback(async (keepalive = false) => {
    window.clearTimeout(timer.current);
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    setSaveState("saving");
    try {
      const { id, ...patch } = job;
      const response = await fetch(`${api}/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(patch), keepalive });
      const data = await parseResponse<{ note: NoteMeta }>(response);
      setNotes((current) => current?.map((item) => item.id === id ? data.note : item) ?? current);
      setSaveState(pending.current ? "saving" : "saved");
    } catch (cause) {
      // Keep the unsaved edit so the next attempt carries it.
      const newer = pending.current as Pending | null;
      pending.current = newer ? { ...job, ...newer } : job;
      setSaveState("error");
      onError(cause instanceof Error ? cause.message : "Could not save the note.");
    }
  }, [onError]);

  const queueSave = useCallback((id: string, patch: { title?: string; content?: JSONNode }) => {
    const base: { id: string; title?: string; content?: JSONNode } = pending.current && pending.current.id === id ? pending.current : { id };
    pending.current = { ...base, ...patch, id };
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 900);
  }, [flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") void flush(true); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide as EventListener);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onHide as EventListener); void flush(true); };
  }, [flush]);

  // The assistant and Convert change a mindstream on the server: save what is on screen first, then reload what changed.
  const activeRef = useRef<string | null>(null);
  useEffect(() => registerFlush(async () => { await flush(); }), [flush]);
  useEffect(() => {
    const onChange = (event: Event) => {
      const id = activeRef.current;
      if (!id || (event as CustomEvent<ChangedDetail>).detail?.noteId !== id) return;
      pending.current = null;
      void (async () => {
        try {
          const data = await parseResponse<Loaded>(await fetch(`${api}/${id}`, { cache: "no-store" }));
          if (activeRef.current !== id) return;
          setLoaded(data);
          contentRef.current = data.content;
          setRevision((value) => value + 1);
          void loadList();
        } catch { /* the next open will show the saved version */ }
      })();
    };
    window.addEventListener(MINDSTREAM_CHANGED, onChange);
    return () => window.removeEventListener(MINDSTREAM_CHANGED, onChange);
  }, [loadList]);
  useEffect(() => { activeRef.current = activeId; setCurrentMindstream(activeId); return () => setCurrentMindstream(null); }, [activeId]);

  // ---- opening and creating -------------------------------------------------
  const open = useCallback(async (id: string | null) => {
    await flush();
    setActiveId(id);
    setLoaded(null);
    contentRef.current = null;
    if (!id) return;
    const token = ++loadToken.current;
    setLoadingNote(true);
    try {
      const data = await parseResponse<Loaded>(await fetch(`${api}/${id}`, { cache: "no-store" }));
      if (token === loadToken.current) { setLoaded(data); contentRef.current = data.content; setSaveState("saved"); }
    } catch (cause) {
      if (token === loadToken.current) { setActiveId(null); onError(cause instanceof Error ? cause.message : "Could not open the note."); }
    } finally {
      if (token === loadToken.current) setLoadingNote(false);
    }
  }, [flush, onError]);

  useEffect(() => { if (openId) void open(openId); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useCallback(async (parentId: string | null = null) => {
    try {
      const data = await parseResponse<{ note: NoteMeta }>(await fetch(api, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ parentId }) }));
      setNotes((current) => [...(current ?? []), data.note]);
      if (parentId) setExpanded((current) => { const next = new Set(current).add(parentId); try { localStorage.setItem("ws-notes-open", JSON.stringify([...next])); } catch { /* ignore */ } return next; });
      setView("pages");
      setQuery("");
      await open(data.note.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not create the note.");
    }
  }, [onError, open]);

  // ---- search ---------------------------------------------------------------
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    const timerId = window.setTimeout(() => {
      void fetch(`${api}/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((response) => parseResponse<{ results: SearchResult[] }>(response))
        .then((data) => setResults(data.results))
        .catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(timerId);
  }, [query]);

  // ---- tree -----------------------------------------------------------------
  const live = useMemo(() => (notes ?? []).filter((item) => !item.deletedAt), [notes]);
  const children = useMemo(() => {
    const map = new Map<string | null, NoteMeta[]>();
    for (const item of live) map.set(item.parentId, [...(map.get(item.parentId) ?? []), item]);
    for (const list of map.values()) list.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    return map;
  }, [live]);
  const trashed = useMemo(() => (notes ?? []).filter((item) => item.deletedAt && !(notes ?? []).some((parent) => parent.id === item.parentId && parent.deletedAt)), [notes]);
  const favorites = live.filter((item) => item.favorite);

  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem("ws-notes-open", JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });

  // ---- actions --------------------------------------------------------------
  const patchNote = async (id: string, patch: Record<string, unknown>) => {
    try {
      const data = await parseResponse<{ note: NoteMeta }>(await fetch(`${api}/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(patch) }));
      setNotes((current) => current?.map((item) => item.id === id ? data.note : item) ?? current);
      setLoaded((current) => current && current.note.id === id ? { ...current, note: data.note } : current);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not update the note.");
    }
  };
  const trash = async (id: string) => {
    try {
      await flush();
      await parseResponse(await fetch(`${api}/${id}`, { method: "DELETE" }));
      if (activeId === id) await open(null);
      await loadList();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not move to the trash."); }
  };
  const restore = async (id: string) => {
    try { await parseResponse(await fetch(`${api}/${id}`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ action: "restore" }) })); await loadList(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Could not restore."); }
  };
  const destroy = async (id: string) => {
    if (!window.confirm("Delete this page and its subpages forever?")) return;
    try { await parseResponse(await fetch(`${api}/${id}?permanent=1`, { method: "DELETE" })); await loadList(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Could not delete."); }
  };
  const duplicate = async (id: string) => {
    try {
      const data = await parseResponse<{ note: NoteMeta }>(await fetch(`${api}/${id}`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ action: "duplicate" }) }));
      setNotes((current) => [...(current ?? []), data.note]);
      await open(data.note.id);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not duplicate."); }
  };
  const exportMarkdown = async (id: string) => {
    try {
      await flush();
      const data = id === loaded?.note.id && contentRef.current ? { note: loaded.note, content: contentRef.current } : await parseResponse<Loaded>(await fetch(`${api}/${id}`, { cache: "no-store" }));
      const url = URL.createObjectURL(new Blob([jsonToMarkdown(data.note.title, data.content)], { type: "text/markdown;charset=utf-8" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: `${(data.note.title || "Untitled").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80)}.md` });
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not export."); }
  };

  // ---- rendering ------------------------------------------------------------
  const row = (note: NoteMeta, depth: number) => {
    const kids = children.get(note.id) ?? [];
    const isOpen = expanded.has(note.id);
    return <li key={note.id}>
      <div className={`ntree__row${activeId === note.id ? " is-active" : ""}`} style={{ paddingLeft: 8 + depth * 16 }}>
        <button type="button" className="ntree__chev" aria-label={isOpen ? "Collapse" : "Expand"} aria-expanded={kids.length ? isOpen : undefined} onClick={() => toggle(note.id)} disabled={!kids.length}>{kids.length ? <ChevronRight size={14} style={{ transform: isOpen ? "rotate(90deg)" : undefined }} /> : null}</button>
        <button type="button" className="ntree__main" onClick={() => void open(note.id)}><span className="ntree__icon">{note.icon || <FileText size={16} />}</span><span className="ntree__title">{label(note)}</span></button>
        <button type="button" className="ntree__act" aria-label="Add a subpage" onClick={() => void create(note.id)}><Plus size={15} /></button>
        <button type="button" className="ntree__act" aria-label="Page options" onClick={() => setMenuFor(note.id)}><MoreHorizontal size={15} /></button>
      </div>
      {isOpen && kids.length > 0 && <ul>{kids.map((child) => row(child, depth + 1))}</ul>}
    </li>;
  };

  const list = <>
    <PageTitle actions={<button type="button" className="ws-round" aria-label="New page" onClick={() => void create(null)}><Plus size={22} /></button>}>Mindstreams</PageTitle>
    <label className="mail-search">
      <Search size={16} />
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mindstreams" aria-label="Search mindstreams" autoCapitalize="none" autoCorrect="off" />
      {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></button>}
    </label>
    {notes === null ? <div className="mail-skeleton"><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div></div>
      : results !== null ? (results.length ? <ul className="nresults">{results.map((result) => <li key={result.meta.id}><button type="button" onClick={() => void open(result.meta.id)}><strong>{result.meta.icon} {label(result.meta)}</strong><small>{result.snippet}</small></button></li>)}</ul> : <p className="empty">No notes match “{query.trim()}”.</p>)
        : view === "trash" ? <>
          <div className="ntree__tabs"><button type="button" onClick={() => setView("pages")}>Pages</button><button type="button" className="is-on">Trash</button></div>
          {trashed.length === 0 ? <p className="empty">The trash is empty.</p> : <ul className="ntrash">{trashed.map((note) => <li key={note.id}><span>{note.icon} {label(note)}</span><button type="button" className="ws-text-button" onClick={() => void restore(note.id)}><RotateCcw size={14} /> Restore</button><button type="button" className="ws-text-button ws-text-button--danger" onClick={() => void destroy(note.id)}>Delete</button></li>)}</ul>}
        </> : <>
          <div className="ntree__tabs"><button type="button" className="is-on">Pages</button><button type="button" onClick={() => setView("trash")}>Trash{trashed.length ? ` · ${trashed.length}` : ""}</button></div>
          {favorites.length > 0 && <><h2 className="section-label">Favorites</h2><ul className="ntree">{favorites.map((note) => <li key={`f-${note.id}`}><div className={`ntree__row${activeId === note.id ? " is-active" : ""}`}><button type="button" className="ntree__main" onClick={() => void open(note.id)}><span className="ntree__icon">{note.icon || <FileText size={16} />}</span><span className="ntree__title">{label(note)}</span></button></div></li>)}</ul></>}
          {live.length === 0 ? <div className="empty"><FilePlus2 size={28} /><p>No mindstreams yet.</p><button type="button" className="ws-pill ws-pill--solid" onClick={() => void create(null)}><Plus size={16} /> New page</button></div>
            : <><h2 className="section-label">Pages</h2><ul className="ntree">{(children.get(null) ?? []).map((note) => row(note, 0))}</ul></>}
        </>}
  </>;

  const editor = activeId && <NoteView
    key={activeId}
    loaded={loaded}
    loading={loadingNote}
    parent={loaded?.note.parentId ? live.find((item) => item.id === loaded.note.parentId) ?? null : null}
    subpages={children.get(activeId) ?? []}
    saveState={saveState}
    showBack={!wide}
    onBack={() => void open(null)}
    onOpen={(id) => void open(id)}
    onTitle={(title) => { setNotes((current) => current?.map((item) => item.id === activeId ? { ...item, title } : item) ?? current); queueSave(activeId, { title }); }}
    onContent={(content) => { contentRef.current = content; queueSave(activeId, { content }); }}
    onIcon={(icon) => void patchNote(activeId, { icon })}
    onMenu={() => setMenuFor(activeId)}
    onAddSubpage={() => void create(activeId)}
    onError={onError}
    revision={revision}
  />;

  const menuNote = notes?.find((item) => item.id === menuFor) ?? null;
  const flat = (parent: string | null, depth: number, exclude: Set<string>): { note: NoteMeta; depth: number }[] =>
    (children.get(parent) ?? []).filter((item) => !exclude.has(item.id)).flatMap((item) => [{ note: item, depth }, ...flat(item.id, depth + 1, exclude)]);
  const moveTarget = notes?.find((item) => item.id === moveFor) ?? null;
  const descendants = (id: string): Set<string> => { const ids = new Set<string>([id]); const walk = (p: string) => (children.get(p) ?? []).forEach((c) => { ids.add(c.id); walk(c.id); }); walk(id); return ids; };

  return <>
    <main className={`page page--notes${wide ? " is-split" : ""}`}>
      <TopRow onSignOut={onSignOut} />
      <div className="notes" style={wide ? { gridTemplateColumns: `${listOpen ? listSplit.size : 0}px 10px minmax(0, 1fr)` } : undefined}>
        <section className={`notes__list${listOpen ? "" : " is-collapsed"}`} aria-label="Pages">{list}</section>
        {wide && <Divider collapsed={!listOpen} bind={listSplit.bind(1)} left={{ label: listOpen ? "Hide the page list" : "Show the page list", collapsed: !listOpen, onToggle: () => setListState(listOpen ? "closed" : "open") }} />}
        {wide && <section className="notes__pane" aria-label="Page">{editor || <div className="empty"><FileText size={28} /><p>Select a mindstream or create a new one.</p></div>}</section>}
      </div>
    </main>
    {!wide && editor && <div className="note-overlay">{editor}</div>}

    <Sheet open={!!menuNote} onClose={() => setMenuFor(null)} title={menuNote ? label(menuNote) : "Page"} size="compact">
      {menuNote && <div className="doc__group">
        <button type="button" onClick={() => { setMenuFor(null); void create(menuNote.id); }}><FilePlus2 size={18} /> Add a subpage</button>
        <button type="button" onClick={() => { void patchNote(menuNote.id, { favorite: !menuNote.favorite }); setMenuFor(null); }}><Star size={18} /> {menuNote.favorite ? "Remove from favorites" : "Add to favorites"}</button>
        <button type="button" onClick={() => { setMenuFor(null); void duplicate(menuNote.id); }}><Copy size={18} /> Duplicate</button>
        <button type="button" onClick={() => { setMoveFor(menuNote.id); setMenuFor(null); }}><FolderInput size={18} /> Move to…</button>
        <button type="button" onClick={() => { setMenuFor(null); void exportMarkdown(menuNote.id); }}><Download size={18} /> Export as Markdown</button>
        <button type="button" className="is-danger" onClick={() => { setMenuFor(null); void trash(menuNote.id); }}><Trash2 size={18} /> Move to trash</button>
      </div>}
    </Sheet>
    <Sheet open={!!moveTarget} onClose={() => setMoveFor(null)} title="Move to" size="tall">
      {moveTarget && <div className="doc__group">
        <button type="button" onClick={() => { void patchNote(moveTarget.id, { parentId: null }); setMoveFor(null); }}><FileText size={18} /> Top level</button>
        {flat(null, 0, descendants(moveTarget.id)).map(({ note, depth }) => <button key={note.id} type="button" style={{ paddingLeft: 16 + depth * 18 }} onClick={() => { void patchNote(moveTarget.id, { parentId: note.id }); setMoveFor(null); }}>{note.icon || <FileText size={18} />} {label(note)}</button>)}
      </div>}
    </Sheet>
  </>;
}

type ViewProps = {
  loaded: Loaded | null;
  loading: boolean;
  parent: NoteMeta | null;
  subpages: NoteMeta[];
  saveState: "saved" | "saving" | "error";
  showBack: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
  onTitle: (title: string) => void;
  onContent: (content: JSONNode) => void;
  onIcon: (icon: string) => void;
  onMenu: () => void;
  onAddSubpage: () => void;
  onError: (message: string) => void;
  revision: number;
};

function NoteView({ loaded, loading, parent, subpages, saveState, showBack, onBack, onOpen, onTitle, onContent, onIcon, onMenu, onAddSubpage, onError, revision }: ViewProps) {
  const [title, setTitle] = useState("");
  const [picker, setPicker] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLElement>(null);
  const [roomy, setRoomy] = useState(false);
  const noteSplit = useSplit("ws-ms-note", 460, 280, 1000);
  // "both", or one pane slid away so the other has the whole width.
  const [layout, setLayout] = useRemembered("ws-ms-layout", "both");
  const [view, setView] = useState<"note" | "board">("note");
  const [boardId, setBoardId] = useState<string | null>(null);
  const [boardSave, setBoardSave] = useState<"saved" | "saving" | "error">("saved");
  const [convertMenu, setConvertMenu] = useState(false);
  const [direction, setDirection] = useState<Direction | null>(null);
  // Note and board sit side by side when the pane is wide enough, and switch otherwise.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setRoomy(entry.contentRect.width >= 860));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (loaded) setTitle(loaded.note.title); }, [loaded?.note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = area.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }, [title, loaded]);
  const fresh = loaded && !loaded.note.title && !loaded.note.preview;

  const status = saveState === "error" || boardSave === "error" ? "error" : saveState === "saving" || boardSave === "saving" ? "saving" : "saved";

  return <article className="nview" ref={root} data-roomy={roomy ? "true" : "false"} data-view={view}>
    <header className="nview__bar">
      {showBack ? <button type="button" className="ws-text-button" onClick={onBack}><ChevronLeft size={22} /> Mindstreams</button> : <span className="nview__crumb">{parent ? `${parent.icon} ${label(parent)}` : ""}</span>}
      {!roomy && <div className="ws-segment ms__switch" role="group" aria-label="View">
        <button type="button" className={view === "note" ? "is-on" : ""} onClick={() => setView("note")}><FileText size={15} /> Note</button>
        <button type="button" className={view === "board" ? "is-on" : ""} onClick={() => setView("board")}><LayoutDashboard size={15} /> Board</button>
      </div>}
      <button type="button" className="ws-pill ms__convert" onClick={() => setConvertMenu(true)}><ArrowRightLeft size={15} /> Convert</button>
      <span className={`nview__status is-${status}`} aria-live="polite">{status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "Saved"}</span>
      <button type="button" className="ws-round" aria-label="Page options" onClick={onMenu}><MoreHorizontal size={18} /></button>
    </header>
    <div className="nview__body" style={roomy ? { gridTemplateColumns: layout === "board" ? "0px 10px minmax(0, 1fr)" : layout === "note" ? "minmax(0, 1fr) 10px 0px" : `${noteSplit.size}px 10px minmax(240px, 1fr)` } : undefined}>
    <div className={`nview__notepane${roomy && layout === "board" ? " is-collapsed" : ""}`}>
    {loading || !loaded ? <div className="nview__scroll"><p className="empty"><Loader2 className="ws-spin" size={18} /></p></div> : <div className="nview__scroll">
      <div className="nview__page">
        <button type="button" className="nview__icon" aria-label="Choose an icon" onClick={() => setPicker(true)}>{loaded.note.icon || <Smile size={26} />}</button>
        <textarea ref={area} className="nview__title" rows={1} value={title} placeholder="Untitled" aria-label="Title" maxLength={200}
          onChange={(event) => { const value = event.target.value.replace(/\n/g, " "); setTitle(value); onTitle(value); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); (document.querySelector(".note-prose") as HTMLElement | null)?.focus(); } }}
          autoFocus={!!fresh} />
        <NoteEditor key={`${loaded.note.id}-${revision}`} initial={loaded.content} onChange={onContent} autoFocus={false} />
        {subpages.length > 0 && <div className="nview__subs"><h2 className="section-label">Subpages</h2><ul>{subpages.map((page) => <li key={page.id}><button type="button" onClick={() => onOpen(page.id)}><span>{page.icon || <FileText size={16} />}</span> {label(page)}</button></li>)}</ul></div>}
        <button type="button" className="ws-pill nview__add" onClick={onAddSubpage}><Plus size={15} /> Add a subpage</button>
      </div>
    </div>}
    </div>
    {roomy && <Divider collapsed={layout !== "both"} bind={noteSplit.bind(1)} left={{ label: layout === "board" ? "Show the note" : "Hide the note", collapsed: layout === "board", onToggle: () => setLayout(layout === "board" ? "both" : "board") }} right={{ label: layout === "note" ? "Show the board" : "Hide the board", collapsed: layout === "note", onToggle: () => setLayout(layout === "note" ? "both" : "note") }} />}
    <div className={`nview__boardpane${roomy && layout === "note" ? " is-collapsed" : ""}`} aria-label="Board">
      {loaded && <StreamBoard noteId={loaded.note.id} title={title} onBoardId={setBoardId} onSaveState={setBoardSave} onError={onError} />}
    </div>
    </div>
    <Sheet open={convertMenu} onClose={() => setConvertMenu(false)} title="Convert" size="compact">
      <div className="doc__group">
        <button type="button" onClick={() => { setConvertMenu(false); setDirection("toNote"); }}><LayoutDashboard size={18} /> <span className="ms__opt"><b>Board → note</b><small>DeepSeek writes a connected note from your cards</small></span></button>
        <button type="button" onClick={() => { setConvertMenu(false); setDirection("toBoard"); }}><FileText size={18} /> <span className="ms__opt"><b>Note → board</b><small>DeepSeek turns the note into linked cards</small></span></button>
      </div>
    </Sheet>
    {loaded && <ConvertSheet direction={direction} boardId={boardId} noteId={loaded.note.id} onClose={() => setDirection(null)} onError={onError} onDone={() => setDirection(null)} />}
    <Sheet open={picker} onClose={() => setPicker(false)} title="Icon" size="compact">
      <div className="emoji-grid">{EMOJI.map((emoji) => <button key={emoji} type="button" onClick={() => { onIcon(emoji); setPicker(false); }}>{emoji}</button>)}</div>
      {loaded?.note.icon && <button type="button" className="ws-pill" onClick={() => { onIcon(""); setPicker(false); }}>Remove icon</button>}
    </Sheet>
  </article>;
}
