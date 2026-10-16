"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";
import { parseResponse } from "./api";
import { dayFormat, timeFormat, zone } from "./calendarFormat";
import { flushMindstream, notifyMindstreamChanged } from "./mindstreamBus";

export type Summary = { title: string; start: string; end: string; allDay: boolean; location: string; category: string; repeat?: unknown };
export type Proposal = {
  op: "create" | "update" | "delete" | "note_create" | "note_append" | "ms_note" | "ms_board";
  ms?: { boardId: string; title: string; mode?: "replace" | "append"; markdown?: string; ops?: unknown[]; lines?: string[]; why?: string };
  note?: { id?: string; title: string; markdown: string; parentId?: string | null };
  id?: string;
  scope?: "this" | "all";
  occurrenceDate?: string;
  event?: Record<string, unknown>;
  before?: Summary;
  after?: Summary;
  conflicts: string[];
};
export type Status = "pending" | "applying" | "done" | "failed" | "dismissed";

function when(item: Summary) {
  const parse = (value: string) => item.allDay ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : new Date(value);
  const start = parse(item.start);
  return item.allDay ? `${dayFormat.format(start)} · All day` : `${dayFormat.format(start)} · ${timeFormat.format(start)} – ${timeFormat.format(parse(item.end))}`;
}

/** Performs a confirmed proposal through the ordinary calendar and notes endpoints. */
export async function applyProposal(proposal: Proposal) {
  const json = { "Content-Type": "application/json" };
  if ((proposal.op === "ms_note" || proposal.op === "ms_board") && proposal.ms) {
    // The open panes save first, so the server change is built on what is on screen, then they reload.
    await flushMindstream();
    const body = proposal.op === "ms_note" ? { kind: "note", boardId: proposal.ms.boardId, mode: proposal.ms.mode, markdown: proposal.ms.markdown } : { kind: "board", boardId: proposal.ms.boardId, ops: proposal.ms.ops };
    await parseResponse(await fetch("/api/workspace/mindstream/apply", { method: "POST", headers: json, body: JSON.stringify(body) }));
    notifyMindstreamChanged(proposal.ms.boardId);
    return;
  }
  if (proposal.op === "note_create" && proposal.note) await parseResponse(await fetch("/api/workspace/notes", { method: "POST", headers: json, body: JSON.stringify({ title: proposal.note.title, markdown: proposal.note.markdown, parentId: proposal.note.parentId ?? null }) }));
  else if (proposal.op === "note_append" && proposal.note?.id) await parseResponse(await fetch(`/api/workspace/notes/${proposal.note.id}`, { method: "POST", headers: json, body: JSON.stringify({ action: "append", markdown: proposal.note.markdown }) }));
  else if (proposal.op === "create") await parseResponse(await fetch("/api/workspace/calendar/events", { method: "POST", headers: json, body: JSON.stringify({ event: proposal.event, zone: zone(), by: "agent" }) }));
  else if (proposal.op === "update") await parseResponse(await fetch("/api/workspace/calendar/events", { method: "PATCH", headers: json, body: JSON.stringify({ id: proposal.id, event: proposal.event, scope: proposal.scope, occurrenceDate: proposal.occurrenceDate, zone: zone(), by: "agent" }) }));
  else {
    const params = new URLSearchParams({ id: proposal.id ?? "", scope: proposal.scope ?? "all" });
    if (proposal.occurrenceDate) params.set("occurrence", proposal.occurrenceDate);
    await parseResponse(await fetch(`/api/workspace/calendar/events?${params}`, { method: "DELETE" }));
  }
}

type CardProps = { proposal: Proposal; status: Status; onApply: () => void; onDismiss: () => void };

/** One proposed change, with the buttons that confirm or dismiss it. */
export function ProposalCard({ proposal, status, onApply, onDismiss }: CardProps) {
  const shown = proposal.after ?? proposal.before;
  return <div className={`ca-card ca-card--${proposal.op === "ms_note" || proposal.op === "ms_board" ? (proposal.ms?.mode === "replace" ? "update" : "create") : proposal.op.replace("note_", "")} is-${status}`}>
    <div className="ca-card__head"><b>{proposal.op === "ms_note" ? (proposal.ms?.mode === "replace" ? "Rewrite mindstream note" : "Add to mindstream note") : proposal.op === "ms_board" ? "Change mindstream board" : proposal.op === "note_create" ? "New note" : proposal.op === "note_append" ? "Add to note" : proposal.op === "create" ? "New event" : proposal.op === "update" ? "Change event" : "Delete event"}</b>{proposal.scope === "this" && <small>This occurrence only</small>}</div>
    {proposal.ms && <p className="ca-card__after"><strong>{proposal.ms.title}</strong>{proposal.ms.why && <span>{proposal.ms.why}</span>}{proposal.ms.markdown && <span className="ca-card__note">{proposal.ms.markdown.slice(0, 360)}{proposal.ms.markdown.length > 360 ? "…" : ""}</span>}{proposal.ms.lines && <span className="ca-card__note">{proposal.ms.lines.slice(0, 8).join("\n")}{proposal.ms.lines.length > 8 ? `\n…and ${proposal.ms.lines.length - 8} more` : ""}</span>}</p>}
    {proposal.note && <p className="ca-card__after"><strong>{proposal.note.title}</strong><span className="ca-card__note">{proposal.note.markdown.slice(0, 320)}{proposal.note.markdown.length > 320 ? "…" : ""}</span></p>}
    {proposal.op === "update" && proposal.before && <p className="ca-card__before">{proposal.before.title} · {when(proposal.before)}{proposal.before.location ? ` · ${proposal.before.location}` : ""}</p>}
    {shown && <p className={proposal.op === "delete" ? "ca-card__gone" : "ca-card__after"}><strong>{shown.title}</strong><span>{when(shown)}{shown.location ? ` · ${shown.location}` : ""}</span></p>}
    {proposal.conflicts.length > 0 && <p className="ca-card__warn"><TriangleAlert size={14} /> Overlaps with {proposal.conflicts.join(", ")}</p>}
    <div className="ca-card__actions">
      {status === "done" ? <span className="ca-card__done"><Check size={15} /> Done</span> : status === "dismissed" ? <span className="ws-muted">Dismissed</span> : <>
        <button type="button" className={`ws-pill${proposal.op === "delete" ? " ws-pill--danger" : " ws-pill--solid"}`} disabled={status === "applying"} onClick={onApply}>{status === "applying" ? <Loader2 className="ws-spin" size={14} /> : status === "failed" ? "Try again" : proposal.op === "delete" ? "Delete" : "Confirm"}</button>
        <button type="button" className="ws-text-button" onClick={onDismiss}>Dismiss</button>
      </>}
    </div>
  </div>;
}
