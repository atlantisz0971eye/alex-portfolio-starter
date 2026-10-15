import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import {
  addDaysToKey, dateKey, daysBetweenKeys, expand, isDateOnly, toInstant, validZone, wallDate, wallParts, zonedToInstant,
  type Occurrence, type Repeat, type StoredEvent,
} from "./calendarTime";

export type Category = { id: string; name: string; color: string };
type CalendarDoc = { categories: Category[]; events: StoredEvent[] };

const PATH = "workspace/calendar/data.json";
const MAX_EVENTS = 5000;
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "personal", name: "Personal", color: "#0a84ff" },
  { id: "study", name: "Study", color: "#30d158" },
  { id: "work", name: "Work", color: "#ff9f0a" },
  { id: "other", name: "Other", color: "#bf5af2" },
];

export async function readCalendar(): Promise<CalendarDoc> {
  const result = await get(PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { categories: DEFAULT_CATEGORIES, events: [] };
  const doc = JSON.parse(await new Response(result.stream).text()) as Partial<CalendarDoc>;
  return { categories: doc.categories?.length ? doc.categories : DEFAULT_CATEGORIES, events: doc.events ?? [] };
}

async function writeCalendar(doc: CalendarDoc) {
  await put(PATH, JSON.stringify(doc), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export class CalendarInputError extends Error {}

const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

function cleanRepeat(value: unknown): Repeat | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!["daily", "weekly", "monthly", "yearly"].includes(String(raw.freq))) return undefined;
  const repeat: Repeat = { freq: raw.freq as Repeat["freq"], interval: Math.min(99, Math.max(1, Math.floor(Number(raw.interval) || 1))) };
  if (isDateOnly(raw.until)) repeat.until = raw.until;
  const count = Math.floor(Number(raw.count));
  if (Number.isFinite(count) && count > 0) repeat.count = Math.min(1000, count);
  if (repeat.freq === "weekly" && Array.isArray(raw.byDay)) {
    const days = [...new Set(raw.byDay.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
    if (days.length) repeat.byDay = days;
  }
  return repeat;
}

type Fields = Omit<StoredEvent, "id" | "createdAt" | "updatedAt" | "createdBy" | "exceptions">;

/**
 * Validates an event given as loose JSON. With a `base`, only the fields present in `raw` change.
 * Times may be ISO instants or local "YYYY-MM-DDTHH:mm" (read in `zone`), which is how the assistant writes them.
 */
export function buildFields(raw: Record<string, unknown>, zone: string, categories: Category[], base?: Fields): Fields {
  const has = (key: string) => key in raw && raw[key] !== undefined;
  const title = has("title") ? text(raw.title, 200) : base?.title ?? "";
  if (!title) throw new CalendarInputError("An event needs a title.");
  const allDay = has("allDay") ? raw.allDay === true : base?.allDay ?? false;
  const tz = validZone(base?.tz ?? zone);
  let start: string;
  let end: string;
  if (allDay) {
    const startKey = has("start") ? String(raw.start).slice(0, 10) : base ? (base.allDay ? base.start : wallDate(Date.parse(base.start), tz)) : "";
    if (!isDateOnly(startKey) || toInstant(startKey, "UTC") === null) throw new CalendarInputError("The start date is not valid.");
    let endKey = has("end") ? String(raw.end).slice(0, 10) : "";
    if (!endKey && base?.allDay && !has("start")) endKey = base.end;
    if (!endKey && base?.allDay && has("start")) endKey = addDaysToKey(startKey, Math.max(1, daysBetweenKeys(base.start, base.end)));
    if (!endKey) endKey = addDaysToKey(startKey, 1);
    // A single-day end is written inclusively by some callers; the stored end is always exclusive.
    if (!isDateOnly(endKey)) throw new CalendarInputError("The end date is not valid.");
    if (daysBetweenKeys(startKey, endKey) <= 0) endKey = addDaysToKey(startKey, 1);
    if (daysBetweenKeys(startKey, endKey) > 366) throw new CalendarInputError("An event cannot be longer than a year.");
    start = startKey;
    end = endKey;
  } else {
    const baseStart = base && !base.allDay ? Date.parse(base.start) : null;
    const baseLength = base && !base.allDay ? Date.parse(base.end) - Date.parse(base.start) : 3_600_000;
    const startMs = has("start") ? toInstant(raw.start, tz) : baseStart;
    if (startMs === null) throw new CalendarInputError("The start time is not valid.");
    let endMs = has("end") ? toInstant(raw.end, tz) : startMs + baseLength;
    if (endMs === null) throw new CalendarInputError("The end time is not valid.");
    if (endMs <= startMs) endMs = startMs + 3_600_000;
    if (endMs - startMs > 14 * 86_400_000) throw new CalendarInputError("A timed event cannot be longer than 14 days.");
    start = new Date(startMs).toISOString();
    end = new Date(endMs).toISOString();
  }
  const category = has("category") ? text(raw.category, 40) : base?.category ?? "personal";
  const repeat = has("repeat") ? (raw.repeat === null ? undefined : cleanRepeat(raw.repeat)) : base?.repeat;
  return {
    title, start, end, allDay, tz,
    category: categories.some((item) => item.id === category) ? category : "personal",
    location: has("location") ? text(raw.location, 200) : base?.location ?? "",
    notes: has("notes") ? text(raw.notes, 4000) : base?.notes ?? "",
    ...(repeat ? { repeat } : {}),
  };
}

export async function listOccurrences(from: number, to: number) {
  const doc = await readCalendar();
  const occurrences = doc.events.flatMap((event) => expand(event, from, to)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title));
  return { occurrences, categories: doc.categories };
}

export async function createEvent(raw: Record<string, unknown>, zone: string, by: "user" | "agent") {
  const doc = await readCalendar();
  if (doc.events.length >= MAX_EVENTS) throw new CalendarInputError("The calendar is full.");
  const now = new Date().toISOString();
  const event: StoredEvent = { ...buildFields(raw, validZone(zone), doc.categories), id: randomUUID(), createdAt: now, updatedAt: now, createdBy: by };
  await writeCalendar({ ...doc, events: [...doc.events, event] });
  return event;
}

/** Edits a whole event or series ("all"), or detaches one occurrence of a series ("this"). */
export async function updateEvent(id: string, raw: Record<string, unknown>, scope: "this" | "all", occurrenceDate: string | undefined, zone: string, by: "user" | "agent") {
  const doc = await readCalendar();
  const series = doc.events.find((event) => event.id === id);
  if (!series) throw new CalendarInputError("That event no longer exists.");
  const tz = validZone(zone);
  const now = new Date().toISOString();
  if (series.repeat && scope === "this") {
    if (!occurrenceDate || !isDateOnly(occurrenceDate)) throw new CalendarInputError("Choose which occurrence to change.");
    const occurrence = expand(series, 0, 8_640_000_000_000_000).find((item) => item.occurrenceDate === occurrenceDate);
    if (!occurrence) throw new CalendarInputError("That occurrence no longer exists.");
    const { repeat: _repeat, ...baseFields } = fieldsOf(occurrence);
    const created: StoredEvent = { ...buildFields({ ...raw, repeat: null }, tz, doc.categories, baseFields), id: randomUUID(), createdAt: now, updatedAt: now, createdBy: by };
    const events = doc.events.map((event) => event.id === id ? { ...event, exceptions: [...new Set([...(event.exceptions ?? []), occurrenceDate])], updatedAt: now } : event);
    await writeCalendar({ ...doc, events: [...events, created] });
    return created;
  }
  let fields = buildFields(raw, tz, doc.categories, fieldsOf(series));
  let exceptions = series.exceptions;
  if (series.repeat && occurrenceDate && ("start" in raw)) {
    // Editing "all" from an occurrence: keep the series anchored, moving it by the same number of days.
    const shown = fields.allDay ? fields.start : wallDate(Date.parse(fields.start), series.tz);
    const delta = daysBetweenKeys(occurrenceDate, shown);
    const seriesDate = series.allDay ? series.start : wallDate(Date.parse(series.start), series.tz);
    const anchor = addDaysToKey(seriesDate, delta);
    // Removed occurrences move with the series so they stay removed.
    exceptions = series.exceptions?.map((date) => addDaysToKey(date, delta));
    if (fields.allDay) {
      const length = daysBetweenKeys(fields.start, fields.end);
      fields = { ...fields, start: anchor, end: addDaysToKey(anchor, length) };
    } else {
      const wall = wallParts(Date.parse(fields.start), series.tz);
      const [y, m, d] = anchor.split("-").map(Number);
      const length = Date.parse(fields.end) - Date.parse(fields.start);
      const startMs = zonedToInstant(y, m, d, wall.h, wall.mi, series.tz);
      fields = { ...fields, start: new Date(startMs).toISOString(), end: new Date(startMs + length).toISOString() };
    }
  }
  const updated: StoredEvent = { ...series, ...fields, repeat: fields.repeat, ...(exceptions ? { exceptions } : {}), updatedAt: now };
  if (!updated.repeat) { delete updated.repeat; delete updated.exceptions; }
  await writeCalendar({ ...doc, events: doc.events.map((event) => event.id === id ? updated : event) });
  return updated;
}

export async function deleteEvent(id: string, scope: "this" | "all", occurrenceDate?: string) {
  const doc = await readCalendar();
  const series = doc.events.find((event) => event.id === id);
  if (!series) throw new CalendarInputError("That event no longer exists.");
  if (series.repeat && scope === "this") {
    if (!occurrenceDate || !isDateOnly(occurrenceDate)) throw new CalendarInputError("Choose which occurrence to delete.");
    await writeCalendar({ ...doc, events: doc.events.map((event) => event.id === id ? { ...event, exceptions: [...new Set([...(event.exceptions ?? []), occurrenceDate])], updatedAt: new Date().toISOString() } : event) });
    return;
  }
  await writeCalendar({ ...doc, events: doc.events.filter((event) => event.id !== id) });
}

export function fieldsOf(event: StoredEvent | Occurrence): Fields {
  const { title, start, end, allDay, tz, category, location, notes, repeat } = event;
  return { title, start, end, allDay, tz, category, location, notes, ...(repeat ? { repeat } : {}) };
}

export { dateKey };
