"use client";

import { useEffect, useState } from "react";
import { parseResponse } from "./api";
import type { Category, Occ, Repeat } from "./calendarTypes";
import { Sheet } from "./Sheet";

export type EditorValue = { mode: "create"; start: Date; end: Date; allDay: boolean } | { mode: "edit"; event: Occ } | null;

const pad = (value: number) => String(value).padStart(2, "0");
const toInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const dateOnly = (date: Date) => toInput(date).slice(0, 10);
const addDay = (key: string, days: number) => { const [y, m, d] = key.split("-").map(Number); return dateOnly(new Date(y, m - 1, d + days)); };
const DAYS = [{ label: "M", value: 1 }, { label: "T", value: 2 }, { label: "W", value: 3 }, { label: "T", value: 4 }, { label: "F", value: 5 }, { label: "S", value: 6 }, { label: "S", value: 0 }];

type Props = { value: EditorValue; categories: Category[]; onClose: () => void; onSaved: () => void; onError: (message: string) => void };

export function EventEditor({ value, categories, onClose, onSaved, onError }: Props) {
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [category, setCategory] = useState("personal");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [freq, setFreq] = useState<"none" | Repeat["freq"]>("none");
  const [interval, setIntervalValue] = useState(1);
  const [byDay, setByDay] = useState<number[]>([]);
  const [ends, setEnds] = useState<"never" | "until" | "count">("never");
  const [until, setUntil] = useState("");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [askScope, setAskScope] = useState(false);

  useEffect(() => {
    if (!value) return;
    setAskScope(false);
    if (value.mode === "create") {
      setTitle(""); setAllDay(value.allDay); setStart(toInput(value.start)); setEnd(toInput(value.end));
      setCategory("personal"); setLocation(""); setNotes(""); setFreq("none"); setIntervalValue(1); setByDay([]); setEnds("never"); setUntil(""); setCount(10);
      return;
    }
    const event = value.event;
    setTitle(event.title); setAllDay(event.allDay); setCategory(event.category); setLocation(event.location); setNotes(event.notes);
    if (event.allDay) {
      setStart(`${event.start}T09:00`);
      setEnd(`${addDay(event.end, -1)}T10:00`);
    } else {
      setStart(toInput(new Date(event.start)));
      setEnd(toInput(new Date(event.end)));
    }
    const repeat = event.repeat;
    setFreq(repeat?.freq ?? "none"); setIntervalValue(repeat?.interval ?? 1); setByDay(repeat?.byDay ?? []);
    setEnds(repeat?.until ? "until" : repeat?.count ? "count" : "never"); setUntil(repeat?.until ?? ""); setCount(repeat?.count ?? 10);
  }, [value]);

  const recurringEdit = value?.mode === "edit" && value.event.recurring;

  function payload() {
    const startDay = start.slice(0, 10);
    const endDay = (end || start).slice(0, 10);
    const repeat = freq === "none" ? null : {
      freq, interval: Math.max(1, interval || 1),
      ...(freq === "weekly" && byDay.length ? { byDay } : {}),
      ...(ends === "until" && until ? { until } : {}),
      ...(ends === "count" ? { count: Math.max(1, count || 1) } : {}),
    };
    return {
      title: title.trim(), allDay, category, location: location.trim(), notes: notes.trim(), repeat,
      start: allDay ? startDay : new Date(start).toISOString(),
      end: allDay ? addDay(endDay < startDay ? startDay : endDay, 1) : new Date(end).toISOString(),
    };
  }

  async function save(scope: "this" | "all" = "all") {
    if (!value || busy) return;
    if (!title.trim()) return onError("Give the event a title.");
    if (!start || (!allDay && !end)) return onError("Choose a start and end time.");
    if (!allDay && new Date(end) <= new Date(start)) return onError("The event must end after it starts.");
    setBusy(true);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      if (value.mode === "create") {
        await parseResponse(await fetch("/api/workspace/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: payload(), zone }) }));
      } else {
        await parseResponse(await fetch("/api/workspace/calendar/events", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: value.event.id, event: payload(), scope, occurrenceDate: value.event.recurring ? value.event.occurrenceDate : undefined, zone }) }));
      }
      onSaved();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not save the event.");
    } finally {
      setBusy(false);
    }
  }

  const onSave = () => { if (recurringEdit) setAskScope(true); else void save(); };

  return <Sheet open={!!value} onClose={onClose} title={value?.mode === "edit" ? "Edit event" : "New event"} size="tall" primary={{ label: "Save", onClick: onSave, disabled: busy }}>
    <form className="ef" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <input className="ef__title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" aria-label="Title" maxLength={200} autoFocus={value?.mode === "create"} />
      <div className="ef__group">
        <label className="ef__row"><span>All-day</span><input type="checkbox" className="ef__switch" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /></label>
        <label className="ef__row"><span>Starts</span><input type={allDay ? "date" : "datetime-local"} value={allDay ? start.slice(0, 10) : start} onChange={(event) => { const next = event.target.value; setStart(allDay ? `${next}${start.slice(10)}` : next); if (!allDay && next && end && new Date(end) <= new Date(next)) setEnd(toInput(new Date(new Date(next).getTime() + 3_600_000))); if (allDay && end.slice(0, 10) < next) setEnd(`${next}${end.slice(10)}`); }} required /></label>
        <label className="ef__row"><span>{allDay ? "Last day" : "Ends"}</span><input type={allDay ? "date" : "datetime-local"} value={allDay ? end.slice(0, 10) : end} min={allDay ? start.slice(0, 10) : start} onChange={(event) => setEnd(allDay ? `${event.target.value}${end.slice(10)}` : event.target.value)} required /></label>
      </div>
      <div className="ef__group">
        <div className="ef__row ef__row--wrap" role="radiogroup" aria-label="Category">
          <span>Category</span>
          <div className="ef__cats">{categories.map((item) => <button key={item.id} type="button" role="radio" aria-checked={category === item.id} className={category === item.id ? "is-on" : ""} style={{ "--c": item.color } as React.CSSProperties} onClick={() => setCategory(item.id)}><i /> {item.name}</button>)}</div>
        </div>
        <label className="ef__row"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Add location" maxLength={200} /></label>
      </div>
      <div className="ef__group">
        <label className="ef__row"><span>Repeat</span>
          <select value={freq} onChange={(event) => { const next = event.target.value as typeof freq; setFreq(next); if (next === "weekly" && !byDay.length) setByDay([]); }}>
            <option value="none">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
          </select>
        </label>
        {freq !== "none" && <>
          <label className="ef__row"><span>Every</span><span className="ef__inline"><input type="number" min={1} max={99} value={interval} onChange={(event) => setIntervalValue(Number(event.target.value))} /> {freq === "daily" ? "day(s)" : freq === "weekly" ? "week(s)" : freq === "monthly" ? "month(s)" : "year(s)"}</span></label>
          {freq === "weekly" && <div className="ef__row ef__row--wrap"><span>On</span><div className="ef__days">{DAYS.map((day) => <button key={day.value} type="button" aria-pressed={byDay.includes(day.value)} className={byDay.includes(day.value) ? "is-on" : ""} onClick={() => setByDay((current) => current.includes(day.value) ? current.filter((item) => item !== day.value) : [...current, day.value])}>{day.label}</button>)}</div></div>}
          <label className="ef__row"><span>Ends</span>
            <select value={ends} onChange={(event) => setEnds(event.target.value as typeof ends)}><option value="never">Never</option><option value="until">On date</option><option value="count">After</option></select>
          </label>
          {ends === "until" && <label className="ef__row"><span>Until</span><input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></label>}
          {ends === "count" && <label className="ef__row"><span>Times</span><input type="number" min={1} max={1000} value={count} onChange={(event) => setCount(Number(event.target.value))} /></label>}
        </>}
      </div>
      <textarea className="ef__notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" rows={4} maxLength={4000} aria-label="Notes" />
      {askScope && <div className="ef__scope" role="alertdialog" aria-label="Apply changes to">
        <p>This is a repeating event.</p>
        <button type="button" className="ws-pill" disabled={busy} onClick={() => void save("this")}>Only this event</button>
        <button type="button" className="ws-pill ws-pill--solid" disabled={busy} onClick={() => void save("all")}>All events</button>
      </div>}
      <button type="submit" hidden />
    </form>
  </Sheet>;
}
