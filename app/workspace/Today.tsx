"use client";

import { ArrowRight, Check, Inbox, Loader2, MapPin, RefreshCw, Sparkles, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import { parseResponse } from "./api";
import { timeFormat, zone } from "./calendarFormat";
import { MailMessage, type MailItem } from "./Mail";
import { applyProposal, ProposalCard, type Proposal, type Status } from "./ProposalCards";
import { PageTitle, TopRow, type Tab } from "./Shell";
import { keepInNotebook } from "./keep";
import { notice } from "./notice";
import { Paper } from "./Paper";

type Plan = { generatedAt: string; date: string; text: string; proposals: (Proposal & { status?: "applied" | "dismissed" })[]; reason: string; basedOn: { from: string; subject: string }[] };
type Event = { id: string; title: string; start: string; end: string; allDay: boolean; category: string; location: string; occurrenceDate: string };
type Block = "plan" | "proposals" | "schedule" | "mail";
type Layout = { headline: string; kicker: string; order: Block[]; focus: Block | null };
type View = { configured: boolean; layout?: Layout | null; connected?: boolean; zone?: string; plan?: Plan | null; events?: Event[]; mail?: (MailItem & { category: string })[]; reauth?: string[] };

const COLORS: Record<string, string> = { personal: "#4a6fb8", study: "#4f8a5b", work: "#b9822e", other: "#8a5aa8" };
const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function ago(value: number) {
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

type Props = { onError: (message: string) => void; onSignOut: () => void; onTab: (tab: Tab) => void; refresh: number; onChanged: () => void; onSeen: () => void };

/** The home screen: a plan for today built from the calendar and new mail, today's schedule, and what just arrived. */
export function Today({ onError, onSignOut, onTab, refresh, onChanged, onSeen }: Props) {
  const [view, setView] = useState<View | null>(null);
  const [planning, setPlanning] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Keyed by the proposal's own id, so a plan that is replaced underneath never hands a status to a different card.
  const [local, setLocal] = useState<Record<string, Status>>({});
  const [open, setOpen] = useState<MailItem | null>(null);
  // The front page is off until the viewer turns it on, and a hidden one is never fetched, so it costs nothing.

  const load = useCallback(async () => {
    try {
      const data = await parseResponse<View>(await fetch(`/api/workspace/today?zone=${encodeURIComponent(zone())}`, { cache: "no-store" }));
      setView(data);
      if (data.plan) onSeen();
    } catch (cause) {
      setView((current) => current ?? { configured: true });
      onError(cause instanceof Error ? cause.message : "Could not load Today.");
    }
  }, [onError, onSeen]);

  useEffect(() => { void load(); }, [load, refresh]);

  const plan = view?.plan ?? null;
  // the front page stays hidden until the viewer turns it on; the choice is remembered per browser
  const [paper, setPaper] = useState(false);
  useEffect(() => { try { setPaper(localStorage.getItem("ws-front-page") === "on"); } catch { /* off */ } }, []);
  const togglePaper = () => setPaper((current) => { const next = !current; try { localStorage.setItem("ws-front-page", next ? "on" : "off"); } catch { /* per-viewer convenience only */ } return next; });
  const layout = view?.layout ?? null;
  // The model arranges the blocks; this only reads its answer. `order` places a block, `data-focus` stresses one.
  const place = (block: Block) => ({ "data-block": block, "data-focus": layout?.focus === block ? "" : undefined, style: layout ? { order: layout.order.indexOf(block) } : undefined });
  const localDate = useMemo(() => new Intl.DateTimeFormat("sv-SE", { timeZone: view?.zone ?? zone() }).format(new Date()), [view?.zone]);
  const stale = !!plan && plan.date !== localDate;

  async function regenerate() {
    if (planning) return;
    setPlanning(true);
    try {
      await parseResponse(await fetch("/api/workspace/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", zone: zone() }) }));
      await load();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not make a plan.");
    } finally {
      setPlanning(false);
    }
  }

  const pidOf = (proposal: Plan["proposals"][number], index: number) => proposal.pid ?? `${plan?.generatedAt}-${index}`;
  const statusOf = (proposal: Plan["proposals"][number], index: number): Status => local[pidOf(proposal, index)] ?? (proposal.status === "applied" ? "done" : proposal.status === "dismissed" ? "dismissed" : "pending");
  const record = (pid: string, status: "applied" | "dismissed") => void fetch("/api/workspace/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "proposal", pid, status }) }).catch(() => undefined);

  async function apply(pid: string) {
    const proposal = plan?.proposals.find((item, index) => pidOf(item, index) === pid);
    if (!proposal) return;
    setLocal((current) => ({ ...current, [pid]: "applying" }));
    try {
      await applyProposal(proposal);
      setLocal((current) => ({ ...current, [pid]: "done" }));
      record(pid, "applied");
      onChanged();
      void load();
    } catch (cause) {
      setLocal((current) => ({ ...current, [pid]: "failed" }));
      onError(cause instanceof Error ? cause.message : "Could not apply the change.");
    }
  }
  async function reply(pid: string, message: string) {
    try {
      const result = await parseResponse<{ answer: string; added: number }>(await fetch("/api/workspace/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discuss", pid, message, zone: zone() }) }));
      await load();
      if (result.added) onChanged();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not send your reply.");
      throw cause;
    }
  }
  const dismiss = (pid: string) => { setLocal((current) => ({ ...current, [pid]: "dismissed" })); record(pid, "dismissed"); };

  const now = Date.now();
  const mail = useMemo(() => {
    const seen = new Set<string>();
    return (view?.mail ?? []).filter((message) => { const key = `${message.from}|${message.subject}|${message.date}`; if (seen.has(key)) return false; seen.add(key); return true; });
  }, [view]);
  return <>
    <main className="page page--today">
      <TopRow onSignOut={onSignOut} />
      <div className="today">
        <header className="today__head">
          <PageTitle actions={view?.connected ? <button type="button" className="ws-round" aria-label="Make a new plan" onClick={() => void regenerate()} disabled={planning}>{planning ? <Loader2 className="ws-spin" size={18} /> : <RefreshCw size={18} />}</button> : undefined}>{layout?.headline || "Today"}</PageTitle>
          <p className="today__date"><Sun size={15} /> {today.format(new Date())}</p>
          {layout?.kicker && <p className="today__kicker">{layout.kicker}</p>}
        </header>

        <button type="button" className="ws-text-button today__paper-toggle" aria-pressed={paper} onClick={togglePaper}>{paper ? "■" : "□"} front page · {paper ? "hide" : "show"}</button>
        {paper && <Paper onError={onError} />}
        <h2 className="section-label today__day">your day</h2>

        {view === null && <div className="mail-skeleton"><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div></div>}
        {view && !view.configured && <div className="empty"><Inbox size={28} /><p>Mail is not set up yet.</p><small>Today builds your plan from your calendar and new email.</small></div>}
        {view && view.configured && !view.connected && <div className="empty"><Inbox size={28} /><p>Connect Gmail to get a plan for today.</p><a className="ws-pill ws-pill--solid" href="/api/workspace/mail/connect">Connect Gmail</a><small>Read-only access. New mail updates your plan automatically.</small></div>}

        {view?.connected && (view.reauth ?? []).map((email) => <p key={email} className="mail-banner">Access to {email} expired, so its mail is missing from today’s plan. <a href={`/api/workspace/mail/connect?hint=${encodeURIComponent(email)}`}>Reconnect</a></p>)}
        {view && view.connected && <div className="today__grid" data-directed={layout ? "" : undefined}>
          <div className="today__main">
            <section className="ws-card today__plan" aria-live="polite" {...place("plan")}>
              <div className="ws-card__head"><span><Sparkles size={15} /> Suggested plan</span>{plan && <small>{ago(Date.parse(plan.generatedAt))}</small>}</div>
              {planning && !plan ? <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Reading your mail and calendar…</p>
                : plan ? <>
                  {stale && <p className="today__stale">This plan is from an earlier day. <button type="button" onClick={() => void regenerate()}>Make today’s plan</button></p>}
                  <div className={`ws-markdown${planning ? " is-updating" : ""}`}><ReactMarkdown>{plan.text}</ReactMarkdown></div>
                  {planning && <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Updating…</p>}
                  <button type="button" className="ws-text-button today__keep" onClick={() => void keepInNotebook(`Today’s plan, ${plan.date}\n${plan.text}`).then(() => notice("Kept in your notebook.")).catch((cause) => onError(cause instanceof Error ? cause.message : "Could not keep it."))}>keep in notebook</button>
                  {plan.basedOn.length > 0 && <p className="today__based">{plan.reason === "new_mail" ? "Updated for new mail" : "Based on"}: {plan.basedOn.slice(0, 3).map((item) => item.subject).join(" · ")}{plan.basedOn.length > 3 ? ` · +${plan.basedOn.length - 3}` : ""}</p>}
                </> : <>
                  <p className="ws-muted">No plan yet.</p>
                  <button type="button" className="ws-pill ws-pill--solid" onClick={() => void regenerate()}><Sparkles size={15} /> Make today’s plan</button>
                </>}
            </section>

            {plan && plan.proposals.length > 0 && <section className="today__proposals" aria-label="Suggested calendar changes" {...place("proposals")}>
              <h2 className="section-label">From your mail</h2>
              {plan.proposals.map((proposal, index) => { const pid = pidOf(proposal, index); return <ProposalCard key={pid} proposal={proposal} status={statusOf(proposal, index)} onApply={() => void apply(pid)} onDismiss={() => dismiss(pid)} onReply={(text) => reply(pid, text)} />; })}
            </section>}
          </div>

          <aside className="today__side">
            <section aria-label="Today’s schedule" {...place("schedule")}>
              <h2 className="section-label">Schedule</h2>
              {(view.events ?? []).length === 0 ? <p className="today__none">Nothing scheduled today.</p> : <ul className="today__events">
                {(view.events ?? []).map((event) => <li key={event.id + event.occurrenceDate} className={!event.allDay && Date.parse(event.end) < now ? "is-past" : ""} style={{ "--c": COLORS[event.category] ?? "#8e8e93" } as CSSProperties}>
                  <span className="today__time">{event.allDay ? "All day" : timeFormat.format(new Date(event.start))}<small>{event.allDay ? "" : timeFormat.format(new Date(event.end))}</small></span>
                  <i />
                  <span className="today__what"><strong>{event.title}</strong>{event.location && <small><MapPin size={12} /> {event.location}</small>}</span>
                </li>)}
              </ul>}
            </section>
            <section aria-label="New mail" {...place("mail")}>
            <h2 className="section-label">New mail {mail.length > 0 && <span>{mail.length}</span>}</h2>
            {mail.length === 0 ? (view.reauth?.length ? <p className="today__none">Mail could not be read.</p> : <p className="today__none"><Check size={14} /> You’re all caught up.</p>) : <ul className="today__mail">
              {mail.slice(0, showAll ? 40 : 5).map((message) => <li key={`${message.account}-${message.id}`}>
                <button type="button" onClick={() => setOpen(message)}>
                  <span className="mail-dot is-unread" />
                  <span className="mail-row">
                    <span className="mail-row__top"><strong>{message.from}</strong><time>{clock.format(new Date(message.date))}</time></span>
                    <span className="mail-row__subject">{message.subject}</span>
                    <span className="mail-row__snippet">{message.snippet}</span>
                  </span>
                </button>
              </li>)}
            </ul>}
            {mail.length > 5 && !showAll && <button type="button" className="ws-text-button today__more" onClick={() => setShowAll(true)}>Show all {mail.length}</button>}
            <button type="button" className="ws-text-button today__more" onClick={() => onTab("mail")}>Open Mail <ArrowRight size={15} /></button>
            </section>
          </aside>
        </div>}
      </div>
    </main>
    {open && <MailMessage summary={open} onClose={() => setOpen(null)} onError={onError} />}
  </>;
}
