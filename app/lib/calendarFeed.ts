import { get, put } from "@vercel/blob";
import { validZone } from "./calendarTime";
import { parseIcs, type FeedEvent } from "./icsParse";
import { scopeRoot } from "./workspaceScope";

/**
 * Subscribed calendars: an iCalendar link (the school timetable from Celcat) fetched on a schedule and kept beside the
 * owner's own calendar. Its events are shown with the rest but are read-only; the source stays the place to change them.
 * The link carries a personal token, so it lives in an environment variable and never reaches the browser or the logs.
 */

export type Feed = { id: string; name: string; color: string; env: string };
export const FEEDS: Feed[] = [{ id: "rca", name: "RCA", color: "#ff375f", env: "RCA_CALENDAR_ICS_URL" }];

type FeedDoc = { syncedAt: string; count: number; events: FeedEvent[] };

const feedPath = async (feed: Feed) => `${await scopeRoot()}calendar/feed-${feed.id}.json`;
const SYNC_EVERY = 60 * 60_000;
const KEEP_BEFORE = 60 * 86_400_000;
const KEEP_AFTER = 400 * 86_400_000;
const MAX_BYTES = 5_000_000;
const MAX_EVENTS = 4000;

export const isFeedId = (id: unknown) => typeof id === "string" && FEEDS.some((feed) => id.startsWith(`${feed.id}:`));
export const configuredFeeds = () => FEEDS.filter((feed) => !!process.env[feed.env]);

/** The feed's link, with webcal:// read as https://. Only https links are fetched. */
function feedUrl(feed: Feed) {
  const raw = (process.env[feed.env] ?? "").trim().replace(/^webcals?:\/\//i, "https://");
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export async function readFeed(feed: Feed): Promise<FeedDoc | null> {
  try {
    const result = await get(await feedPath(feed), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return JSON.parse(await new Response(result.stream).text()) as FeedDoc;
  } catch {
    return null;
  }
}

/** Every stored event of the configured feeds, for the current person (only the owner ever has any). */
export async function feedEvents(): Promise<{ events: FeedEvent[]; feeds: Feed[] }> {
  const feeds = configuredFeeds();
  const docs = await Promise.all(feeds.map(readFeed));
  return { events: docs.flatMap((doc) => doc?.events ?? []), feeds: feeds.filter((_, index) => docs[index]) };
}

/** Fetches one feed and replaces the stored copy. Throws with a short reason; the link itself is never included. */
export async function syncFeed(feed: Feed) {
  const url = feedUrl(feed);
  if (!url) throw new Error(`${feed.env} is missing or not an https link`);
  const response = await fetch(url, { headers: { Accept: "text/calendar, */*" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`feed answered ${response.status}`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("feed is too large");
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("feed is too large");
  if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new Error("feed is not an iCalendar file (a login page?)");
  const zone = validZone(process.env.WORKSPACE_ZONE || "Europe/London");
  const now = Date.now();
  const events = parseIcs(text, { source: feed.id, category: feed.id, zone, now: new Date(now).toISOString() })
    .filter((event) => event.repeat || (Date.parse(event.end) > now - KEEP_BEFORE && Date.parse(event.start) < now + KEEP_AFTER))
    .slice(0, MAX_EVENTS);
  const doc: FeedDoc = { syncedAt: new Date(now).toISOString(), count: events.length, events };
  await put(await feedPath(feed), JSON.stringify(doc), { access: "private", allowOverwrite: true, contentType: "application/json" });
  return { feed: feed.id, count: events.length };
}

/** Syncs the configured feeds that are older than an hour. Safe to call every ten minutes from the cron. */
export async function syncDueFeeds() {
  const results: { feed: string; count?: number; skipped?: true; error?: string }[] = [];
  for (const feed of configuredFeeds()) {
    const stored = await readFeed(feed);
    if (stored && Date.now() - Date.parse(stored.syncedAt) < SYNC_EVERY) { results.push({ feed: feed.id, skipped: true }); continue; }
    try {
      results.push(await syncFeed(feed));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "failed";
      console.error(`Calendar feed ${feed.id} failed: ${reason}`);
      results.push({ feed: feed.id, error: reason });
    }
  }
  return results;
}
