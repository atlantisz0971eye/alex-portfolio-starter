import { accessTokenFor, CALENDAR_SCOPE, decodeEntities, htmlToText, MailAuthError } from "./gmail";
import type { MailAccount } from "./mailStore";

const API = "https://www.googleapis.com/calendar/v3";

export class CalendarScopeError extends Error {
  constructor() { super("Calendar access was not granted"); }
}

export const hasCalendarScope = (account: MailAccount) => !!account.scopes?.includes(CALENDAR_SCOPE);

export type CalendarInfo = { id: string; account: string; name: string; color: string; primary: boolean };

export type CalendarEvent = {
  id: string;
  account: string;
  calendarId: string;
  calendarName: string;
  color: string;
  title: string;
  /** ISO date-time, or YYYY-MM-DD for all-day events. */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  link: string;
  meetingLink: string;
  attendees: { name: string; responded: string }[];
  declined: boolean;
};

async function api<T>(token: string, path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (response.status === 401) throw new MailAuthError();
  if (response.status === 403) {
    const reason = await response.text().catch(() => "");
    // An account consented before calendar support, or the Calendar API is switched off for the project.
    console.error("Google Calendar request forbidden", reason.slice(0, 300));
    throw new CalendarScopeError();
  }
  if (!response.ok) throw new Error(`Calendar request failed (${response.status})`);
  return response.json() as Promise<T>;
}

type RawCalendar = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; selected?: boolean; primary?: boolean };
type RawEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { displayName?: string; email?: string; self?: boolean; responseStatus?: string }[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
};

export async function listCalendars(account: MailAccount): Promise<CalendarInfo[]> {
  const token = await accessTokenFor(account);
  const data = await api<{ items?: RawCalendar[] }>(token, "users/me/calendarList", { minAccessRole: "reader", maxResults: "50" });
  // Show what the Google Calendar app shows: calendars ticked there, plus the primary one.
  return (data.items ?? [])
    .filter((item) => item.selected || item.primary)
    .slice(0, 10)
    .map((item) => ({ id: item.id, account: account.id, name: item.summaryOverride || item.summary || item.id, color: item.backgroundColor || "#8e8e93", primary: !!item.primary }));
}

export async function listEvents(account: MailAccount, calendars: CalendarInfo[], from: string, to: string): Promise<CalendarEvent[]> {
  const token = await accessTokenFor(account);
  const lists = await Promise.all(calendars.map(async (calendar) => {
    const data = await api<{ items?: RawEvent[] }>(token, `calendars/${encodeURIComponent(calendar.id)}/events`, {
      timeMin: from,
      timeMax: to,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    return (data.items ?? []).filter((item) => item.status !== "cancelled" && (item.start?.dateTime || item.start?.date)).map((item): CalendarEvent => {
      const allDay = !item.start?.dateTime;
      const self = item.attendees?.find((person) => person.self);
      return {
        id: item.id,
        account: account.id,
        calendarId: calendar.id,
        calendarName: calendar.name,
        color: calendar.color,
        title: item.summary || "(no title)",
        start: item.start?.dateTime ?? item.start?.date ?? "",
        end: item.end?.dateTime ?? item.end?.date ?? "",
        allDay,
        location: item.location ?? "",
        description: describe(item.description ?? ""),
        link: item.htmlLink ?? "",
        meetingLink: item.hangoutLink || item.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri || "",
        attendees: (item.attendees ?? []).filter((person) => !person.self).slice(0, 20).map((person) => ({ name: person.displayName || person.email || "", responded: person.responseStatus ?? "needsAction" })),
        declined: self?.responseStatus === "declined",
      };
    });
  }));
  return lists.flat();
}

/** Descriptions can be HTML; keep only readable text and cap the length. */
function describe(value: string) {
  const text = /<[a-z][\s\S]*>/i.test(value) ? htmlToText(value) : decodeEntities(value);
  return text.trim().slice(0, 1500);
}

export type CalendarFailure = { account: string; email: string; reason: "reauth" | "scope" | "failed" };

/** Events and calendars across every connected account; one account failing does not hide the others. */
export async function loadAll(accounts: MailAccount[], from: string, to: string) {
  const events: CalendarEvent[] = [];
  const calendars: CalendarInfo[] = [];
  const failures: CalendarFailure[] = [];
  await Promise.all(accounts.map(async (account) => {
    if (!hasCalendarScope(account)) return void failures.push({ account: account.id, email: account.email, reason: "scope" });
    try {
      const own = await listCalendars(account);
      calendars.push(...own);
      events.push(...await listEvents(account, own, from, to));
    } catch (error) {
      failures.push({ account: account.id, email: account.email, reason: error instanceof MailAuthError ? "reauth" : error instanceof CalendarScopeError ? "scope" : "failed" });
    }
  }));
  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { events, calendars, failures };
}

/** Parses and bounds the requested window so a request cannot ask for years of events. */
export function parseRange(params: URLSearchParams) {
  const from = Date.parse(params.get("from") ?? "");
  const to = Date.parse(params.get("to") ?? "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 45 * 86_400_000) return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
