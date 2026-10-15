"use client";

import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ExternalLink, Loader2, MapPin, Sparkles, Users, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import { parseResponse, streamNdjson } from "./api";
import { Sheet } from "./Sheet";
import { PageTitle, TopRow } from "./Shell";

type Account = { id: string; email: string; calendar: boolean };
type Ev = {
  id: string; account: string; calendarId: string; calendarName: string; color: string; title: string;
  start: string; end: string; allDay: boolean; location: string; description: string; link: string; meetingLink: string;
  attendees: { name: string; responded: string }[]; declined: boolean;
};
type Cal = { id: string; account: string; name: string; color: string; primary: boolean };
type Failure = { account: string; email: string; reason: "reauth" | "scope" | "failed" };
type Data = { events: Ev[]; calendars: Cal[]; failures: Failure[] };

const HOUR = 52;
const DAY_MS = 86_400_000;
const calKey = (item: { account: string; id?: string; calendarId?: string }) => `${item.account}:${item.id ?? item.calendarId}`;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const mondayOf = (date: Date) => addDays(startOfDay(date), -((date.getDay() + 6) % 7));
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** All-day events carry a plain date; read it as local midnight, not UTC. */
function parse(value: string, allDay: boolean) {
  if (!allDay) return new Date(value);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

function rangeLabel(monday: Date) {
  const end = addDays(monday, 6);
  const month = new Intl.DateTimeFormat(undefined, { month: "short" });
  const year = end.getFullYear();
  return monday.getMonth() === end.getMonth()
    ? `${monday.getDate()}–${end.getDate()} ${month.format(end)} ${year}`
    : `${monday.getDate()} ${month.format(monday)} – ${end.getDate()} ${month.format(end)} ${year}`;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return wide;
}

type Placed = { event: Ev; top: number; height: number; lane: number; lanes: number };

/** Side-by-side lanes for events that overlap in time within one day column. */
function layoutDay(events: Ev[], day: Date): Placed[] {
  const dayStart = day.getTime();
  const dayEnd = dayStart + DAY_MS;
  const items = events.filter((event) => !event.allDay).map((event) => {
    const start = Math.max(dayStart, new Date(event.start).getTime());
    const end = Math.min(dayEnd, Math.max(start + 15 * 60_000, new Date(event.end).getTime()));
    return { event, start, end };
  }).filter((item) => item.start < dayEnd && item.end > dayStart).sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let cluster: { item: typeof items[number]; lane: number }[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((entry) => entry.lane + 1));
    for (const { item, lane } of cluster) placed.push({ event: item.event, top: ((item.start - dayStart) / 3_600_000) * HOUR, height: Math.max(22, ((item.end - item.start) / 3_600_000) * HOUR - 2), lane, lanes });
    cluster = [];
  };
  const laneEnds: number[] = [];
  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) { flush(); laneEnds.length = 0; }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return placed;
}

export function Calendar({ onError, onSignOut }: { onError: (message: string) => void; onSignOut: () => void }) {
  const wide = useWide();
  const [state, setState] = useState<"loading" | "setup" | "ready">("loading");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"week" | "agenda">("week");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Ev | null>(null);
  const [brief, setBrief] = useState<{ text: string; busy: boolean } | null>(null);
  const requestId = useRef(0);
  const briefAbort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setHidden(new Set(JSON.parse(localStorage.getItem("ws-cal-hidden") ?? "[]")));
      const saved = localStorage.getItem("ws-cal-view");
      if (saved === "week" || saved === "agenda") setView(saved);
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    fetch("/api/workspace/mail/accounts", { cache: "no-store" })
      .then((response) => parseResponse<{ configured: boolean; missing?: string[]; accounts: Account[] }>(response))
      .then((result) => { setAccounts(result.accounts); setMissing(result.missing ?? []); setState(result.configured ? "ready" : "setup"); })
      .catch((cause) => { onError(cause instanceof Error ? cause.message : "Could not load calendars."); setState("ready"); });
  }, [onError]);

  const load = useCallback(async (from: Date) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: from.toISOString(), to: addDays(from, 7).toISOString() });
      const result = await parseResponse<Data>(await fetch(`/api/workspace/calendar/events?${params}`, { cache: "no-store" }));
      if (id === requestId.current) setData(result);
    } catch (cause) {
      if (id === requestId.current) onError(cause instanceof Error ? cause.message : "Could not load the calendar.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (state === "ready" && accounts.length > 0) void load(monday);
  }, [state, accounts.length, monday, load]);
  useEffect(() => () => briefAbort.current?.abort(), []);

  const effectiveView = wide ? view : "agenda";
  const visible = useMemo(() => (data?.events ?? []).filter((event) => !hidden.has(calKey(event))), [data, hidden]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(monday, index)), [monday]);
  const today = new Date();

  // Open the grid at the start of the week's first timed event (or 8:00), so the day's content is in view.
  useEffect(() => {
    if (effectiveView !== "week" || !scroller.current) return;
    const earliest = visible.filter((event) => !event.allDay).reduce((hour, event) => { const start = new Date(event.start); return Math.min(hour, start.getHours() + start.getMinutes() / 60); }, 8);
    scroller.current.scrollTop = Math.max(0, (Math.min(8, earliest) - 0.5) * HOUR);
  }, [effectiveView, monday, state, visible]);

  const setViewSaved = (next: "week" | "agenda") => {
    setView(next);
    try { localStorage.setItem("ws-cal-view", next); } catch { /* ignore */ }
  };
  const toggleCalendar = (key: string) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { localStorage.setItem("ws-cal-hidden", JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });

  async function runBrief() {
    briefAbort.current?.abort();
    const controller = new AbortController();
    briefAbort.current = controller;
    let text = "";
    setBrief({ text: "", busy: true });
    try {
      await streamNdjson("/api/workspace/calendar/brief", { from: monday.toISOString(), to: addDays(monday, 7).toISOString(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone }, (delta) => { text += delta; setBrief({ text, busy: true }); }, controller.signal);
      setBrief({ text, busy: false });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setBrief(null);
      onError(cause instanceof Error ? cause.message : "Could not summarize the week.");
    }
  }

  const header = <>
    <PageTitle actions={<div className="cal-nav">
      <button type="button" className="ws-round" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft size={20} /></button>
      <button type="button" className="ws-pill" onClick={() => setMonday(mondayOf(new Date()))}>Today</button>
      <button type="button" className="ws-round" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}><ChevronRight size={20} /></button>
    </div>}>Calendar</PageTitle>
    {state === "ready" && accounts.length > 0 && <div className="cal-bar">
      <span className="cal-range">{rangeLabel(monday)}{loading && <Loader2 className="ws-spin" size={14} />}</span>
      <div className="cal-bar__right">
        {wide && <div className="ws-segment cal-views" role="tablist">
          <button type="button" role="tab" aria-selected={view === "week"} className={view === "week" ? "is-on" : ""} onClick={() => setViewSaved("week")}>Week</button>
          <button type="button" role="tab" aria-selected={view === "agenda"} className={view === "agenda" ? "is-on" : ""} onClick={() => setViewSaved("agenda")}>Agenda</button>
        </div>}
        <button type="button" className="ws-pill" onClick={() => void runBrief()} disabled={brief?.busy}><Sparkles size={15} /> Brief</button>
      </div>
    </div>}
  </>;

  return <main className={`page page--cal${effectiveView === "week" ? " is-grid" : ""}`}>
    <TopRow onSignOut={onSignOut} />
    <div className="cal">
      {header}
      {state === "loading" && <p className="empty"><Loader2 className="ws-spin" size={18} /></p>}
      {state === "setup" && <div className="empty"><CalendarIcon size={28} /><p>Calendar is not set up yet.</p><small>{missing.length ? `Missing in this deployment: ${missing.join(", ")}.` : "Set up Google access first (see Mail)."}</small></div>}
      {state === "ready" && accounts.length === 0 && <div className="empty"><CalendarIcon size={28} /><p>Connect a Google account to see your calendar.</p><a className="ws-pill ws-pill--solid" href="/api/workspace/mail/connect">Connect Google</a><small>Read-only access to your mail and calendar.</small></div>}

      {state === "ready" && accounts.length > 0 && <>
        {accounts.filter((account) => !account.calendar).map((account) => <p key={account.id} className="mail-banner">Calendar access is not granted for {account.email}. <a href={`/api/workspace/mail/connect?hint=${encodeURIComponent(account.email)}`}>Reconnect</a></p>)}
        {data?.failures.filter((failure) => failure.reason !== "scope").map((failure) => <p key={failure.account} className="mail-banner">
          {failure.reason === "reauth" ? <>Access to {failure.email} expired. <a href={`/api/workspace/mail/connect?hint=${encodeURIComponent(failure.email)}`}>Reconnect</a></> : <>Could not load the calendar for {failure.email}. Make sure the Google Calendar API is enabled.</>}
        </p>)}
        {data && data.calendars.length > 0 && <div className="mail-chips" role="group" aria-label="Calendars">
          {data.calendars.map((calendar) => <button key={calKey(calendar)} type="button" className={hidden.has(calKey(calendar)) ? "cal-chip is-off" : "cal-chip"} style={{ "--c": calendar.color } as CSSProperties} aria-pressed={!hidden.has(calKey(calendar))} onClick={() => toggleCalendar(calKey(calendar))}><i /> {calendar.name}</button>)}
        </div>}
        {brief && <section className="ws-card cal-brief" aria-live="polite">
          <div className="ws-card__head"><span><Sparkles size={15} /> This week</span><button type="button" aria-label="Close" onClick={() => { briefAbort.current?.abort(); setBrief(null); }}><X size={16} /></button></div>
          {brief.text ? <div className="ws-markdown"><ReactMarkdown>{brief.text}</ReactMarkdown></div> : <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Reading your week…</p>}
          <p className="ws-note">Event titles and times were sent to DeepSeek.</p>
        </section>}

        {data === null ? <div className="mail-skeleton"><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div></div>
          : effectiveView === "week" ? <WeekGrid days={days} events={visible} today={today} scroller={scroller} onSelect={setSelected} />
            : <Agenda days={days} events={visible} today={today} onSelect={setSelected} />}
      </>}
    </div>
    <EventSheet event={selected} onClose={() => setSelected(null)} />
  </main>;
}

function eventTime(event: Ev) {
  if (event.allDay) return "All day";
  const start = new Date(event.start);
  const end = new Date(event.end);
  return `${timeFormat.format(start)} – ${timeFormat.format(end)}`;
}

function onDay(event: Ev, day: Date) {
  const start = parse(event.start, event.allDay).getTime();
  const end = event.allDay ? parse(event.end, true).getTime() : new Date(event.end).getTime();
  const from = day.getTime();
  return start < from + DAY_MS && Math.max(end, start + 1) > from;
}

function WeekGrid({ days, events, today, scroller, onSelect }: { days: Date[]; events: Ev[]; today: Date; scroller: React.RefObject<HTMLDivElement | null>; onSelect: (event: Ev) => void }) {
  const nowTop = ((today.getHours() * 60 + today.getMinutes()) / 60) * HOUR;
  return <div className="wk">
    <div className="wk__head">
      <span />
      {days.map((day) => <div key={day.toISOString()} className={sameDay(day, today) ? "is-today" : ""}><small>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</small><b>{day.getDate()}</b></div>)}
    </div>
    <div className="wk__allday">
      <span>all-day</span>
      {days.map((day) => <div key={day.toISOString()}>{events.filter((event) => event.allDay && onDay(event, day)).map((event) => <button key={event.id + event.calendarId} type="button" className={`wk__chip${event.declined ? " is-declined" : ""}`} style={{ "--c": event.color } as CSSProperties} onClick={() => onSelect(event)}>{event.title}</button>)}</div>)}
    </div>
    <div className="wk__scroll" ref={scroller}>
      <div className="wk__body" style={{ height: 24 * HOUR }}>
        <div className="wk__hours">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * HOUR }}>{hour === 0 ? "" : timeFormat.format(new Date(2000, 0, 1, hour))}</span>)}</div>
        {days.map((day) => <div key={day.toISOString()} className={`wk__col${sameDay(day, today) ? " is-today" : ""}`}>
          {layoutDay(events.filter((event) => onDay(event, day)), day).map(({ event, top, height, lane, lanes }) => <button key={event.id + event.calendarId + day.getDate()} type="button" className={`wk__event${event.declined ? " is-declined" : ""}`} style={{ "--c": event.color, top, height, left: `${(lane / lanes) * 100}%`, width: `calc(${100 / lanes}% - 2px)` } as CSSProperties} onClick={() => onSelect(event)}>
            <strong>{event.title}</strong>{height > 34 && <span>{eventTime(event)}</span>}
          </button>)}
          {sameDay(day, today) && <i className="wk__now" style={{ top: nowTop }} />}
        </div>)}
      </div>
    </div>
  </div>;
}

function Agenda({ days, events, today, onSelect }: { days: Date[]; events: Ev[]; today: Date; onSelect: (event: Ev) => void }) {
  const groups = days.map((day) => ({ day, items: events.filter((event) => onDay(event, day)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start)) }));
  const anything = groups.some((group) => group.items.length);
  if (!anything) return <p className="empty">Nothing scheduled this week.</p>;
  return <div className="agenda">
    {groups.filter((group) => group.items.length || sameDay(group.day, today)).map(({ day, items }) => <section key={day.toISOString()}>
      <h2 className={sameDay(day, today) ? "is-today" : ""}>{sameDay(day, today) ? "Today · " : ""}{dayFormat.format(day)}</h2>
      {items.length === 0 ? <p className="agenda__none">No events</p> : <ul>
        {items.map((event) => <li key={event.id + event.calendarId}>
          <button type="button" className={event.declined ? "is-declined" : ""} style={{ "--c": event.color } as CSSProperties} onClick={() => onSelect(event)}>
            <span className="agenda__time">{event.allDay ? "All day" : timeFormat.format(new Date(event.start))}<small>{event.allDay ? "" : timeFormat.format(new Date(event.end))}</small></span>
            <i />
            <span className="agenda__main"><strong>{event.title}</strong>{event.location && <small><MapPin size={12} /> {event.location}</small>}<small>{event.calendarName}</small></span>
          </button>
        </li>)}
      </ul>}
    </section>)}
  </div>;
}

function EventSheet({ event, onClose }: { event: Ev | null; onClose: () => void }) {
  const [last, setLast] = useState<Ev | null>(null);
  useEffect(() => { if (event) setLast(event); }, [event]);
  const shown = event ?? last;
  return <Sheet open={!!event} onClose={onClose} title="Event" size="tall">
    {shown && <div className="ev">
      <h2 style={{ "--c": shown.color } as CSSProperties}><i />{shown.title}</h2>
      <p className="ev__when">{shown.allDay ? `${dayFormat.format(parse(shown.start, true))} · All day` : `${dayFormat.format(new Date(shown.start))} · ${eventTime(shown)}`}</p>
      <p className="ev__cal">{shown.calendarName}</p>
      {shown.location && <p className="ev__row"><MapPin size={16} /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shown.location)}`} target="_blank" rel="noopener noreferrer">{shown.location}</a></p>}
      {shown.meetingLink && <p className="ev__row"><Video size={16} /><a href={shown.meetingLink} target="_blank" rel="noopener noreferrer">Join video call</a></p>}
      {shown.attendees.length > 0 && <p className="ev__row"><Users size={16} /><span>{shown.attendees.map((person) => person.name).join(", ")}</span></p>}
      {shown.description && <p className="ev__desc">{shown.description}</p>}
      {shown.link && <a className="ws-pill ev__open" href={shown.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open in Google Calendar</a>}
    </div>}
  </Sheet>;
}
