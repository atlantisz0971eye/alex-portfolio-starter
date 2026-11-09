import { readNotes, type Notes } from "./checkins";
import { readEvents, workDay, type LedgerEvent } from "./ledger";

/**
 * Carcosa as a creature. She eats what the ledger records of development (synced changes, commits, ticks, deploys),
 * learns the owner's routine from when that happens, and is rewarded for keeping it rather than for volume. Work is
 * eaten in meals, not bites: events less than 45 minutes apart are one meal, and a meal fills her less with every
 * extra mouthful, so a burst of small commits is still one meal. Commits made with Claude count for less than the
 * owner's own. She does not digest while asleep (outside the usual hours), so a good evening still shows in the
 * morning; stopping near the usual end feeds her that same evening, declared rest days feed her, and the first
 * check-in of the day is breakfast. A day far above the usual load leaves her too full to move. With the owner's own check-ins (mood, energy, sleep) she learns which parts of the rhythm go with worse days
 * for this person, and says so plainly. Everything is computed on each read from the ledger and the check-ins.
 *
 * Phases: eating (fed in the last half hour), heavy (today is far above the usual load), resting (a declared rest day),
 * sleeping (outside the usual hours and quiet), the yak (well fed), the lump (hungry).
 * Sky, a mirror rather than a verdict: twin suns while work keeps its usual shape, the black star when it has clearly
 * left it, both while it drifts.
 */
export type Phase = "eating" | "heavy" | "resting" | "sleeping" | "yak" | "lump";
export type Sky = "suns" | "both" | "star";
export type Bite = { at: string; kind: "meal" | "rest" | "breakfast"; label: string; value: number };
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

/** One mouthful of work, before it is gathered into a meal. Deploys add nothing: they close a meal. */
type Mouthful = { ms: number; value: number; kind: "commit" | "sync" | "tick" | "deploy"; claude: boolean; source: string };
const CLAUDE_SHARE = 0.3;
const MEAL_GAP = 45 * 60_000;
/** A meal's worth: fills fast at first, then each extra mouthful adds less, up to MEAL_MAX. */
const MEAL_MAX = 6;
const mealValue = (raw: number) => MEAL_MAX * (1 - Math.exp(-raw / 5));

function mouthful(e: LedgerEvent): Mouthful | null {
  const ms = Date.parse(e.at);
  if (e.kind === "commit") return { ms, kind: "commit", claude: !!e.claude, source: e.repo.split("/")[1] ?? e.repo, value: 3 };
  if (e.kind === "sync" && e.changed > 0) return { ms, kind: "sync", claude: false, source: e.source, value: Math.min(e.changed, 12) * 0.4 };
  if (e.kind === "tick" && e.delta > 0) return { ms, kind: "tick", claude: false, source: e.source, value: e.delta };
  if (e.kind === "deploy" && /prod/i.test(e.env) && e.state === "success") return { ms, kind: "deploy", claude: false, source: e.repo.split("/")[1] ?? e.repo, value: 0 };
  return null;
}

/** Gathers mouthfuls into meals. Within a meal, repeated syncs of one folder count once (the largest). */
export function meals(items: Mouthful[]): (Bite & { first: number; last: number })[] {
  const sorted = [...items].sort((a, b) => a.ms - b.ms);
  const groups: Mouthful[][] = [];
  for (const m of sorted) {
    const last = groups[groups.length - 1];
    if (last && m.ms - last[last.length - 1].ms <= MEAL_GAP) last.push(m); else groups.push([m]);
  }
  return groups.map((g) => {
    const syncs = new Map<string, number>();
    let own = 0;
    let withClaude = 0;
    for (const m of g) if (m.kind === "sync") syncs.set(m.source, Math.max(syncs.get(m.source) ?? 0, m.value)); else if (m.claude) withClaude += m.value; else own += m.value;
    for (const v of syncs.values()) own += v;
    // what Claude's commits add on top of the owner's own share of the meal counts for CLAUDE_SHARE of it
    const value = mealValue(own) + CLAUDE_SHARE * (mealValue(own + withClaude) - mealValue(own));
    const count = (kind: Mouthful["kind"], claude?: boolean) => g.filter((m) => m.kind === kind && (claude === undefined || m.claude === claude)).length;
    const mine = count("commit", false); const helped = count("commit", true); const synced = count("sync"); const ticked = g.filter((m) => m.kind === "tick").reduce((n, m) => n + m.value, 0); const deployed = count("deploy");
    const parts = [mine && `${mine} commit${mine > 1 ? "s" : ""}`, helped && `${helped} with Claude`, synced && `${synced} sync${synced > 1 ? "s" : ""}`, ticked && `✓${ticked}`, deployed && `${deployed} deploy${deployed > 1 ? "s" : ""}`].filter(Boolean);
    const repos = [...new Set(g.map((m) => m.source))].slice(0, 2).join(", ");
    const first = g[0].ms; const last = g[g.length - 1].ms;
    return { at: new Date(last).toISOString(), kind: "meal" as const, label: `${repos} · ${parts.join(" · ")}`, value, first, last };
  });
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export async function creatureView(options: { journal?: JournalDay[]; notes?: Notes; now?: number } = {}): Promise<CreatureView> {
  const now = options.now ?? Date.now();
  const [events, notes] = await Promise.all([readEvents(now - 60 * DAY_MS), options.notes ?? readNotes().catch((): Notes => ({}))]);
  const mouthfuls = events.map(mouthful).filter((m): m is Mouthful => !!m);
  const work = meals(mouthfuls);
  const today = workDay(now);
  const restDays = new Set(Object.entries(notes).filter(([, n]) => n.rest).map(([d]) => d));

  // per work day: when it started and ended (any mouthful, Claude's too) and how much was eaten (meals)
  const byDay = new Map<string, { first: number; last: number; load: number }>();
  const hours = Array<number>(24).fill(0);
  const learnFrom = workDay(now - LEARN_DAYS * DAY_MS);
  for (const m of mouthfuls) {
    const d = workDay(m.ms); const sh = shifted(m.ms);
    const day = byDay.get(d) ?? { first: sh, last: sh, load: 0 };
    day.first = Math.min(day.first, sh); day.last = Math.max(day.last, sh);
    byDay.set(d, day);
  }
  for (const meal of work) {
    const d = workDay(meal.last);
    const day = byDay.get(d);
    if (day) day.load += meal.value;
    if (d >= learnFrom) hours[Math.floor((shifted(meal.last) + 5) % 24)] += meal.value;
  }
  const past = [...byDay.entries()].filter(([d]) => d !== today && d >= learnFrom && !restDays.has(d)).map(([, v]) => v);
  const learning = past.length < 5;
  const start = past.length ? quantile(past.map((d) => d.first), 0.25) : null;
  const end = past.length ? quantile(past.map((d) => d.last), 0.75) : null;
  const medianLoad = median(past.map((d) => d.load));
  const total = hours.reduce((a, b) => a + b, 0) || 1;

  // awake: inside the usual hours (with half an hour either side); before she has learned them, 09:00 to 23:00 London
  const wakeFrom = !learning && start !== null ? start - 0.5 : 4;
  const wakeTo = !learning && end !== null ? end + 0.5 : 18;
  const awake = (ms: number) => { const sh = shifted(ms); return sh >= wakeFrom && sh <= wakeTo; };
  /** Hours she was awake between two instants, in quarter hours: digestion only runs then. */
  const awakeHours = (from: number, to: number) => { let h = 0; for (let t = from; t < to; t += HOUR / 4) if (awake(t)) h += 0.25; return h; };

  // treats: stopping near the usual end (given that evening, once nothing more came), declared rest days, breakfast
  const treats: Bite[] = [];
  if (!learning && end !== null) for (const [d, v] of byDay) {
    const at = instant(d, end + 0.75);
    if (d >= learnFrom && !restDays.has(d) && v.last <= end + 0.75 && at <= now) treats.push({ at: new Date(at).toISOString(), kind: "rest", label: `按时收工 · ${d.slice(5)} ${clockOf(v.last)}`, value: 4 });
  }
  for (const d of restDays) if (d >= learnFrom && d <= today) treats.push({ at: new Date(instant(d, 7)).toISOString(), kind: "rest", label: `休息日 · ${d.slice(5)}`, value: 8 });
  for (const [d, n] of Object.entries(notes)) {
    if (d < learnFrom || d > today || (!n.mood && !n.energy && typeof n.sleep !== "number")) continue;
    const at = Date.parse(n.at);
    const when = Number.isFinite(at) && workDay(at) === d ? at : instant(d, start ?? 4);
    treats.push({ at: new Date(when).toISOString(), kind: "breakfast", label: `早饭 · ${d.slice(5)} 打卡`, value: 2 });
  }
  const food: Bite[] = [...work.map(({ first: _f, last: _l, ...b }) => b), ...treats].filter((b) => Date.parse(b.at) <= now).sort((a, b) => a.at.localeCompare(b.at));

  const t = byDay.get(today);
  const restToday = restDays.has(today);
  const lastMs = mouthfuls.reduce((m, x) => Math.max(m, x.ms), 0);
  const lastFood = food[food.length - 1];
  // only what is less than three days old can still matter; digestion halves it every six awake hours
  const recent = food.filter((b) => now - Date.parse(b.at) < 3 * DAY_MS);
  const satiety = Math.min(1, recent.reduce((sum, b) => sum + b.value * 0.5 ** (awakeHours(Date.parse(b.at), now) / (HALF_LIFE / HOUR)), 0) / Math.max(10, medianLoad * 0.6));

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
