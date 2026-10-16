"use client";

import { ArrowRightLeft, ChevronLeft, FileText, LayoutDashboard, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Organized } from "../lib/boardLayout";
import type { NoteMeta } from "../lib/notesStore";
import type { JSONNode } from "../lib/notesText";
import { parseResponse } from "./api";
import { BoardCanvas } from "./BoardCanvas";
import { MINDSTREAM_CHANGED, notifyMindstreamChanged, registerFlush, setCurrentMindstream } from "./mindstreamBus";
import { NoteEditor } from "./NoteEditor";
import { Sheet } from "./Sheet";

type SaveState = "saved" | "saving" | "error";
const headers = { "Content-Type": "application/json" };
const board = (id: string) => `/api/workspace/boards/${id}`;

/** The paired note. It saves itself, and reloads when the assistant or a Mindstream action rewrites it. */
function NotePane({ boardId, noteId, onError, onSaveState }: { boardId: string; noteId: string; onError: (message: string) => void; onSaveState: (state: SaveState) => void }) {
  const [loaded, setLoaded] = useState<{ note: NoteMeta; content: JSONNode } | null>(null);
  const [revision, setRevision] = useState(0);
  const pending = useRef<JSONNode | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const callbacks = useRef({ onError, onSaveState });
  callbacks.current = { onError, onSaveState };

  const load = useCallback(async () => {
    try {
      setLoaded(await parseResponse<{ note: NoteMeta; content: JSONNode }>(await fetch(`/api/workspace/notes/${noteId}`, { cache: "no-store" })));
      setRevision((value) => value + 1);
    } catch (cause) {
      callbacks.current.onError(cause instanceof Error ? cause.message : "Could not open the note.");
    }
  }, [noteId]);
  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    const content = pending.current;
    if (!content) return;
    pending.current = null;
    callbacks.current.onSaveState("saving");
    try {
      await parseResponse(await fetch(`/api/workspace/notes/${noteId}`, { method: "PATCH", headers, body: JSON.stringify({ content }) }));
      callbacks.current.onSaveState(pending.current ? "saving" : "saved");
    } catch (cause) {
      pending.current = pending.current ?? content;
      callbacks.current.onSaveState("error");
      callbacks.current.onError(cause instanceof Error ? cause.message : "Could not save the note.");
    }
  }, [noteId]);

  useEffect(() => {
    const onChange = (event: Event) => { if ((event as CustomEvent).detail === boardId) { pending.current = null; void load(); } };
    window.addEventListener(MINDSTREAM_CHANGED, onChange);
    return () => window.removeEventListener(MINDSTREAM_CHANGED, onChange);
  }, [boardId, load]);
  useEffect(() => registerFlush(async () => { window.clearTimeout(timer.current); await save(); }), [save]);
  useEffect(() => () => { window.clearTimeout(timer.current); void save(); }, [save]);

  if (!loaded) return <div className="nview__scroll"><p className="empty"><Loader2 className="ws-spin" size={18} /></p></div>;
  return <div className="nview__scroll">
    <div className="nview__page">
      <NoteEditor key={revision} initial={loaded.content} autoFocus={false} onChange={(content) => {
        pending.current = content;
        callbacks.current.onSaveState("saving");
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void save(), 900);
      }} />
    </div>
  </div>;
}

type Direction = "toNote" | "toBoard";

/** Board → note and note → board. DeepSeek drafts, the reader reviews, and only then is anything written. */
function ConvertSheet({ direction, boardId, onClose, onError, onDone }: { direction: Direction | null; boardId: string; onClose: () => void; onError: (message: string) => void; onDone: () => void }) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [tree, setTree] = useState<Organized | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!direction) return;
    let cancelled = false;
    setMarkdown(null);
    setTree(null);
    setMode("append");
    void (async () => {
      try {
        if (direction === "toNote") {
          const data = await parseResponse<{ markdown: string }>(await fetch("/api/workspace/mindstream/note", { method: "POST", headers, body: JSON.stringify({ boardId }) }));
          if (!cancelled) setMarkdown(data.markdown);
        } else {
          const data = await parseResponse<Organized>(await fetch("/api/workspace/mindstream/board", { method: "POST", headers, body: JSON.stringify({ boardId }) }));
          if (!cancelled) setTree(data);
        }
      } catch (cause) {
        if (cancelled) return;
        onError(cause instanceof Error ? cause.message : "Could not convert.");
        onClose();
      }
    })();
    return () => { cancelled = true; };
  }, [direction, boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function apply() {
    setSaving(true);
    try {
      const body = direction === "toNote" ? { kind: "note", boardId, mode, markdown } : { kind: "tree", boardId, mode: mode === "replace" ? "replace" : "add", tree };
      await parseResponse(await fetch("/api/workspace/mindstream/apply", { method: "POST", headers, body: JSON.stringify(body) }));
      notifyMindstreamChanged(boardId);
      onDone();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not apply the change.");
    } finally {
      setSaving(false);
    }
  }

  const ready = direction === "toNote" ? markdown !== null : tree !== null;
  const depthOf = (items: Organized["items"], index: number): number => items[index].parent === null ? 0 : depthOf(items, items[index].parent as number) + 1;
  const noun = direction === "toNote" ? "note" : "board";

  return <Sheet open={!!direction} onClose={onClose} title={direction === "toNote" ? "Board → note" : "Note → board"} size="tall" primary={{ label: saving ? "Applying…" : mode === "replace" ? "Replace" : "Add", onClick: () => void apply(), disabled: !ready || saving }}>
    {!ready ? <p className="board-read__wait"><Loader2 className="ws-spin" size={16} /> DeepSeek is connecting your {direction === "toNote" ? "cards" : "note"}…</p> : <div className="board-read">
      <div className="ws-segment ms__mode" role="group" aria-label="How to apply">
        <button type="button" className={mode === "append" ? "is-on" : ""} onClick={() => setMode("append")}>{direction === "toNote" ? "Add to end" : "Add cards"}</button>
        <button type="button" className={mode === "replace" ? "is-on" : ""} onClick={() => setMode("replace")}>{direction === "toNote" ? "Replace note" : "Replace cards"}</button>
      </div>
      <p className="board-read__hint">{mode === "replace" ? `This overwrites the current ${noun}${direction === "toBoard" ? " cards (photos stay)" : ""}.` : `Your existing ${noun} stays as it is.`} Nothing changes until you confirm.</p>
      {direction === "toNote" && markdown !== null && <textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} style={{ minHeight: 340 }} />}
      {direction === "toBoard" && tree && <ul className="board-read__tree">
        <li className="is-title">{tree.title}</li>
        {tree.items.map((item, index) => <li key={index} style={{ paddingLeft: 14 + depthOf(tree.items, index) * 18 }}>{item.text}</li>)}
      </ul>}
    </div>}
  </Sheet>;
}

/** One mindstream: its note and its board side by side on wide screens, switchable on phones. */
export function Mindstream({ boardId, onClose, onError, onChanged }: { boardId: string; onClose: () => void; onError: (message: string) => void; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [view, setView] = useState<"note" | "board">("board");
  const [wide, setWide] = useState(false);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saves, setSaves] = useState<{ board: SaveState; note: SaveState }>({ board: "saved", note: "saved" });

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1100px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => { setCurrentMindstream(boardId); return () => setCurrentMindstream(null); }, [boardId]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await parseResponse<{ noteId: string }>(await fetch(`${board(boardId)}/note`, { method: "POST" }));
        if (!cancelled) setNoteId(data.noteId);
      } catch (cause) {
        if (cancelled) return;
        onError(cause instanceof Error ? cause.message : "Could not open the mindstream.");
        onClose();
      }
    })();
    return () => { cancelled = true; };
  }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = saves.board === "error" || saves.note === "error" ? "Not saved" : saves.board === "saving" || saves.note === "saving" ? "Saving…" : "Saved";
  const stable = useCallback(() => onChanged(), [onChanged]);

  return <div className="ms" data-view={view} data-wide={wide ? "true" : "false"}>
    <header className="board__bar ms__bar">
      <button type="button" className="ws-text-button" onClick={onClose}><ChevronLeft size={18} /> <span>Mindstreams</span></button>
      <input className="board__title" value={title} placeholder="Untitled mindstream" aria-label="Mindstream title" onChange={(event) => setTitle(event.target.value)} />
      <span className="board__state" aria-live="polite">{state}</span>
      <div className="ms__tools">
        {!wide && <div className="ws-segment ms__switch" role="group" aria-label="View">
          <button type="button" className={view === "note" ? "is-on" : ""} onClick={() => setView("note")}><FileText size={15} /> Note</button>
          <button type="button" className={view === "board" ? "is-on" : ""} onClick={() => setView("board")}><LayoutDashboard size={15} /> Board</button>
        </div>}
        <button type="button" className="ws-pill ms__convert" onClick={() => setMenuOpen(true)}><ArrowRightLeft size={15} /> Convert</button>
      </div>
    </header>
    <div className="ms__body">
      <section className="ms__note" aria-label="Note">{noteId ? <NotePane boardId={boardId} noteId={noteId} onError={onError} onSaveState={(next) => setSaves((current) => ({ ...current, note: next }))} /> : <p className="empty"><Loader2 className="ws-spin" size={18} /></p>}</section>
      <section className="ms__board" aria-label="Board">
        <BoardCanvas boardId={boardId} title={title} onTitle={setTitle} onSaveState={(next) => setSaves((current) => ({ ...current, board: next }))} onBack={onClose} onError={onError} onChanged={stable} />
      </section>
    </div>
    <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Convert" size="compact">
      <div className="doc__group">
        <button type="button" onClick={() => { setMenuOpen(false); setDirection("toNote"); }}><LayoutDashboard size={18} /> <span className="ms__opt"><b>Board → note</b><small>DeepSeek writes a connected note from your cards</small></span></button>
        <button type="button" onClick={() => { setMenuOpen(false); setDirection("toBoard"); }}><FileText size={18} /> <span className="ms__opt"><b>Note → board</b><small>DeepSeek turns the note into linked cards</small></span></button>
      </div>
    </Sheet>
    <ConvertSheet direction={direction} boardId={boardId} onClose={() => setDirection(null)} onError={onError} onDone={() => { setDirection(null); onChanged(); }} />
  </div>;
}

