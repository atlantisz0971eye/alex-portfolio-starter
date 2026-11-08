import { readEvents, workDay, type LedgerEvent } from "./ledger";

/**
 * Carcosa as a creature: she eats what the ledger records of development (synced changes, commits, deploys) and learns
 * the owner's routine from when that happens. Everything here is computed from the ledger on each read; nothing is
 * stored, so a rule change applies to the past too.
 *
 * Phases: eating (fed in the last half hour), sleeping (outside the usual hours and quiet), the yak (well fed), the
 * lump (hungry: a slime mould left without food dries into one).
 * Sky, a mirror of the rhythm rather than a verdict: twin suns when work keeps to its usual shape, the black star when
 * it has clearly left it (far past the usual end, far above the usual load, many days without a rest), both together
 * while it is drifting.
 */
export type Phase = "eating" | "sleeping" | "yak" | "lump";
export type Sky = "suns" | "both" | "star";
export type Bite = { at: string; kind: "sync" | "commit" | "deploy" | "tick"; label: string; value: number };
export type Signal = { key: "late" | "load" | "streak"; level: "both" | "star"; text: string };
export type CreatureView = {
  phase: Phase; sky: Sky; theme: "light" | "dark";
  satiety: number; lastFedAt: string | null;
  routine: { hours: number[]; start: number | null; end: number | null; days: number; medianLoad: number };
  today: { day: string; load: number; firstAt: string | null; lastAt: string | null };
  streak: number; signals: Signal[]; bites: Bite[]; learning: boolean;
};

const HOUR = 3_600_000;
const HALF_LIFE = 6 * HOUR;
const LEARN_DAYS = 28;
const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** London clock as hours since 05:00 (0..24), so a night past midnight sorts after the evening. */
const shifted = (ms: number) => { const [h, m] = hourFormat.format(new Date(ms)).split(":").map(Number); return (h + m / 60 - 5 + 24) % 24; };
const clock = (s: number) => { const t = (s + 5) % 24; return `${String(Math.floor(t)).padStart(2, "0")}:${String(Math.round((t % 1) * 60) % 60).padStart(2, "0")}`; };
export const clockOf = clock;

/** How much a ledger event feeds her. Only what the owner did counts; a deploy is the end of a meal, not a big one. */
function bite(e: LedgerEvent): Bite | null {
  if (e.kind === "commit") return { at: e.at, kind: "commit", label: `${e.repo.split("/")[1]} · ${e.message}`, value: 3 };
  if (e.kind === "sync" && e.changed > 0) return { at: e.at, kind: "sync", label: `${e.source} · ${e.changed} files synced`, value: Math.min(e.changed, 12) * 0.4 };
  if (e.kind === "tick" && e.delta > 0) return { at: e.at, kind: "tick", label: `${e.source} · ✓${e.delta}`, value: e.delta };
  if (e.kind === "deploy" && /prod/i.test(e.env) && e.state === "success") return { at: e.at, kind: "deploy", label: `${e.repo.split("/")[1]} · deployed ${e.sha.slice(0, 7)}`, value: 2 };
  return null;
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

export async function creatureView(now = Date.now()): Promise<CreatureView> {
  const events = await readEvents(now - LEARN_DAYS * 86_400_000);
  const bites = events.map(bite).filter((b): b is Bite => !!b).sort((a, b) => a.at.localeCompare(b.at));
  const today = workDay(now);

  // the routine: per past work day, when it started and ended and how much was eaten; the hours histogram over all of it
  const byDay = new Map<string, { first: number; last: number; load: number }>();
  const hours = Array<number>(24).fill(0);
  for (const b of bites) {
    const ms = Date.parse(b.at); const d = workDay(ms); const s = shifted(ms);
    const day = byDay.get(d) ?? { first: s, last: s, load: 0 };
    day.first = Math.min(day.first, s); day.last = Math.max(day.last, s); day.load += b.value;
    byDay.set(d, day);
    hours[Math.floor((s + 5) % 24)] += b.value;
  }
  const past = [...byDay.entries()].filter(([d]) => d !== today).map(([, v]) => v);
  const learning = past.length < 5;
  const start = past.length ? quantile(past.map((d) => d.first), 0.25) : null;
  const end = past.length ? quantile(past.map((d) => d.last), 0.75) : null;
  const medianLoad = median(past.map((d) => d.load));
  const total = hours.reduce((a, b) => a + b, 0) || 1;

  const t = byDay.get(today);
  const lastBite = bites[bites.length - 1];
  const lastMs = lastBite ? Date.parse(lastBite.at) : 0;
  const satiety = Math.min(1, bites.reduce((sum, b) => sum + b.value * 0.5 ** ((now - Date.parse(b.at)) / HALF_LIFE), 0) / Math.max(12, medianLoad * 0.6));

  // days in a row with something eaten, counting back from today (or yesterday, if today has not started)
  let streak = 0;
  for (let i = t ? 0 : 1; i < LEARN_DAYS; i += 1) { if (byDay.has(workDay(now - i * 86_400_000))) streak += 1; else break; }

  const signals: Signal[] = [];
  const nowS = shifted(now);
  if (!learning && end !== null && t) {
    // working past the usual end, measured on the last thing eaten today
    const over = t.last - end;
    if (over > 2) signals.push({ key: "late", level: "star", text: `今天最后一次动静在 ${clock(t.last)}，比平时收工（${clock(end)}）晚了 ${over.toFixed(1)} 小时` });
    else if (over > 0.75) signals.push({ key: "late", level: "both", text: `今天比平时收工（${clock(end)}）晚了一点，到了 ${clock(t.last)}` });
  }
  if (!learning && medianLoad > 0 && t) {
    const ratio = t.load / medianLoad;
    if (ratio > 3) signals.push({ key: "load", level: "star", text: `今天吃下的量是平时的 ${ratio.toFixed(1)} 倍` });
    else if (ratio > 1.8) signals.push({ key: "load", level: "both", text: `今天吃下的量是平时的 ${ratio.toFixed(1)} 倍` });
  }
  if (streak >= 14) signals.push({ key: "streak", level: "star", text: `已经连续 ${streak} 天没有停过` });
  else if (streak >= 9) signals.push({ key: "streak", level: "both", text: `已经连续 ${streak} 天在做` });
  const sky: Sky = signals.some((s) => s.level === "star") ? "star" : signals.length ? "both" : "suns";

  const inHours = start !== null && end !== null ? nowS >= start - 0.5 && nowS <= end + 0.5 : nowS >= 4 && nowS <= 18;
  const quiet = now - lastMs > 2 * HOUR;
  const phase: Phase = now - lastMs < 30 * 60_000 ? "eating" : !inHours && quiet ? "sleeping" : satiety >= 0.5 ? "yak" : "lump";
  // the auto theme: light only while the suns are up alone and it is inside the usual day
  const theme = sky === "suns" && inHours ? "light" : "dark";

  return {
    phase, sky, theme, satiety: Math.round(satiety * 100) / 100, lastFedAt: lastBite?.at ?? null,
    routine: { hours: hours.map((h) => Math.round((h / total) * 1000) / 1000), start, end, days: past.length, medianLoad: Math.round(medianLoad * 10) / 10 },
    today: { day: today, load: Math.round((t?.load ?? 0) * 10) / 10, firstAt: t ? clock(t.first) : null, lastAt: t ? clock(t.last) : null },
    streak, signals, bites: bites.slice(-12).reverse(), learning,
  };
}
