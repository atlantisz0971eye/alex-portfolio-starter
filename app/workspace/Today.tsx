"use client";

import { ArrowRight, Check, Inbox, Loader2, MapPin, RefreshCw, Sparkles, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import { parseResponse } from "./api";
import { timeFormat, zone } from "./calendarFormat";
import { MailMessage, type MailItem } from "./Mail";
import { applyProposal, ProposalCard, type Proposal, type Status } from "./ProposalCards";
import { PageTitle, TopRow, type Tab } from "./Shell";

type Plan = { generatedAt: string; date: string; text: string; proposals: (Proposal & { status?: "applied" | "dismissed" })[]; reason: string; basedOn: { from: string; subject: string }[] };
type Event = { id: string; title: string; start: string; end: string; allDay: boolean; category: string; location: string; occurrenceDate: string };
type View = { configured: boolean; connected?: boolean; zone?: string; plan?: Plan | null; events?: Event[]; mail?: (MailItem & { category: string })[] };

const COLORS: Record<string, string> = { personal: "#0a84ff", study: "#30d158", work: "#ff9f0a", other: "#bf5af2" };
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
  const [local, setLocal] = useState<Record<number, Status>>({});
  const [open, setOpen] = useState<MailItem | null>(null);

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
  const localDate = useMemo(() => new Intl.DateTimeFormat("sv-SE", { timeZone: view?.zone ?? zone() }).format(new Date()), [view?.zone]);
  const stale = !!plan && plan.date !== localDate;

  async function regenerate() {
    if (planning) return;
    setPlanning(true);
    setLocal({});
    try {
      await parseResponse(await fetch("/api/workspace/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", zone: zone() }) }));
      await load();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not make a plan.");
    } finally {
      setPlanning(false);
    }
  }

  const statusOf = (proposal: Plan["proposals"][number], index: number): Status => local[index] ?? (proposal.status === "applied" ? "done" : proposal.status === "dismissed" ? "dismissed" : "pending");
  const record = (index: number, status: "applied" | "dismissed") => void fetch("/api/workspace/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "proposal", index, status }) }).catch(() => undefined);

  async function apply(index: number) {
    const proposal = plan?.proposals[index];
    if (!proposal) return;
    setLocal((current) => ({ ...current, [index]: "applying" }));
    try {
      await applyProposal(proposal);
      setLocal((current) => ({ ...current, [index]: "done" }));
      record(index, "applied");
      onChanged();
      void load();
    } catch (cause) {
      setLocal((current) => ({ ...current, [index]: "failed" }));
      onError(cause instanceof Error ? cause.message : "Could not apply the change.");
    }
  }
  const dismiss = (index: number) => { setLocal((current) => ({ ...current, [index]: "dismissed" })); record(index, "dismissed"); };

  const now = Date.now();
  return <>
    <main className="page page--today">
      <TopRow onSignOut={onSignOut} />
      <div className="today">
        <header className="today__head">
          <PageTitle actions={view?.connected ? <button type="button" className="ws-round" aria-label="Make a new plan" onClick={() => void regenerate()} disabled={planning}>{planning ? <Loader2 className="ws-spin" size={18} /> : <RefreshCw size={18} />}</button> : undefined}>Today</PageTitle>
          <p className="today__date"><Sun size={15} /> {today.format(new Date())}</p>
        </header>

        {view === null && <div className="mail-skeleton"><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div></div>}
        {view && !view.configured && <div className="empty"><Inbox size={28} /><p>Mail is not set up yet.</p><small>Today builds your plan from your calendar and new email.</small></div>}
        {view && view.configured && !view.connected && <div className="empty"><Inbox size={28} /><p>Connect Gmail to get a plan for today.</p><a className="ws-pill ws-pill--solid" href="/api/workspace/mail/connect">Connect Gmail</a><small>Read-only access. New mail updates your plan automatically.</small></div>}

        {view && view.connected && <div className="today__grid">
          <div className="today__main">
            <section className="ws-card today__plan" aria-live="polite">
              <div className="ws-card__head"><span><Sparkles size={15} /> Suggested plan</span>{plan && <small>{ago(Date.parse(plan.generatedAt))}</small>}</div>
              {planning && !plan ? <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Reading your mail and calendar…</p>
                : plan ? <>
                  {stale && <p className="today__stale">This plan is from an earlier day. <button type="button" onClick={() => void regenerate()}>Make today’s plan</button></p>}
                  <div className={`ws-markdown${planning ? " is-updating" : ""}`}><ReactMarkdown>{plan.text}</ReactMarkdown></div>
                  {planning && <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Updating…</p>}
                  {plan.basedOn.length > 0 && <p className="today__based">{plan.reason === "new_mail" ? "Updated for new mail" : "Based on"}: {plan.basedOn.slice(0, 3).map((item) => item.subject).join(" · ")}{plan.basedOn.length > 3 ? ` · +${plan.basedOn.length - 3}` : ""}</p>}
                </> : <>
                  <p className="ws-muted">No plan yet.</p>
                  <button type="button" className="ws-pill ws-pill--solid" onClick={() => void regenerate()}><Sparkles size={15} /> Make today’s plan</button>
                </>}
            </section>

            {plan && plan.proposals.length > 0 && <section className="today__proposals" aria-label="Suggested calendar changes">
              <h2 className="section-label">From your mail</h2>
              {plan.proposals.map((proposal, index) => <ProposalCard key={index} proposal={proposal} status={statusOf(proposal, index)} onApply={() => void apply(index)} onDismiss={() => dismiss(index)} />)}
            </section>}

            <section aria-label="Today’s schedule">
              <h2 className="section-label">Schedule</h2>
              {(view.events ?? []).length === 0 ? <p className="today__none">Nothing scheduled today.</p> : <ul className="today__events">
                {(view.events ?? []).map((event) => <li key={event.id + event.occurrenceDate} className={!event.allDay && Date.parse(event.end) < now ? "is-past" : ""} style={{ "--c": COLORS[event.category] ?? "#8e8e93" } as CSSProperties}>
                  <span className="today__time">{event.allDay ? "All day" : timeFormat.format(new Date(event.start))}<small>{event.allDay ? "" : timeFormat.format(new Date(event.end))}</small></span>
                  <i />
                  <span className="today__what"><strong>{event.title}</strong>{event.location && <small><MapPin size={12} /> {event.location}</small>}</span>
                </li>)}
              </ul>}
            </section>
          </div>

          <aside className="today__side" aria-label="New mail">
            <h2 className="section-label">New mail {(view.mail ?? []).length > 0 && <span>{view.mail!.length}</span>}</h2>
            {(view.mail ?? []).length === 0 ? <p className="today__none"><Check size={14} /> You’re all caught up.</p> : <ul className="today__mail">
              {view.mail!.map((message) => <li key={`${message.account}-${message.id}`}>
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
            <button type="button" className="ws-text-button today__more" onClick={() => onTab("mail")}>Open Mail <ArrowRight size={15} /></button>
          </aside>
        </div>}
      </div>
    </main>
    {open && <MailMessage summary={open} onClose={() => setOpen(null)} onError={onError} />}
  </>;
}
