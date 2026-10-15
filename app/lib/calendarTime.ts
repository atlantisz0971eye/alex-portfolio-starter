/** Time-zone aware helpers and recurrence expansion for the Workspace calendar. */

export type Repeat = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  /** Inclusive last date, YYYY-MM-DD, in the event's time zone. */
  until?: string;
  count?: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday. Defaults to the start's weekday. */
  byDay?: number[];
};

export type StoredEvent = {
  id: string;
  title: string;
  /** ISO instant for timed events, YYYY-MM-DD for all-day events. */
  start: string;
  /** Exclusive end; same format as `start`. */
  end: string;
  allDay: boolean;
  tz: string;
  category: string;
  location: string;
  notes: string;
  repeat?: Repeat;
  /** Wall dates (YYYY-MM-DD) of removed occurrences. */
  exceptions?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: "user" | "agent";
};

export type Occurrence = Omit<StoredEvent, "exceptions"> & { occurrenceDate: string; recurring: boolean };

const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

export function validZone(zone: unknown): string {
  if (typeof zone !== "string" || !zone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

function formatter(zone: string) {
  let found = formatters.get(zone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
    formatters.set(zone, found);
  }
  return found;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type Wall = { y: number; m: number; d: number; h: number; mi: number; dow: number };

export function wallParts(ms: number, zone: string): Wall {
  const map: Record<string, string> = {};
  for (const part of formatter(zone).formatToParts(new Date(ms))) map[part.type] = part.value;
  return { y: +map.year, m: +map.month, d: +map.day, h: +map.hour % 24, mi: +map.minute, dow: WEEKDAYS.indexOf(map.weekday) };
}

function offsetMs(ms: number, zone: string) {
  const w = wallParts(ms, zone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) - Math.floor(ms / 60_000) * 60_000;
}

/** The instant at which the wall clock in `zone` reads the given date and time. */
export function zonedToInstant(y: number, m: number, d: number, h: number, mi: number, zone: string) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let result = guess - offsetMs(guess, zone);
  const second = offsetMs(result, zone);
  if (guess - second !== result) result = guess - second;
  return result;
}

export const dateKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const parseKey = (key: string) => { const [y, m, d] = key.split("-").map(Number); return { y, m, d }; };
const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
const fromDayNumber = (n: number) => { const date = new Date(n * DAY); return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }; };
const dowOf = (n: number) => (((n + 4) % 7) + 7) % 7;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Accepts an ISO instant (with Z or an offset), a local "YYYY-MM-DDTHH:mm" read in `zone`,
 * or a plain date. Returns null when the text is not a usable time.
 */
export function toInstant(value: unknown, zone: string): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/(Z|[+-]\d\d:?\d\d)$/.test(text) && /T/.test(text)) {
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text);
  if (!match) return null;
  const [, y, m, d, h = "0", mi = "0"] = match;
  if (+m < 1 || +m > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return null;
  return zonedToInstant(+y, +m, +d, +h, +mi, zone);
}

export const isDateOnly = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Wall dates (as day numbers) on which the series starts an occurrence, in order, up to `limitDay`. */
function* seriesDays(event: StoredEvent, startDay: number, limitDay: number): Generator<number> {
  const repeat = event.repeat;
  if (!repeat) { yield startDay; return; }
  const interval = Math.max(1, Math.floor(repeat.interval || 1));
  const untilDay = repeat.until ? (({ y, m, d }) => dayNumber(y, m, d))(parseKey(repeat.until)) : Infinity;
  const maxCount = repeat.count && repeat.count > 0 ? repeat.count : Infinity;
  const stop = Math.min(limitDay, untilDay);
  const start = fromDayNumber(startDay);
  let produced = 0;
  let guard = 0;
  if (repeat.freq === "daily") {
    for (let n = startDay; n <= stop && produced < maxCount && guard++ < 40_000; n += interval) { produced += 1; yield n; }
  } else if (repeat.freq === "weekly") {
    const days = (repeat.byDay?.length ? [...new Set(repeat.byDay)] : [dowOf(startDay)]).sort((a, b) => a - b);
    const weekStart = startDay - ((dowOf(startDay) + 6) % 7);
    for (let week = weekStart; week <= stop && produced < maxCount && guard++ < 10_000; week += 7 * interval) {
      for (const day of days) {
        const n = week + ((day + 6) % 7);
        if (n < startDay) continue;
        if (n > stop || produced >= maxCount) break;
        produced += 1;
        yield n;
      }
    }
  } else if (repeat.freq === "monthly") {
    for (let k = 0; produced < maxCount && guard++ < 5_000; k += interval) {
      const index = start.m - 1 + k;
      const y = start.y + Math.floor(index / 12);
      const m = (index % 12) + 1;
      const n = dayNumber(y, m, Math.min(start.d, daysInMonth(y, m)));
      if (n > stop) return;
      produced += 1;
      yield n;
    }
  } else {
    for (let k = 0; produced < maxCount && guard++ < 1_000; k += interval) {
      const y = start.y + k;
      const n = dayNumber(y, start.m, Math.min(start.d, daysInMonth(y, start.m)));
      if (n > stop) return;
      produced += 1;
      yield n;
    }
  }
}

/** Occurrences of one event that overlap [from, to). Recurrence is evaluated on the wall clock of the event's zone. */
export function expand(event: StoredEvent, from: number, to: number): Occurrence[] {
  const { exceptions, ...rest } = event;
  const skipped = new Set(exceptions ?? []);
  const out: Occurrence[] = [];
  const recurring = !!event.repeat;
  if (event.allDay) {
    const s = parseKey(event.start);
    const startDay = dayNumber(s.y, s.m, s.d);
    const e = parseKey(event.end);
    const length = Math.max(1, dayNumber(e.y, e.m, e.d) - startDay);
    for (const n of seriesDays(event, startDay, Math.ceil(to / DAY) + 1)) {
      const { y, m, d } = fromDayNumber(n);
      const key = dateKey(y, m, d);
      if (skipped.has(key)) continue;
      if ((n + length) * DAY <= from || n * DAY >= to) continue;
      const end = fromDayNumber(n + length);
      out.push({ ...rest, start: key, end: dateKey(end.y, end.m, end.d), occurrenceDate: key, recurring });
    }
    return out;
  }
  const startMs = Date.parse(event.start);
  const length = Math.max(60_000, Date.parse(event.end) - startMs);
  const wall = wallParts(startMs, event.tz);
  const startDay = dayNumber(wall.y, wall.m, wall.d);
  for (const n of seriesDays(event, startDay, Math.ceil(to / DAY) + 2)) {
    const { y, m, d } = fromDayNumber(n);
    const key = dateKey(y, m, d);
    if (skipped.has(key)) continue;
    const start = recurring ? zonedToInstant(y, m, d, wall.h, wall.mi, event.tz) : startMs;
    if (start + length <= from || start >= to) continue;
    out.push({ ...rest, start: new Date(start).toISOString(), end: new Date(start + length).toISOString(), occurrenceDate: key, recurring });
  }
  return out;
}

/** Wall date key (YYYY-MM-DD) of an instant in a zone. */
export function wallDate(ms: number, zone: string) {
  const w = wallParts(ms, zone);
  return dateKey(w.y, w.m, w.d);
}

export const addDaysToKey = (key: string, days: number) => { const { y, m, d } = parseKey(key); const r = fromDayNumber(dayNumber(y, m, d) + days); return dateKey(r.y, r.m, r.d); };
export const daysBetweenKeys = (a: string, b: string) => { const x = parseKey(a); const y = parseKey(b); return dayNumber(y.y, y.m, y.d) - dayNumber(x.y, x.m, x.d); };
