"use client";

import { Check, Loader2, Send, Sparkles, Square, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { parseResponse, streamNdjson } from "./api";
import { dayFormat, timeFormat, zone } from "./calendarFormat";
import { Sheet } from "./Sheet";

type Summary = { title: string; start: string; end: string; allDay: boolean; location: string; category: string; repeat: unknown };
type Proposal = { op: "create" | "update" | "delete"; id?: string; scope?: "this" | "all"; occurrenceDate?: string; event?: Record<string, unknown>; before?: Summary; after?: Summary; conflicts: string[] };
type Status = "pending" | "applying" | "done" | "failed" | "dismissed";
type Message = { role: "user" | "assistant"; text: string; proposals?: Proposal[]; status?: Status[] };

const SUGGESTIONS = ["Summarize my week", "Find a free 2-hour slot this week", "Add a meeting next Wednesday at 3pm"];

function when(item: Summary) {
  const parse = (value: string) => item.allDay ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : new Date(value);
  const start = parse(item.start);
  return item.allDay ? `${dayFormat.format(start)} · All day` : `${dayFormat.format(start)} · ${timeFormat.format(start)} – ${timeFormat.format(parse(item.end))}`;
}

type Props = { open: boolean; onClose: () => void; onChanged: () => void; onError: (message: string) => void };

/** Chat with DeepSeek about the schedule. It proposes changes; nothing is written until you confirm each one. */
export function ScheduleAssistant({ open, onClose, onChanged, onError }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; retry: () => void } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, failure, open]);
  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const history = messages.filter((item) => item.text).slice(-6).map((item) => ({ role: item.role, content: item.text }));
    setFailure(null);
    setInput("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text: message }, { role: "assistant", text: "" }]);
    const patchLast = (change: (item: Message) => Message) => setMessages((current) => current.map((item, index) => index === current.length - 1 ? change(item) : item));
    try {
      await streamNdjson("/api/workspace/calendar/agent", { message, history, zone: zone() }, (delta) => patchLast((item) => ({ ...item, text: item.text + delta })), controller.signal, (event) => {
        if (event.t === "actions" && Array.isArray(event.actions)) patchLast((item) => ({ ...item, proposals: event.actions as Proposal[], status: (event.actions as Proposal[]).map(() => "pending" as Status) }));
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const reason = cause instanceof Error ? cause.message : "The assistant could not answer.";
      setMessages((current) => current.filter((item, index) => !(index === current.length - 1 && !item.text && !item.proposals)));
      setFailure({ message: reason, retry: () => void send(message) });
      onError(reason);
    } finally {
      setBusy(false);
    }
  }, [busy, messages, onError]);

  async function apply(messageIndex: number, proposalIndex: number) {
    const proposal = messages[messageIndex]?.proposals?.[proposalIndex];
    if (!proposal) return;
    const mark = (status: Status) => setMessages((current) => current.map((item, index) => index === messageIndex ? { ...item, status: item.status?.map((value, i) => i === proposalIndex ? status : value) } : item));
    mark("applying");
    try {
      const json = { "Content-Type": "application/json" };
      if (proposal.op === "create") await parseResponse(await fetch("/api/workspace/calendar/events", { method: "POST", headers: json, body: JSON.stringify({ event: proposal.event, zone: zone(), by: "agent" }) }));
      else if (proposal.op === "update") await parseResponse(await fetch("/api/workspace/calendar/events", { method: "PATCH", headers: json, body: JSON.stringify({ id: proposal.id, event: proposal.event, scope: proposal.scope, occurrenceDate: proposal.occurrenceDate, zone: zone(), by: "agent" }) }));
      else {
        const params = new URLSearchParams({ id: proposal.id ?? "", scope: proposal.scope ?? "all" });
        if (proposal.occurrenceDate) params.set("occurrence", proposal.occurrenceDate);
        await parseResponse(await fetch(`/api/workspace/calendar/events?${params}`, { method: "DELETE" }));
      }
      mark("done");
      onChanged();
    } catch (cause) {
      mark("failed");
      onError(cause instanceof Error ? cause.message : "Could not apply the change.");
    }
  }

  const applyAll = async (messageIndex: number) => {
    const item = messages[messageIndex];
    for (let index = 0; index < (item.proposals?.length ?? 0); index += 1) if (item.status?.[index] === "pending") await apply(messageIndex, index);
  };
  const dismiss = (messageIndex: number, proposalIndex: number) => setMessages((current) => current.map((item, index) => index === messageIndex ? { ...item, status: item.status?.map((value, i) => i === proposalIndex ? "dismissed" : value) } : item));

  return <Sheet open={open} onClose={onClose} title="Schedule assistant" size="tall" flush>
    <div className="ws-chat">
      <div className="ws-chat__scroll">
        {messages.length === 0 && <div className="ca-intro">
          <p><Sparkles size={16} /> Ask about your week or tell me what to schedule. I’ll show each change for you to confirm before anything is saved.</p>
          <div className="ca-suggest">{SUGGESTIONS.map((text) => <button key={text} type="button" className="ws-pill" onClick={() => void send(text)}>{text}</button>)}</div>
          <small className="ws-note">Event titles and times are sent to DeepSeek when you ask.</small>
        </div>}
        {messages.map((message, messageIndex) => <div key={messageIndex} className={`ca-turn ca-turn--${message.role}`}>
          {message.role === "user" ? <div className="ws-message ws-message--user"><div className="ws-markdown"><p>{message.text}</p></div></div> : <>
            {message.text ? <div className="ws-message ws-message--assistant"><div className="ws-markdown"><ReactMarkdown>{message.text}</ReactMarkdown></div></div> : busy && messageIndex === messages.length - 1 && !message.proposals && <div className="ws-message ws-message--assistant"><p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Looking at your calendar…</p></div>}
            {message.proposals?.map((proposal, proposalIndex) => {
              const status = message.status?.[proposalIndex] ?? "pending";
              return <div key={proposalIndex} className={`ca-card ca-card--${proposal.op} is-${status}`}>
                <div className="ca-card__head"><b>{proposal.op === "create" ? "New event" : proposal.op === "update" ? "Change event" : "Delete event"}</b>{proposal.scope === "this" && <small>This occurrence only</small>}</div>
                {proposal.op === "update" && proposal.before && <p className="ca-card__before">{proposal.before.title} · {when(proposal.before)}{proposal.before.location ? ` · ${proposal.before.location}` : ""}</p>}
                {(proposal.after ?? proposal.before) && <p className={proposal.op === "delete" ? "ca-card__gone" : "ca-card__after"}><strong>{(proposal.after ?? proposal.before)!.title}</strong><span>{when((proposal.after ?? proposal.before)!)}{(proposal.after ?? proposal.before)!.location ? ` · ${(proposal.after ?? proposal.before)!.location}` : ""}</span></p>}
                {proposal.conflicts.length > 0 && <p className="ca-card__warn"><TriangleAlert size={14} /> Overlaps with {proposal.conflicts.join(", ")}</p>}
                <div className="ca-card__actions">
                  {status === "done" ? <span className="ca-card__done"><Check size={15} /> Done</span> : status === "dismissed" ? <span className="ws-muted">Dismissed</span> : <>
                    <button type="button" className={`ws-pill${proposal.op === "delete" ? " ws-pill--danger" : " ws-pill--solid"}`} disabled={status === "applying"} onClick={() => void apply(messageIndex, proposalIndex)}>{status === "applying" ? <Loader2 className="ws-spin" size={14} /> : status === "failed" ? "Try again" : proposal.op === "delete" ? "Delete" : "Confirm"}</button>
                    <button type="button" className="ws-text-button" onClick={() => dismiss(messageIndex, proposalIndex)}>Dismiss</button>
                  </>}
                </div>
              </div>;
            })}
            {(message.proposals?.filter((_, i) => message.status?.[i] === "pending").length ?? 0) > 1 && <button type="button" className="ws-pill ca-all" onClick={() => void applyAll(messageIndex)}>Confirm all</button>}
          </>}
        </div>)}
        {failure && !busy && <div className="ws-card ws-card--error"><p>{failure.message}</p><button type="button" className="ws-pill" onClick={failure.retry}>Try again</button></div>}
        <div ref={endRef} />
      </div>
      <form className="ws-compose" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
        <textarea value={input} rows={1} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); } }} placeholder="Ask or schedule something" enterKeyHint="send" />
        {busy ? <button type="button" aria-label="Stop" onClick={() => abort.current?.abort()}><Square size={14} fill="currentColor" /></button> : <button type="submit" aria-label="Send" disabled={!input.trim()}><Send size={18} /></button>}
      </form>
    </div>
  </Sheet>;
}
