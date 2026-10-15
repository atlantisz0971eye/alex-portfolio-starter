"use client";

import { ChevronLeft, ChevronRight, MapPin, Plus, Repeat, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { parseResponse } from "./api";
import { dayFormat, timeFormat } from "./calendarFormat";
import { EventEditor, type EditorValue } from "./CalendarEditor";
import { Sheet } from "./Sheet";
import { PageTitle, TopRow } from "./Shell";
import type { Category, Occ } from "./calendarTypes";

const HOUR = 52;
const DAY_MS = 86_400_000;

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


function rangeLabel(monday: Date) {
  const end = addDays(monday, 6);
  const month = new Intl.DateTimeFormat(undefined, { month: "short" });
  return monday.getMonth() === end.getMonth()
    ? `${monday.getDate()}–${end.getDate()} ${month.format(end)} ${end.getFullYear()}`
    : `${monday.getDate()} ${month.format(monday)} – ${end.getDate()} ${month.format(end)} ${end.getFullYear()}`;
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

function eventTime(event: Occ) {
  if (event.allDay) return "All day";
  return `${timeFormat.format(new Date(event.start))} – ${timeFormat.format(new Date(event.end))}`;
}

function onDay(event: Occ, day: Date) {
  const start = parse(event.start, event.allDay).getTime();
  const end = parse(event.end, event.allDay).getTime();
  const from = day.getTime();
  return start < from + DAY_MS && Math.max(end, start + 1) > from;
}

type Placed = { event: Occ; top: number; height: number; lane: number; lanes: number };

/** Side-by-side lanes for events that overlap in time within one day column. */
function layoutDay(events: Occ[], day: Date): Placed[] {
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
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((entry) => entry.lane + 1));
    for (const { item, lane } of cluster) placed.push({ event: item.event, top: ((item.start - dayStart) / 3_600_000) * HOUR, height: Math.max(22, ((item.end - item.start) / 3_600_000) * HOUR - 2), lane, lanes });
    cluster = [];
  };
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

export function Calendar({ onError, onSignOut, onAssistant, refresh }: { onError: (message: string) => void; onSignOut: () => void; onAssistant: () => void; refresh: number }) {
  const wide = useWide();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [events, setEvents] = useState<Occ[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"week" | "agenda">("week");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Occ | null>(null);
  const [editor, setEditor] = useState<EditorValue | null>(null);
  const requestId = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setHidden(new Set(JSON.parse(localStorage.getItem("ws-cal-hidden") ?? "[]")));
      const saved = localStorage.getItem("ws-cal-view");
      if (saved === "week" || saved === "agenda") setView(saved);
    } catch { /* storage unavailable */ }
  }, []);

  const load = useCallback(async (from: Date) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: from.toISOString(), to: addDays(from, 7).toISOString() });
      const result = await parseResponse<{ events: Occ[]; categories: Category[] }>(await fetch(`/api/workspace/calendar/events?${params}`, { cache: "no-store" }));
      if (id === requestId.current) { setEvents(result.events); setCategories(result.categories); }
    } catch (cause) {
      if (id === requestId.current) { setEvents((current) => current ?? []); onError(cause instanceof Error ? cause.message : "Could not load the calendar."); }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [onError]);

  // `refresh` changes when the assistant applies a change elsewhere in the app.
  useEffect(() => { void load(monday); }, [monday, load, refresh]);

  const effectiveView = wide ? view : "agenda";
  const colors = useMemo(() => new Map(categories.map((category) => [category.id, category.color])), [categories]);
  const visible = useMemo(() => (events ?? []).filter((event) => !hidden.has(event.category)), [events, hidden]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(monday, index)), [monday]);
  const today = new Date();

  // Open the grid at the start of the week's first timed event (or 8:00), so the day's content is in view.
  useEffect(() => {
    if (effectiveView !== "week" || !scroller.current) return;
    const earliest = visible.filter((event) => !event.allDay).reduce((hour, event) => { const start = new Date(event.start); return Math.min(hour, start.getHours() + start.getMinutes() / 60); }, 8);
    scroller.current.scrollTop = Math.max(0, (Math.min(8, earliest) - 0.5) * HOUR);
  }, [effectiveView, monday, events === null, visible.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setViewSaved = (next: "week" | "agenda") => {
    setView(next);
    try { localStorage.setItem("ws-cal-view", next); } catch { /* ignore */ }
  };
  const toggleCategory = (id: string) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem("ws-cal-hidden", JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });

  const startNew = (start?: Date) => {
    const base = start ?? (() => { const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 1); return now; })();
    setEditor({ mode: "create", start: base, end: new Date(base.getTime() + 3_600_000), allDay: false });
  };
  const edit = (event: Occ) => { setSelected(null); setEditor({ mode: "edit", event }); };
  const changed = useCallback(() => void load(monday), [load, monday]);

  async function remove(event: Occ, scope: "this" | "all") {
    try {
      const params = new URLSearchParams({ id: event.id, scope });
      if (event.recurring) params.set("occurrence", event.occurrenceDate);
      await parseResponse(await fetch(`/api/workspace/calendar/events?${params}`, { method: "DELETE" }));
      setSelected(null);
      changed();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not delete the event.");
    }
  }

  const color = (event: Occ) => colors.get(event.category) ?? "#8e8e93";

  return <main className={`page page--cal${effectiveView === "week" ? " is-grid" : ""}`}>
    <TopRow onSignOut={onSignOut} />
    <div className="cal">
      <PageTitle actions={<div className="cal-nav">
        <button type="button" className="ws-round" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft size={20} /></button>
        <button type="button" className="ws-pill" onClick={() => setMonday(mondayOf(new Date()))}>Today</button>
        <button type="button" className="ws-round" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}><ChevronRight size={20} /></button>
      </div>}>Calendar</PageTitle>
      <div className="cal-bar">
        <span className="cal-range">{rangeLabel(monday)}{loading && <i className="cal-dot" />}</span>
        <div className="cal-bar__right">
          {wide && <div className="ws-segment cal-views" role="tablist">
            <button type="button" role="tab" aria-selected={view === "week"} className={view === "week" ? "is-on" : ""} onClick={() => setViewSaved("week")}>Week</button>
            <button type="button" role="tab" aria-selected={view === "agenda"} className={view === "agenda" ? "is-on" : ""} onClick={() => setViewSaved("agenda")}>Agenda</button>
          </div>}
          <button type="button" className="ws-pill" onClick={onAssistant}><Sparkles size={15} /> Assistant</button>
          <button type="button" className="ws-pill ws-pill--solid" onClick={() => startNew()}><Plus size={16} /> New</button>
        </div>
      </div>
      {categories.length > 0 && <div className="mail-chips" role="group" aria-label="Categories">
        {categories.map((category) => <button key={category.id} type="button" className={hidden.has(category.id) ? "cal-chip is-off" : "cal-chip"} style={{ "--c": category.color } as CSSProperties} aria-pressed={!hidden.has(category.id)} onClick={() => toggleCategory(category.id)}><i /> {category.name}</button>)}
      </div>}
      {events === null ? <div className="mail-skeleton"><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div></div>
        : effectiveView === "week" ? <WeekGrid days={days} events={visible} today={today} scroller={scroller} color={color} onSelect={setSelected} onCreate={startNew} />
          : <Agenda days={days} events={visible} today={today} color={color} onSelect={setSelected} onCreate={() => startNew()} />}
    </div>
    <EventSheet event={selected} color={selected ? color(selected) : "#8e8e93"} categoryName={categories.find((category) => category.id === selected?.category)?.name ?? ""} onClose={() => setSelected(null)} onEdit={edit} onDelete={remove} />
    <EventEditor value={editor} categories={categories} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); changed(); }} onError={onError} />
  </main>;
}

function WeekGrid({ days, events, today, scroller, color, onSelect, onCreate }: { days: Date[]; events: Occ[]; today: Date; scroller: React.RefObject<HTMLDivElement | null>; color: (event: Occ) => string; onSelect: (event: Occ) => void; onCreate: (start: Date) => void }) {
  const nowTop = ((today.getHours() * 60 + today.getMinutes()) / 60) * HOUR;
  return <div className="wk">
    <div className="wk__head">
      <span />
      {days.map((day) => <div key={day.toISOString()} className={sameDay(day, today) ? "is-today" : ""}><small>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</small><b>{day.getDate()}</b></div>)}
    </div>
    <div className="wk__allday">
      <span>all-day</span>
      {days.map((day) => <div key={day.toISOString()}>{events.filter((event) => event.allDay && onDay(event, day)).map((event) => <button key={event.id + event.occurrenceDate} type="button" className="wk__chip" style={{ "--c": color(event), background: `${color(event)}66` } as CSSProperties} onClick={() => onSelect(event)}>{event.title}</button>)}</div>)}
    </div>
    <div className="wk__scroll" ref={scroller}>
      <div className="wk__body" style={{ height: 24 * HOUR }}>
        <div className="wk__hours">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * HOUR }}>{hour === 0 ? "" : timeFormat.format(new Date(2000, 0, 1, hour))}</span>)}</div>
        {days.map((day) => <div key={day.toISOString()} className={`wk__col${sameDay(day, today) ? " is-today" : ""}`} onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
          const minutes = Math.floor((y / HOUR) * 2) * 30;
          onCreate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes));
        }}>
          {layoutDay(events.filter((event) => onDay(event, day)), day).map(({ event, top, height, lane, lanes }) => <button key={event.id + event.occurrenceDate + day.getDate()} type="button" className="wk__event" style={{ "--c": color(event), background: `${color(event)}59`, top, height, left: `${(lane / lanes) * 100}%`, width: `calc(${100 / lanes}% - 2px)` } as CSSProperties} onClick={() => onSelect(event)}>
            <strong>{event.title}</strong>{height > 34 && <span>{eventTime(event)}</span>}
          </button>)}
          {sameDay(day, today) && <i className="wk__now" style={{ top: nowTop }} />}
        </div>)}
      </div>
    </div>
  </div>;
}

function Agenda({ days, events, today, color, onSelect, onCreate }: { days: Date[]; events: Occ[]; today: Date; color: (event: Occ) => string; onSelect: (event: Occ) => void; onCreate: () => void }) {
  const groups = days.map((day) => ({ day, items: events.filter((event) => onDay(event, day)).sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start)) }));
  if (!groups.some((group) => group.items.length)) return <div className="empty"><p>Nothing scheduled this week.</p><button type="button" className="ws-pill" onClick={onCreate}><Plus size={16} /> Add an event</button></div>;
  return <div className="agenda">
    {groups.filter((group) => group.items.length || sameDay(group.day, today)).map(({ day, items }) => <section key={day.toISOString()}>
      <h2 className={sameDay(day, today) ? "is-today" : ""}>{sameDay(day, today) ? "Today · " : ""}{dayFormat.format(day)}</h2>
      {items.length === 0 ? <p className="agenda__none">No events</p> : <ul>
        {items.map((event) => <li key={event.id + event.occurrenceDate}>
          <button type="button" style={{ "--c": color(event) } as CSSProperties} onClick={() => onSelect(event)}>
            <span className="agenda__time">{event.allDay ? "All day" : timeFormat.format(new Date(event.start))}<small>{event.allDay ? "" : timeFormat.format(new Date(event.end))}</small></span>
            <i />
            <span className="agenda__main"><strong>{event.title}</strong>{event.location && <small><MapPin size={12} /> {event.location}</small>}{event.recurring && <small><Repeat size={12} /> Repeats</small>}</span>
          </button>
        </li>)}
      </ul>}
    </section>)}
  </div>;
}

function EventSheet({ event, color, categoryName, onClose, onEdit, onDelete }: { event: Occ | null; color: string; categoryName: string; onClose: () => void; onEdit: (event: Occ) => void; onDelete: (event: Occ, scope: "this" | "all") => void }) {
  const [last, setLast] = useState<Occ | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (event) { setLast(event); setConfirming(false); } }, [event]);
  const shown = event ?? last;
  return <Sheet open={!!event} onClose={onClose} title="Event" size="compact">
    {shown && <div className="ev">
      <h2 style={{ "--c": color } as CSSProperties}><i />{shown.title}</h2>
      <p className="ev__when">{shown.allDay ? `${dayFormat.format(parse(shown.start, true))} · All day` : `${dayFormat.format(new Date(shown.start))} · ${eventTime(shown)}`}</p>
      <p className="ev__cal">{categoryName}{shown.recurring ? " · Repeats" : ""}{shown.createdBy === "agent" ? " · Added by assistant" : ""}</p>
      {shown.location && <p className="ev__row"><MapPin size={16} /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shown.location)}`} target="_blank" rel="noopener noreferrer">{shown.location}</a></p>}
      {shown.notes && <p className="ev__desc">{shown.notes}</p>}
      <div className="ev__actions">
        {confirming ? <>
          <span>Delete {shown.recurring ? "which?" : "this event?"}</span>
          {shown.recurring ? <>
            <button type="button" className="ws-pill" onClick={() => onDelete(shown, "this")}>This event</button>
            <button type="button" className="ws-pill ws-pill--danger" onClick={() => onDelete(shown, "all")}>All events</button>
          </> : <button type="button" className="ws-pill ws-pill--danger" onClick={() => onDelete(shown, "all")}>Delete</button>}
          <button type="button" className="ws-text-button" onClick={() => setConfirming(false)}>Cancel</button>
        </> : <>
          <button type="button" className="ws-pill" onClick={() => onEdit(shown)}>Edit</button>
          <button type="button" className="ws-pill ws-pill--danger" onClick={() => setConfirming(true)}><Trash2 size={15} /> Delete</button>
        </>}
      </div>
    </div>}
  </Sheet>;
}
