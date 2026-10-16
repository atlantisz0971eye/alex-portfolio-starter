"use client";

import { Waypoints, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { BoardMeta } from "../lib/boardStore";
import { parseResponse } from "./api";
import { Mindstream } from "./Mindstream";
import { PageTitle, TopRow } from "./Shell";

type Props = { onError: (message: string) => void; onSignOut: () => void; openId?: string | null; refresh: number };
const when = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** Mindstreams: each one is a note and a board that stay in step, with DeepSeek turning one into the other. */
export function Mindstreams({ onError, onSignOut, openId: initialOpen, refresh }: Props) {
  const [boards, setBoards] = useState<BoardMeta[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoards((await parseResponse<{ boards: BoardMeta[] }>(await fetch("/api/workspace/boards", { cache: "no-store" }))).boards);
    } catch (cause) {
      setBoards((current) => current ?? []);
      onError(cause instanceof Error ? cause.message : "Could not load mindstreams.");
    }
  }, [onError]);
  useEffect(() => { void load(); }, [load, refresh]);

  async function create() {
    setCreating(true);
    try {
      const { board } = await parseResponse<{ board: BoardMeta }>(await fetch("/api/workspace/boards", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
      setBoards((current) => [board, ...(current ?? [])]);
      setOpenId(board.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not create a mindstream.");
    } finally {
      setCreating(false);
    }
  }

  async function remove(board: BoardMeta) {
    if (!window.confirm(`Delete the mindstream “${board.title}”, its board and images? Its note moves to the Notes trash.`)) return;
    try {
      await parseResponse(await fetch(`/api/workspace/boards/${board.id}`, { method: "DELETE" }));
      setBoards((current) => (current ?? []).filter((item) => item.id !== board.id));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not delete the mindstream.");
    }
  }

  return <>
    <main className="page">
      <TopRow onSignOut={onSignOut} />
      <PageTitle actions={<button type="button" className="ws-round" aria-label="New mindstream" onClick={() => void create()} disabled={creating}>{creating ? <Loader2 className="ws-spin" size={18} /> : <Plus size={18} />}</button>}>Mindstreams</PageTitle>
      {boards === null && <div className="mail-skeleton"><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div></div>}
      {boards?.length === 0 && <div className="empty"><Waypoints size={28} /><p>No mindstreams yet.</p><small>A mindstream is a note and a board that stay in step. Photograph your notebook, sketch on the board, and let DeepSeek turn one into the other.</small><button type="button" className="ws-pill ws-pill--solid" onClick={() => void create()}><Plus size={16} /> New mindstream</button></div>}
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
    {openId && <Mindstream boardId={openId} onClose={() => setOpenId(null)} onError={onError} onChanged={() => void load()} />}
  </>;
}
