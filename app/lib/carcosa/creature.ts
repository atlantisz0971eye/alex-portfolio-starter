import { readNotes, type Notes } from "./checkins";
import { readEvents, workDay, type LedgerEvent } from "./ledger";

/**
 * Carcosa as a creature. She eats what the ledger records of development (synced changes, commits, ticks, deploys),
 * learns the owner's routine from when that happens, and is rewarded for keeping it rather than for volume: stopping
 * near the usual end and declared rest days feed her too, and a day far above the usual load leaves her too full to
 * move. With the owner's own check-ins (mood, energy, sleep) she learns which parts of the rhythm go with worse days
 * for this person, and says so plainly. Everything is computed on each read from the ledger and the check-ins.
 *
 * Phases: eating (fed in the last half hour), heavy (today is far above the usual load), resting (a declared rest day),
 * sleeping (outside the usual hours and quiet), the yak (well fed), the lump (hungry).
 * Sky, a mirror rather than a verdict: twin suns while work keeps its usual shape, the black star when it has clearly
 * left it, both while it drifts.
 */
export type Phase = "eating" | "heavy" | "resting" | "sleeping" | "yak" | "lump";
export type Sky = "suns" | "both" | "star";
export type Bite = { at: string; kind: "sync" | "commit" | "deploy" | "tick" | "rest"; label: string; value: number };
export type Signal = { key: string; level: "both" | "star"; text: string };
export type Finding = { key: string; text: string; diff: number; n: [number, number] };
export type JournalDay = { day: string; intensity: number; valence: number };
export type CreatureView = {
  phase: Phase; sky: Sky; theme: "light" | "dark";
  satiety: number; lastFedAt: string | null;
  routine: { hours: number[]; start: number | null; end: number | null; days: number; medianLoad: number };
  today: { day: string; load: number; firstAt: string | null; lastAt: string | null; rest: boolean };
  streak: number; suggestRest: boolean; signals: Signal[]; bites: Bite[]; learning: boolean;
  findings: Finding[]; checkins: number;
};

const HOUR = 3_600_000;
const DAY_MS = 86_400_000;
const HALF_LIFE = 6 * HOUR;
const LEARN_DAYS = 28;
const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** London clock as hours since 05:00 (0..24), so a night past midnight sorts after the evening. */
const shifted = (ms: number) => { const [h, m] = hourFormat.format(new Date(ms)).split(":").map(Number); return (h + m / 60 - 5 + 24) % 24; };
export const clockOf = (s: number) => { const t = (s + 5) % 24; return `${String(Math.floor(t)).padStart(2, "0")}:${String(Math.round((t % 1) * 60) % 60).padStart(2, "0")}`; };
/** The instant a shifted hour on a work day happened, close enough for ordering and decay. */
const instant = (day: string, s: number) => Date.parse(`${day}T05:00:00Z`) + s * HOUR;
const prevDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

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
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export async function creatureView(options: { journal?: JournalDay[]; now?: number } = {}): Promise<CreatureView> {
  const now = options.now ?? Date.now();
  const [events, notes] = await Promise.all([readEvents(now - 60 * DAY_MS), readNotes().catch((): Notes => ({}))]);
  const work = events.map(bite).filter((b): b is Bite => !!b).sort((a, b) => a.at.localeCompare(b.at));
  const today = workDay(now);
  const restDays = new Set(Object.entries(notes).filter(([, n]) => n.rest).map(([d]) => d));

  // per work day: when it started and ended and how much was eaten (60 days kept for calibration, 28 for the routine)
  const byDay = new Map<string, { first: number; last: number; load: number }>();
  const hours = Array<number>(24).fill(0);
  const learnFrom = workDay(now - LEARN_DAYS * DAY_MS);
  for (const b of work) {
    const ms = Date.parse(b.at); const d = workDay(ms); const s = shifted(ms);
    const day = byDay.get(d) ?? { first: s, last: s, load: 0 };
    day.first = Math.min(day.first, s); day.last = Math.max(day.last, s); day.load += b.value;
    byDay.set(d, day);
    if (d >= learnFrom) hours[Math.floor((s + 5) % 24)] += b.value;
  }
  const past = [...byDay.entries()].filter(([d]) => d !== today && d >= learnFrom && !restDays.has(d)).map(([, v]) => v);
  const learning = past.length < 5;
  const start = past.length ? quantile(past.map((d) => d.first), 0.25) : null;
  const end = past.length ? quantile(past.map((d) => d.last), 0.75) : null;
  const medianLoad = median(past.map((d) => d.load));
  const total = hours.reduce((a, b) => a + b, 0) || 1;

  // treats: stopping near the usual end, and declared rest days; they feed her but are not work
  const treats: Bite[] = [];
  if (!learning && end !== null) for (const [d, v] of byDay) if (d !== today && d >= learnFrom && v.last <= end + 0.75) treats.push({ at: new Date(instant(d, v.last + 1)).toISOString(), kind: "rest", label: `按时收工 · ${d.slice(5)} ${clockOf(v.last)}`, value: 4 });
  for (const d of restDays) if (d >= learnFrom && d <= today) treats.push({ at: new Date(instant(d, 7)).toISOString(), kind: "rest", label: `休息日 · ${d.slice(5)}`, value: 8 });
  const food = [...work, ...treats].filter((b) => Date.parse(b.at) <= now).sort((a, b) => a.at.localeCompare(b.at));

  const t = byDay.get(today);
  const restToday = restDays.has(today);
  const lastWork = work[work.length - 1];
  const lastMs = lastWork ? Date.parse(lastWork.at) : 0;
  const lastFood = food[food.length - 1];
  const satiety = Math.min(1, food.reduce((sum, b) => sum + b.value * 0.5 ** ((now - Date.parse(b.at)) / HALF_LIFE), 0) / Math.max(12, medianLoad * 0.6));

  // days in a row with work, counting back from today (or yesterday, if today has not started); a rest day ends it
  const streakAt = (from: string) => { let n = 0; let d = from; for (let i = 0; i < 60; i += 1) { if (byDay.has(d) && !restDays.has(d)) n += 1; else break; d = prevDay(d); } return n; };
  const streak = streakAt(t ? today : prevDay(today));

  // calibration: for each day with a check-in, what the rhythm looked like the day before and that day
  const journal = new Set((options.journal ?? []).map((j) => j.day));
  type Row = { mood?: number; energy?: number; late: boolean; heavy: boolean; long: boolean; wrote: boolean; short: boolean };
  const rows: Row[] = [];
  for (const [d, n] of Object.entries(notes)) {
    if (!n.mood && !n.energy) continue;
    const y = byDay.get(prevDay(d));
    rows.push({ mood: n.mood, energy: n.energy, late: !!(y && end !== null && y.last > end + 1), heavy: !!(y && medianLoad && y.load > 1.5 * medianLoad), long: streakAt(prevDay(d)) >= 7, wrote: journal.has(d) || journal.has(prevDay(d)), short: typeof n.sleep === "number" && n.sleep < 6 });
  }
  const FEATURES: { key: keyof Row; text: string }[] = [
    { key: "late", text: "前一天收工比平时晚一小时以上" },
    { key: "heavy", text: "前一天的量超过平时 1.5 倍" },
    { key: "long", text: "已经连续做了 7 天以上" },
    { key: "short", text: "睡了不到 6 小时" },
    { key: "wrote", text: "前一天或当天写了日记" },
  ];
  const findings: Finding[] = [];
  for (const f of FEATURES) for (const measure of ["mood", "energy"] as const) {
    const yes = rows.filter((r) => r[f.key] && r[measure]).map((r) => r[measure]!);
    const no = rows.filter((r) => !r[f.key] && r[measure]).map((r) => r[measure]!);
    if (yes.length < 3 || no.length < 3) continue;
    const diff = Math.round((mean(yes) - mean(no)) * 10) / 10;
    if (Math.abs(diff) < 0.6) continue;
    findings.push({ key: `${f.key}:${measure}`, diff, n: [yes.length, no.length], text: `${f.text}的日子，${measure === "mood" ? "心情" : "精力"}平均${diff < 0 ? "低" : "高"} ${Math.abs(diff)}（${yes.length} 天对 ${no.length} 天）` });
  }

  const signals: Signal[] = [];
  if (!learning && end !== null && t && !restToday) {
    const over = t.last - end;
    if (over > 2) signals.push({ key: "late", level: "star", text: `今天最后一次动静在 ${clockOf(t.last)}，比平时收工（${clockOf(end)}）晚了 ${over.toFixed(1)} 小时` });
    else if (over > 0.75) signals.push({ key: "late", level: "both", text: `今天比平时收工（${clockOf(end)}）晚了一点，到了 ${clockOf(t.last)}` });
  }
  const ratio = !learning && medianLoad > 0 && t ? t.load / medianLoad : 0;
  if (ratio > 3) signals.push({ key: "load", level: "star", text: `今天吃下的量是平时的 ${ratio.toFixed(1)} 倍` });
  else if (ratio > 1.8) signals.push({ key: "load", level: "both", text: `今天吃下的量是平时的 ${ratio.toFixed(1)} 倍` });
  if (streak >= 14) signals.push({ key: "streak", level: "star", text: `已经连续 ${streak} 天没有停过` });
  else if (streak >= 9) signals.push({ key: "streak", level: "both", text: `已经连续 ${streak} 天在做` });
  if (restToday && t) signals.push({ key: "rest", level: "both", text: "今天说好休息，但还在做" });
  // her own rules, learned from the check-ins: what went with worse days for this person, applied to today
  const y = byDay.get(prevDay(today));
  const todayHas: Partial<Record<string, boolean>> = { late: !!(y && end !== null && y.last > end + 1), heavy: !!(y && medianLoad && y.load > 1.5 * medianLoad), long: streak >= 7, short: typeof notes[today]?.sleep === "number" && notes[today].sleep! < 6 };
  for (const f of findings) { const [key] = f.key.split(":"); if (f.diff <= -0.8 && todayHas[key] && !signals.some((s) => s.key === `own:${key}`)) signals.push({ key: `own:${key}`, level: "both", text: `按你自己的规律：${f.text}` }); }
  const sky: Sky = signals.some((s) => s.level === "star") ? "star" : signals.length ? "both" : "suns";

  const nowS = shifted(now);
  const inHours = start !== null && end !== null ? nowS >= start - 0.5 && nowS <= end + 0.5 : nowS >= 4 && nowS <= 18;
  const eating = now - lastMs < 30 * 60_000;
  const phase: Phase = ratio > 2 ? "heavy" : eating ? "eating" : restToday ? "resting" : !inHours && now - lastMs > 2 * HOUR ? "sleeping" : satiety >= 0.5 ? "yak" : "lump";
  // the auto theme: light only while the suns are up alone and it is inside the usual day
  const theme = sky === "suns" && inHours && !restToday ? "light" : "dark";

  return {
    phase, sky, theme, satiety: Math.round(satiety * 100) / 100, lastFedAt: lastFood?.at ?? null,
    routine: { hours: hours.map((h) => Math.round((h / total) * 1000) / 1000), start, end, days: past.length, medianLoad: Math.round(medianLoad * 10) / 10 },
    today: { day: today, load: Math.round((t?.load ?? 0) * 10) / 10, firstAt: t ? clockOf(t.first) : null, lastAt: t ? clockOf(t.last) : null, rest: restToday },
    streak, suggestRest: streak >= 9 && !restToday, signals, bites: food.slice(-14).reverse(), learning,
    findings: findings.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 6), checkins: rows.length,
  };
}
