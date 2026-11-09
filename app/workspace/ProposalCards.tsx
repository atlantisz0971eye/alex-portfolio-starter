"use client";

import { Check, Loader2, MessageSquare, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { parseResponse } from "./api";
import { dayFormat, timeFormat, zone } from "./calendarFormat";
import { flushMindstream, notifyMindstreamChanged } from "./mindstreamBus";

export type Summary = { title: string; start: string; end: string; allDay: boolean; location: string; category: string; repeat?: unknown };
export type Proposal = {
  op: "create" | "update" | "delete" | "note_create" | "note_append" | "ms_note" | "ms_board" | "ask";
  ms?: { boardId: string; title: string; mode?: "replace" | "append"; markdown?: string; ops?: unknown[]; lines?: string[]; why?: string };
  note?: { id?: string; title: string; markdown: string; parentId?: string | null };
  id?: string;
  scope?: "this" | "all";
  occurrenceDate?: string;
  event?: Record<string, unknown>;
  before?: Summary;
  after?: Summary;
  conflicts: string[];
  why?: string;
  /** For "ask": a question whose answer decides what to do, with quick answers. */
  ask?: { question: string; about: string; options: string[] };
  /** The person's answer on the card and what the assistant did with it (Today only). */
  reply?: { you: string; answer: string };
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
    const result = await parseResponse<{ noteId?: string }>(await fetch("/api/workspace/mindstream/apply", { method: "POST", headers: json, body: JSON.stringify(body) }));
    notifyMindstreamChanged(proposal.ms.boardId, result.noteId);
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

type CardProps = { proposal: Proposal; status: Status; onApply: () => void; onDismiss: () => void; onReply?: (text: string) => Promise<void> };

/** One proposed change, with the buttons that confirm or dismiss it. */
export function ProposalCard({ proposal, status, onApply, onDismiss, onReply }: CardProps) {
  const shown = proposal.after ?? proposal.before;
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  async function send(value?: string) {
    const text = (value ?? draft).trim();
    if (!text || !onReply || sending) return;
    setSending(true);
    try { await onReply(text); setDraft(""); setWriting(false); } catch { /* the page reports it */ } finally { setSending(false); }
  }
  const asking = proposal.op === "ask" && !!proposal.ask;
  return <div className={`ca-card ca-card--${proposal.op === "ms_note" || proposal.op === "ms_board" ? (proposal.ms?.mode === "replace" ? "update" : "create") : proposal.op.replace("note_", "")} is-${status}`}>
    <div className="ca-card__head"><b>{proposal.op === "ms_note" ? (proposal.ms?.mode === "replace" ? "Rewrite mindstream note" : "Add to mindstream note") : proposal.op === "ms_board" ? "Change mindstream board" : proposal.op === "note_create" ? "New note" : proposal.op === "note_append" ? "Add to note" : proposal.op === "create" ? "New event" : proposal.op === "update" ? "Change event" : proposal.op === "ask" ? "Question" : "Delete event"}</b>{proposal.scope === "this" && <small>This occurrence only</small>}</div>
    {proposal.ms && <p className="ca-card__after"><strong>{proposal.ms.title}</strong>{proposal.ms.why && <span>{proposal.ms.why}</span>}{proposal.ms.markdown && <span className="ca-card__note">{proposal.ms.markdown.slice(0, 360)}{proposal.ms.markdown.length > 360 ? "…" : ""}</span>}{proposal.ms.lines && <span className="ca-card__note">{proposal.ms.lines.slice(0, 8).join("\n")}{proposal.ms.lines.length > 8 ? `\n…and ${proposal.ms.lines.length - 8} more` : ""}</span>}</p>}
    {proposal.note && <p className="ca-card__after"><strong>{proposal.note.title}</strong><span className="ca-card__note">{proposal.note.markdown.slice(0, 320)}{proposal.note.markdown.length > 320 ? "…" : ""}</span></p>}
    {proposal.op === "update" && proposal.before && <p className="ca-card__before">{proposal.before.title} · {when(proposal.before)}{proposal.before.location ? ` · ${proposal.before.location}` : ""}</p>}
    {shown && <p className={proposal.op === "delete" ? "ca-card__gone" : "ca-card__after"}><strong>{shown.title}</strong><span>{when(shown)}{shown.location ? ` · ${shown.location}` : ""}</span></p>}
    {asking && <p className="ca-card__question">{proposal.ask!.question}</p>}
    {proposal.why && <p className="ca-card__why">{proposal.why}</p>}
    {proposal.conflicts.length > 0 && <p className="ca-card__warn"><TriangleAlert size={14} /> Overlaps with {proposal.conflicts.join(", ")}</p>}
    {proposal.reply && <div className="ca-card__reply"><p><b>你：</b>{proposal.reply.you}</p><p><b>助手：</b>{proposal.reply.answer}</p></div>}
    <div className="ca-card__actions">
      {status === "done" ? <span className="ca-card__done"><Check size={15} /> Done</span> : status === "dismissed" ? <span className="ws-muted">{proposal.reply ? "Answered" : "Dismissed"}</span> : asking ? <>
        {onReply && proposal.ask!.options.map((option) => <button key={option} type="button" className="ws-pill ca-card__option" disabled={sending} onClick={() => void send(option)}>{option}</button>)}
        {sending && <Loader2 className="ws-spin" size={14} />}
        <button type="button" className="ws-text-button" disabled={sending} onClick={onDismiss}>Skip</button>
        {onReply && <button type="button" className="ws-text-button ca-card__reply-toggle" aria-expanded={writing} disabled={sending} onClick={() => setWriting((open) => !open)}><MessageSquare size={14} /> Reply</button>}
      </> : <>
        <button type="button" className={`ws-pill${proposal.op === "delete" ? " ws-pill--danger" : " ws-pill--solid"}`} disabled={status === "applying" || sending} onClick={onApply}>{status === "applying" ? <Loader2 className="ws-spin" size={14} /> : status === "failed" ? "Try again" : proposal.op === "delete" ? "Delete" : "Confirm"}</button>
        <button type="button" className="ws-text-button" disabled={sending} onClick={onDismiss}>Dismiss</button>
        {onReply && <button type="button" className="ws-text-button ca-card__reply-toggle" aria-expanded={writing} disabled={sending} onClick={() => setWriting((open) => !open)}><MessageSquare size={14} /> Reply</button>}
      </>}
    </div>
    {writing && onReply && status !== "done" && status !== "dismissed" && <form className="ca-card__compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <textarea value={draft} rows={2} maxLength={500} autoFocus placeholder={asking ? "用你自己的话回答" : "比如：这个我已经报名了 / 这就是我加过的 Personal Tutorial / 改到周四下午"} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }} disabled={sending} />
      <div className="ca-card__compose-row"><small className="ws-muted">助手会按你的话改这张卡，并记住这句话</small><button type="submit" className="ws-pill ws-pill--solid" disabled={sending || !draft.trim()}>{sending ? <Loader2 className="ws-spin" size={14} /> : "Send"}</button></div>
    </form>}
  </div>;
}
