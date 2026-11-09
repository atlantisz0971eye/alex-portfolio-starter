"use client";

import { Check, Loader2, Send, Sparkles, Square } from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AssistantScreen } from "../lib/assistantScreens";
import { streamNdjson } from "./api";
import { openMail } from "./assistantFocus";
import { currentMindstream } from "./mindstreamBus";
import { zone } from "./calendarFormat";
import { applyProposal, ProposalCard, type Proposal, type Status } from "./ProposalCards";
import { Sheet } from "./Sheet";
import { UserContext } from "./Shell";

type Message = { role: "user" | "assistant"; text: string; tools?: string[]; proposals?: Proposal[]; status?: Status[] };

const SUGGESTIONS: Record<AssistantScreen | "home", string[]> = {
  calendar: ["Summarize my week", "Find a free 2-hour slot this week", "Add events from my recent emails"],
  mail: ["Summarize my unread mail", "Which emails need a reply?", "Add events from this week’s emails to my calendar"],
  library: ["What am I reading, and how far along?", "What should I read next?"],
  devlog: ["Find a free 2-hour slot this week to write up my project", "Summarize my week and unread mail"],
  mindstreams: ["Review this mindstream for gaps and contradictions", "Which cards are missing from the note?", "Which cards are duplicates or too vague?"],
  carcosa: ["Summarize my week and unread mail", "Summarize my recent notes", "Find a free 2-hour slot this week"],
  today: ["Re-plan my day around my new mail", "Which emails need a reply today?", "Add events from my recent emails"],
  home: ["Summarize my week and unread mail", "Add events from my recent emails", "Find a free 2-hour slot this week"],
};

const HISTORY_CHARS = 1500;
/** The conversation is kept in this browser so a reload does not erase it; an old one is not brought back. */
export const CHAT_KEY = "ws-assistant-chat";
const CHAT_HOURS = 12;
const CHAT_TURNS = 30;

const OUTCOME: Record<Status, string> = { pending: "用户还没处理", applying: "用户还没处理", done: "用户已确认，已生效", failed: "确认时出错，没有生效", dismissed: "用户已忽略" };

/** What the model is told about an earlier turn's cards: one line each, with what the person did. Without it "the second one" points at nothing. */
function recall(message: Message) {
  if (!message.proposals?.length) return "";
  const lines = message.proposals.map((proposal, index) => {
    const shown = proposal.after ?? proposal.before;
    const what = proposal.op === "create" ? "新建日程" : proposal.op === "update" ? "修改日程" : proposal.op === "delete" ? "删除日程" : "追加到笔记";
    const detail = shown ? `「${shown.title.slice(0, 60)}」${shown.start}${proposal.id ? `（日程 id ${proposal.id}）` : ""}` : proposal.note ? `「${proposal.note.title.slice(0, 60)}」` : "";
    return `${index + 1}. ${what}${detail}：${OUTCOME[message.status?.[index] ?? "pending"]}`;
  });
  return `\n\n[系统记录：这一轮提议的卡片和用户的处理]\n${lines.join("\n")}`;
}

type Props = { open: boolean; onClose: () => void; screen: AssistantScreen | null; onChanged: () => void; onError: (message: string) => void };

/** Chat with DeepSeek across the library, mail and calendar. It proposes calendar changes; nothing is written until you confirm each one. */
export function GlobalAssistant({ open, onClose, screen, onChanged, onError }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; retry: () => void } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { user } = useContext(UserContext);
  const chatKey = `${CHAT_KEY}:${user?.id ?? "owner"}`;
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(chatKey) ?? "null") as { at?: number; messages?: Message[] } | null;
      // A card caught mid-confirmation comes back as waiting: whether it went through is not known here.
      if (saved?.at && Date.now() - saved.at < CHAT_HOURS * 3_600_000 && Array.isArray(saved.messages)) setMessages(saved.messages.map((item) => ({ ...item, status: item.status?.map((value) => value === "applying" ? "pending" : value) })));
    } catch { /* nothing kept, or storage is unavailable */ }
    setRestored(true);
  }, [chatKey]);
  useEffect(() => {
    if (!restored || busy) return;
    try {
      if (messages.length) localStorage.setItem(chatKey, JSON.stringify({ at: Date.now(), messages: messages.slice(-CHAT_TURNS) }));
      else localStorage.removeItem(chatKey);
    } catch { /* the chat still works without being kept */ }
  }, [messages, busy, restored, chatKey]);
  const reset = () => { abort.current?.abort(); setMessages([]); setFailure(null); setInput(""); };

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, failure, open]);
  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    // Long answers are cut for the model's memory only; the screen keeps them whole.
    const history = messages.filter((item) => item.text || item.proposals?.length).slice(-6).map((item) => ({ role: item.role, content: `${item.text.length > HISTORY_CHARS ? `${item.text.slice(0, HISTORY_CHARS)}…` : item.text}${recall(item)}`.trim() }));
    setFailure(null);
    setInput("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text: message }, { role: "assistant", text: "" }]);
    const patchLast = (change: (item: Message) => Message) => setMessages((current) => current.map((item, index) => index === current.length - 1 ? change(item) : item));
    try {
      await streamNdjson("/api/workspace/agent", { message, history, zone: zone(), context: screen, mindstreamId: screen === "mindstreams" ? currentMindstream() : null, mail: screen === "mail" || screen === "today" ? openMail() : null }, (delta) => patchLast((item) => ({ ...item, text: item.text + delta })), controller.signal, (event) => {
        if (event.t === "tool" && typeof event.label === "string") patchLast((item) => ({ ...item, tools: [...(item.tools ?? []), event.label as string] }));
        else if (event.t === "action" && event.action && typeof event.action === "object") patchLast((item) => ({ ...item, proposals: [...(item.proposals ?? []), event.action as Proposal], status: [...(item.status ?? []), "pending" as Status] }));
        // The closing list only matters when the cards did not already arrive one by one.
        else if (event.t === "actions" && Array.isArray(event.actions)) patchLast((item) => item.proposals?.length ? item : ({ ...item, proposals: event.actions as Proposal[], status: (event.actions as Proposal[]).map(() => "pending" as Status) }));
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
  }, [busy, messages, onError, screen]);

  async function apply(messageIndex: number, proposalIndex: number) {
    const proposal = messages[messageIndex]?.proposals?.[proposalIndex];
    if (!proposal) return;
    const mark = (status: Status) => setMessages((current) => current.map((item, index) => index === messageIndex ? { ...item, status: item.status?.map((value, i) => i === proposalIndex ? status : value) } : item));
    mark("applying");
    try {
      await applyProposal(proposal);
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

  return <Sheet open={open} onClose={onClose} title="Assistant" size="tall" flush>
    <div className="ws-chat">
      <div className="ws-chat__scroll">
        {messages.length === 0 && <div className="ca-intro">
          <p><Sparkles size={16} /> Ask across your library, mail and calendar. I can read them to find and summarize things, and propose calendar changes — nothing is saved until you confirm it.</p>
          <div className="ca-suggest">{SUGGESTIONS[screen ?? "home"].map((text) => <button key={text} type="button" className="ws-pill" onClick={() => void send(text)}>{text}</button>)}</div>
          <small className="ws-note">When you ask, the calendar entries, emails or book passages I look up are sent to DeepSeek. Mail and the library stay read-only.</small>
        </div>}
        {messages.length > 0 && <button type="button" className="ws-text-button ca-new" onClick={reset}>New chat</button>}
        {messages.map((message, messageIndex) => <div key={messageIndex} className={`ca-turn ca-turn--${message.role}`}>
          {message.role === "assistant" && message.tools && message.tools.length > 0 && <ul className="ca-tools">{message.tools.map((label, index) => <li key={index}>{busy && messageIndex === messages.length - 1 && index === message.tools!.length - 1 && !message.text ? <Loader2 className="ws-spin" size={12} /> : <Check size={12} />} {label}</li>)}</ul>}
          {message.role === "user" ? <div className="ws-message ws-message--user"><div className="ws-markdown"><p>{message.text}</p></div></div> : <>
            {message.text ? <div className="ws-message ws-message--assistant"><div className="ws-markdown"><ReactMarkdown>{message.text}</ReactMarkdown></div></div> : busy && messageIndex === messages.length - 1 && !message.proposals && <div className="ws-message ws-message--assistant"><p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Thinking…</p></div>}
            {message.proposals?.map((proposal, proposalIndex) => <ProposalCard key={proposalIndex} proposal={proposal} status={message.status?.[proposalIndex] ?? "pending"} onApply={() => void apply(messageIndex, proposalIndex)} onDismiss={() => dismiss(messageIndex, proposalIndex)} />)}
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
