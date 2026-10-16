"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Organized } from "../lib/boardLayout";
import { parseResponse } from "./api";
import { BoardCanvas } from "./BoardCanvas";
import { notifyMindstreamChanged } from "./mindstreamBus";
import { Sheet } from "./Sheet";

const headers = { "Content-Type": "application/json" };

/** The board paired with a note. It is created the first time the page is opened. */
export function StreamBoard({ noteId, title, onBoardId, onSaveState, onError }: { noteId: string; title: string; onBoardId: (id: string) => void; onSaveState: (state: "saved" | "saving" | "error") => void; onError: (message: string) => void }) {
  const [boardId, setBoardId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBoardId(null);
    void (async () => {
      try {
        const data = await parseResponse<{ boardId: string }>(await fetch(`/api/workspace/notes/${noteId}/board`, { method: "POST" }));
        if (cancelled) return;
        setBoardId(data.boardId);
        onBoardId(data.boardId);
      } catch (cause) {
        if (!cancelled) onError(cause instanceof Error ? cause.message : "Could not open the board.");
      }
    })();
    return () => { cancelled = true; };
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!boardId) return <p className="empty"><Loader2 className="ws-spin" size={18} /></p>;
  return <BoardCanvas key={boardId} boardId={boardId} title={title} onTitle={() => undefined} onSaveState={onSaveState} onBack={() => undefined} onError={onError} onChanged={() => undefined} />;
}

export type Direction = "toNote" | "toBoard";

/** Board → note and note → board. DeepSeek drafts, the reader reviews, and only then is anything written. */
export function ConvertSheet({ direction, boardId, noteId, onClose, onError, onDone }: { direction: Direction | null; boardId: string | null; noteId: string; onClose: () => void; onError: (message: string) => void; onDone: () => void }) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [tree, setTree] = useState<Organized | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!direction || !boardId) return;
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
    if (!boardId) return;
    setSaving(true);
    try {
      const body = direction === "toNote" ? { kind: "note", boardId, mode, markdown } : { kind: "tree", boardId, mode: mode === "replace" ? "replace" : "add", tree };
      await parseResponse(await fetch("/api/workspace/mindstream/apply", { method: "POST", headers, body: JSON.stringify(body) }));
      notifyMindstreamChanged(boardId, noteId);
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
