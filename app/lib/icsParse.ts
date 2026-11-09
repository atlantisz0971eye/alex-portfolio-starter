import { addDaysToKey, dateKey, validZone, wallDate, zonedToInstant, type Repeat, type StoredEvent } from "./calendarTime";

/**
 * A small iCalendar (RFC 5545) reader for subscribed timetables such as Celcat. It reads VEVENTs with their summary,
 * place, description, start and end (UTC, floating, TZID or all-day), and simple RRULE / EXDATE series. Anything it
 * cannot place in time is skipped rather than guessed.
 */

export type FeedEvent = StoredEvent & { source: string };

// Exchange and Celcat sometimes write Windows zone names instead of IANA ones.
const WINDOWS_ZONES: Record<string, string> = {
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Etc/GMT",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "China Standard Time": "Asia/Shanghai",
  "UTC": "UTC",
};

type Prop = { name: string; params: Record<string, string>; value: string };

/** Lines folded with a leading space or tab are joined back first. */
export function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Prop | null {
  // The value starts at the first colon that is not inside a quoted parameter.
  let quoted = false;
  let split = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) { split = i; break; }
  }
  if (split < 0) return null;
  const [rawName, ...rawParams] = line.slice(0, split).split(";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf("=");
    if (eq > 0) params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: rawName.toUpperCase(), params, value: line.slice(split + 1) };
}

const unescapeText = (value: string) => value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

function zoneOf(tzid: string | undefined, fallback: string) {
  if (!tzid) return fallback;
  const named = WINDOWS_ZONES[tzid] ?? tzid.replace(/^\/[^/]*\//, "");
  const zone = validZone(named);
  return zone === "UTC" && named !== "UTC" ? fallback : zone;
}

/** A DATE or DATE-TIME value: an instant for timed values, a YYYY-MM-DD key for dates. */
function readTime(prop: Prop, fallbackZone: string): { allDay: true; key: string } | { allDay: false; ms: number; zone: string } | null {
  const value = prop.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date || prop.params.VALUE === "DATE") {
    if (!date) return null;
    return { allDay: true, key: dateKey(Number(date[1]), Number(date[2]), Number(date[3])) };
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!time) return null;
  const [y, m, d, h, mi] = time.slice(1, 6).map(Number);
  if (time[7]) return { allDay: false, ms: Date.UTC(y, m - 1, d, h, mi), zone: zoneOf(prop.params.TZID, fallbackZone) };
  const zone = zoneOf(prop.params.TZID, fallbackZone);
  return { allDay: false, ms: zonedToInstant(y, m, d, h, mi, zone), zone };
}

const DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function readRule(value: string, zone: string): Repeat | undefined {
  const parts = Object.fromEntries(value.split(";").map((part) => part.split("=")).filter((pair) => pair.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const FREQS: Record<string, Repeat["freq"]> = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" };
  const freq = FREQS[parts.FREQ];
  if (!freq) return undefined;
  const repeat: Repeat = { freq, interval: Math.min(99, Math.max(1, Number(parts.INTERVAL) || 1)) };
  if (parts.COUNT) repeat.count = Math.min(1000, Math.max(1, Number(parts.COUNT) || 1));
  if (parts.UNTIL) {
    const until = readTime({ name: "UNTIL", params: {}, value: parts.UNTIL }, zone);
    if (until) repeat.until = until.allDay ? until.key : wallDate(until.ms, zone);
  }
  if (freq === "weekly" && parts.BYDAY) {
    const days = parts.BYDAY.split(",").map((day: string) => DAYS[day.slice(-2)]).filter((day: number | undefined): day is number => day !== undefined);
    if (days.length) repeat.byDay = [...new Set(days)];
  }
  return repeat;
}

/**
 * The events of an iCalendar text, as stored calendar events in category `category`. `zone` is used for floating
 * times and unknown zones. Ids are `${source}:${UID}` (plus the RECURRENCE-ID when a single occurrence is overridden).
 */
export function parseIcs(text: string, { source, category, zone, now = new Date().toISOString() }: { source: string; category: string; zone: string; now?: string }): FeedEvent[] {
  const events: FeedEvent[] = [];
  const seen = new Map<string, number>();
  let current: Prop[] | null = null;
  let depth = 0;
  const calendarZone = (() => {
    const line = unfold(text).find((entry) => entry.toUpperCase().startsWith("X-WR-TIMEZONE:"));
    return line ? zoneOf(line.slice(line.indexOf(":") + 1).trim(), zone) : zone;
  })();
  for (const line of unfold(text)) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") { current = []; depth = 0; continue; }
    if (!current) continue;
    // Nested blocks such as VALARM are skipped.
    if (upper.startsWith("BEGIN:")) { depth += 1; continue; }
    if (upper.startsWith("END:") && upper !== "END:VEVENT") { depth = Math.max(0, depth - 1); continue; }
    if (upper === "END:VEVENT") {
      const event = toEvent(current, { source, category, zone: calendarZone, now });
      if (event) {
        const at = seen.get(event.id);
        if (at === undefined) { seen.set(event.id, events.length); events.push(event); } else events[at] = event;
      }
      current = null;
      continue;
    }
    if (depth > 0) continue;
    const prop = parseLine(line);
    if (prop) current.push(prop);
  }
  return events;
}

function toEvent(props: Prop[], { source, category, zone, now }: { source: string; category: string; zone: string; now: string }): FeedEvent | null {
  const one = (name: string) => props.find((prop) => prop.name === name);
  if (/^CANCELLED$/i.test(one("STATUS")?.value ?? "")) return null;
  const startProp = one("DTSTART");
  if (!startProp) return null;
  const start = readTime(startProp, zone);
  if (!start) return null;
  const endProp = one("DTEND");
  const end = endProp ? readTime(endProp, zone) : null;
  const title = unescapeText(one("SUMMARY")?.value ?? "").slice(0, 200) || "(untitled)";
  const uid = (one("UID")?.value ?? "").trim() || `${title}@${startProp.value}`;
  const recurrence = one("RECURRENCE-ID")?.value.trim();
  const id = `${source}:${uid}${recurrence ? `#${recurrence}` : ""}`.slice(0, 300);
  let startValue: string;
  let endValue: string;
  let tz = zone;
  if (start.allDay) {
    startValue = start.key;
    endValue = end?.allDay && end.key > start.key ? end.key : addDaysToKey(start.key, 1);
  } else {
    tz = start.zone;
    const endMs = end && !end.allDay && end.ms > start.ms ? end.ms : start.ms + durationMs(one("DURATION")?.value);
    startValue = new Date(start.ms).toISOString();
    endValue = new Date(Math.min(endMs, start.ms + 14 * 86_400_000)).toISOString();
  }
  const rule = one("RRULE");
  const repeat = rule && !recurrence ? readRule(rule.value, tz) : undefined;
  const exceptions = repeat ? props.filter((prop) => prop.name === "EXDATE").flatMap((prop) => prop.value.split(",").map((value) => readTime({ ...prop, value }, tz))).flatMap((time) => time ? [time.allDay ? time.key : wallDate(time.ms, tz)] : []) : [];
  const stamp = one("LAST-MODIFIED")?.value ?? one("DTSTAMP")?.value;
  const modified = stamp ? readTime({ name: "STAMP", params: {}, value: stamp }, "UTC") : null;
  const updatedAt = modified && !modified.allDay ? new Date(modified.ms).toISOString() : now;
  return {
    id, title, start: startValue, end: endValue, allDay: start.allDay, tz, category,
    location: unescapeText(one("LOCATION")?.value ?? "").slice(0, 200),
    notes: unescapeText(one("DESCRIPTION")?.value ?? "").slice(0, 4000),
    ...(repeat ? { repeat } : {}),
    ...(exceptions.length ? { exceptions } : {}),
    createdAt: updatedAt, updatedAt, createdBy: "user", source,
  };
}

/** An ISO 8601 duration such as PT1H30M or P1D; one hour when missing or unreadable. */
function durationMs(value: string | undefined) {
  const match = value && /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!match) return 3_600_000;
  const [w, d, h, m, s] = match.slice(1).map((part) => Number(part) || 0);
  return Math.max(60_000, (((w * 7 + d) * 24 + h) * 60 + m) * 60_000 + s * 1000);
}
