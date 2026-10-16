"use client";

import { LayoutDashboard, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { BoardMeta } from "../lib/boardStore";
import { parseResponse } from "./api";
import { BoardCanvas } from "./BoardCanvas";
import { PageTitle, TopRow } from "./Shell";

type Props = { onError: (message: string) => void; onSignOut: () => void; openId?: string | null; onOpenNote: (id: string) => void };
const when = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** Boards: free-form canvases for lecture notes, photos of paper notebooks and pages from PDFs. */
export function Boards({ onError, onSignOut, openId: initialOpen, onOpenNote }: Props) {
  const [boards, setBoards] = useState<BoardMeta[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoards((await parseResponse<{ boards: BoardMeta[] }>(await fetch("/api/workspace/boards", { cache: "no-store" }))).boards);
    } catch (cause) {
      setBoards((current) => current ?? []);
      onError(cause instanceof Error ? cause.message : "Could not load boards.");
    }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setCreating(true);
    try {
      const { board } = await parseResponse<{ board: BoardMeta }>(await fetch("/api/workspace/boards", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
      setBoards((current) => [board, ...(current ?? [])]);
      setOpenId(board.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not create a board.");
    } finally {
      setCreating(false);
    }
  }

  async function remove(board: BoardMeta) {
    if (!window.confirm(`Delete “${board.title}” and its images?`)) return;
    try {
      await parseResponse(await fetch(`/api/workspace/boards/${board.id}`, { method: "DELETE" }));
      setBoards((current) => (current ?? []).filter((item) => item.id !== board.id));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not delete the board.");
    }
  }

  return <>
    <main className="page">
      <TopRow onSignOut={onSignOut} />
      <PageTitle actions={<button type="button" className="ws-round" aria-label="New board" onClick={() => void create()} disabled={creating}>{creating ? <Loader2 className="ws-spin" size={18} /> : <Plus size={18} />}</button>}>Boards</PageTitle>
      {boards === null && <div className="mail-skeleton"><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div></div>}
      {boards?.length === 0 && <div className="empty"><LayoutDashboard size={28} /><p>No boards yet.</p><small>Lay out lecture notes, photos of your notebook and PDF pages on one canvas.</small><button type="button" className="ws-pill ws-pill--solid" onClick={() => void create()}><Plus size={16} /> New board</button></div>}
      {boards && boards.length > 0 && <ul className="boards">
        {boards.map((board) => <li key={board.id}>
          <button type="button" className="boards__card ws-card" onClick={() => setOpenId(board.id)}>
            <strong>{board.title}</strong>
            <small>{board.nodeCount} {board.nodeCount === 1 ? "item" : "items"} · {when.format(new Date(board.updatedAt))}</small>
          </button>
          <button type="button" className="boards__delete" aria-label={`Delete ${board.title}`} onClick={() => void remove(board)}><Trash2 size={15} /></button>
        </li>)}
      </ul>}
    </main>
    {openId && <BoardCanvas boardId={openId} onBack={() => setOpenId(null)} onError={onError} onChanged={() => void load()} onOpenNote={onOpenNote} />}
  </>;
}
