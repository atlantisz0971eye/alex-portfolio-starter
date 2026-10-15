"use client";

import { ChevronLeft, Loader2, Mail as MailIcon, Paperclip, RefreshCw, Search, Send, Sparkles, Square, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { errors, parseResponse, streamNdjson } from "./api";

type Account = { id: string; email: string; connectedAt: string };
type Summary = { id: string; account: string; from: string; fromEmail: string; subject: string; snippet: string; date: number; unread: boolean };
type Detail = Summary & { to: string; body: string; attachments: { name: string; size: number }[]; truncated: boolean };
type Failure = { account: string; email: string; reason: "reauth" | "failed" };
type Inbox = { messages: Summary[]; next: Record<string, string> | null; failures: Failure[] };

const short = (email: string) => email.split("@")[0];

function when(value: number) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat(undefined, date.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" }).format(date);
}

/** Plain text with links made tappable; nothing from the message is rendered as HTML. */
function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>()"']+)/g).map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a>
    : <Fragment key={index}>{part}</Fragment>);
}

export function Mail({ tabs, onError }: { tabs: ReactNode; onError: (message: string) => void }) {
  const [state, setState] = useState<"loading" | "setup" | "ready">("loading");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [max, setMax] = useState(2);
  const [missing, setMissing] = useState<string[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<Summary | null>(null);
  const request = useRef(0);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await parseResponse<{ configured: boolean; missing?: string[]; accounts: Account[]; max: number }>(await fetch("/api/workspace/mail/accounts", { cache: "no-store" }));
      setAccounts(data.accounts);
      setMax(data.max);
      setMissing(data.missing ?? []);
      setState(data.configured ? "ready" : "setup");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not load mail.");
      setState("ready");
    }
  }, [onError]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const load = useCallback(async (q: string, only: string | null) => {
    const id = ++request.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (only) params.set("account", only);
      const data = await parseResponse<Inbox>(await fetch(`/api/workspace/mail/messages?${params}`, { cache: "no-store" }));
      if (id === request.current) setInbox(data);
    } catch (cause) {
      if (id === request.current) onError(cause instanceof Error ? cause.message : "Could not load mail.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [onError]);

  // Search as you type, after a short pause.
  useEffect(() => {
    if (state !== "ready" || accounts.length === 0) return;
    const timer = window.setTimeout(() => void load(query.trim(), account), query ? 450 : 0);
    return () => window.clearTimeout(timer);
  }, [state, accounts.length, query, account, load]);

  async function loadMore() {
    if (!inbox?.next || more) return;
    setMore(true);
    try {
      const params = new URLSearchParams({ next: JSON.stringify(inbox.next) });
      if (query.trim()) params.set("q", query.trim());
      if (account) params.set("account", account);
      const data = await parseResponse<Inbox>(await fetch(`/api/workspace/mail/messages?${params}`, { cache: "no-store" }));
      setInbox({ messages: [...inbox.messages, ...data.messages], next: data.next, failures: inbox.failures });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not load more mail.");
    } finally {
      setMore(false);
    }
  }

  async function disconnect(target: Account) {
    if (!window.confirm(`Disconnect ${target.email}? Workspace will lose access to this mailbox.`)) return;
    try {
      await parseResponse(await fetch(`/api/workspace/mail/accounts?id=${encodeURIComponent(target.id)}`, { method: "DELETE" }));
      setAccount(null);
      setInbox(null);
      await loadAccounts();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not disconnect.");
    }
  }

  return <main className="library mail">
    {tabs}
    <div className="library__title">
      <h1>Mail</h1>
      {accounts.length > 0 && <button type="button" className="ws-round" aria-label="Refresh" onClick={() => void load(query.trim(), account)} disabled={loading}>{loading ? <Loader2 className="ws-spin" size={18} /> : <RefreshCw size={18} />}</button>}
    </div>

    {state === "loading" && <p className="library__empty"><Loader2 className="ws-spin" size={18} /></p>}
    {state === "setup" && <div className="library__empty">
      <MailIcon size={28} />
      <p>Mail is not set up yet.</p>
      <small>{missing.length ? `Missing in this deployment: ${missing.join(", ")}.` : "Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and MAIL_TOKEN_KEY in Vercel, then redeploy."}</small>
    </div>}
    {state === "ready" && accounts.length === 0 && <div className="library__empty">
      <MailIcon size={28} />
      <p>Connect a Gmail account to read your mail here.</p>
      <a className="ws-pill ws-pill--solid" href="/api/workspace/mail/connect">Connect Gmail</a>
      <small>Read-only access. Workspace cannot send, delete or change mail.</small>
    </div>}

    {state === "ready" && accounts.length > 0 && <>
      <label className="mail-search">
        <Search size={16} />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mail" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" />
        {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></button>}
      </label>
      <div className="mail-chips">
        <button type="button" className={account === null ? "is-on" : ""} onClick={() => setAccount(null)}>All</button>
        {accounts.map((item) => <button key={item.id} type="button" className={account === item.id ? "is-on" : ""} onClick={() => setAccount(item.id)}>{short(item.email)}</button>)}
        {accounts.length < max && <a href="/api/workspace/mail/connect" className="mail-chips__add">+ Add</a>}
      </div>
      {inbox?.failures.map((failure) => <p key={failure.account} className="mail-banner">
        {failure.reason === "reauth" ? <>Access to {failure.email} expired. <a href={`/api/workspace/mail/connect?hint=${encodeURIComponent(failure.email)}`}>Reconnect</a></> : <>Could not load {failure.email}.</>}
      </p>)}
      {inbox === null ? <p className="library__empty"><Loader2 className="ws-spin" size={18} /></p> : inbox.messages.length === 0 ? <p className="library__empty">{query ? "No messages match your search." : "Nothing in the inbox."}</p> : <ul className="mail-list">
        {inbox.messages.map((message) => <li key={`${message.account}-${message.id}`}>
          <button type="button" onClick={() => setOpen(message)}>
            <span className={`mail-dot${message.unread ? " is-unread" : ""}`} aria-label={message.unread ? "Unread" : undefined} />
            <span className="mail-row">
              <span className="mail-row__top"><strong>{message.from}</strong><time>{when(message.date)}</time></span>
              <span className="mail-row__subject">{message.subject}</span>
              <span className="mail-row__snippet">{message.snippet}</span>
              {accounts.length > 1 && <small>{short(accounts.find((item) => item.id === message.account)?.email ?? "")}</small>}
            </span>
          </button>
        </li>)}
      </ul>}
      {inbox?.next && <div className="mail-more"><button type="button" className="ws-pill" onClick={() => void loadMore()} disabled={more}>{more ? <Loader2 className="ws-spin" size={16} /> : "Load more"}</button></div>}
      <ul className="mail-accounts">
        {accounts.map((item) => <li key={item.id}><span>{item.email}</span><button type="button" className="ws-text-button" onClick={() => void disconnect(item)}>Disconnect</button></li>)}
      </ul>
    </>}

    {open && <MailMessage summary={open} onClose={() => setOpen(null)} onError={onError} />}
  </main>;
}

type Turn = { question?: string; text: string };

function MailMessage({ summary, onClose, onError }: { summary: Summary; onClose: () => void; onError: (message: string) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState<Turn | null>(null);
  const [question, setQuestion] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/mail/message?account=${encodeURIComponent(summary.account)}&id=${encodeURIComponent(summary.id)}`, { cache: "no-store" })
      .then((response) => parseResponse<{ message: Detail }>(response))
      .then((data) => { if (!cancelled) setDetail(data.message); })
      .catch((cause) => { if (!cancelled) setFailed(cause instanceof Error ? cause.message : errors.mail_failed); });
    return () => { cancelled = true; abort.current?.abort(); };
  }, [summary.account, summary.id]);

  async function ask(action: "summarize" | "ask", text = "") {
    if (live) return;
    const controller = new AbortController();
    abort.current = controller;
    let received = "";
    setLive({ question: action === "ask" ? text : undefined, text: "" });
    try {
      await streamNdjson("/api/workspace/mail/assist", { account: summary.account, id: summary.id, action, question: text }, (delta) => {
        received += delta;
        setLive((current) => current && { ...current, text: received });
      }, controller.signal);
      setTurns((current) => [...current, { question: action === "ask" ? text : undefined, text: received }]);
    } catch (cause) {
      if (!controller.signal.aborted) onError(cause instanceof Error ? cause.message : "The assistant could not answer.");
    } finally {
      setLive(null);
    }
  }

  const shown = detail ?? summary;
  return <div className="mail-view">
    <header className="mail-view__bar">
      <button type="button" className="ws-text-button" onClick={onClose}><ChevronLeft size={22} /> Mail</button>
    </header>
    <div className="mail-view__scroll">
      <h2>{shown.subject}</h2>
      <div className="mail-view__meta">
        <strong>{shown.from}</strong> <span>&lt;{shown.fromEmail}&gt;</span>
        {detail?.to && <p>To: {detail.to}</p>}
        <p>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(shown.date))}</p>
      </div>
      {failed ? <p className="mail-banner">{failed}</p> : !detail ? <p className="library__empty"><Loader2 className="ws-spin" size={18} /></p> : <>
        {detail.attachments.length > 0 && <ul className="mail-attachments">{detail.attachments.map((item, index) => <li key={index}><Paperclip size={14} /> {item.name}</li>)}</ul>}
        <div className="mail-body">{linkify(detail.body || "(This message has no text content.)")}</div>
        {detail.truncated && <p className="ws-note">Long message shortened.</p>}
        <section className="ws-card mail-ai">
          <div className="ws-card__head"><span><Sparkles size={15} /> DeepSeek</span></div>
          {turns.length === 0 && !live && <>
            <button type="button" className="ws-pill" onClick={() => void ask("summarize")}><Sparkles size={16} /> Summarize this email</button>
            <p className="ws-note">Sends this email’s text to DeepSeek.</p>
          </>}
          {[...turns, ...(live ? [live] : [])].map((turn, index) => <div key={index} className="mail-ai__turn">
            {turn.question && <p className="ws-quote">{turn.question}</p>}
            {turn.text ? <div className="ws-markdown"><ReactMarkdown>{turn.text}</ReactMarkdown></div> : <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Reading…</p>}
          </div>)}
          {(turns.length > 0 || live) && <form className="mail-ai__form" onSubmit={(event) => { event.preventDefault(); const text = question.trim(); if (text.length >= 2) { setQuestion(""); void ask("ask", text); } }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this email" enterKeyHint="send" />
            {live ? <button type="button" aria-label="Stop" onClick={() => abort.current?.abort()}><Square size={14} fill="currentColor" /></button> : <button type="submit" aria-label="Send" disabled={question.trim().length < 2}><Send size={16} /></button>}
          </form>}
        </section>
      </>}
    </div>
  </div>;
}
