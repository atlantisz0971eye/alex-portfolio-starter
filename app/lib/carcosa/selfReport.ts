import { get, put } from "@vercel/blob";
import { geminiJson } from "../geminiText";
import { readPieces, readSelf, type Piece } from "../selfStore";
import { scopeRoot } from "../workspaceScope";
import type { JournalDay } from "./creature";
import { workDay } from "./ledger";

/**
 * Gemini's report on the owner's state, written from Self (the person's own writing), only when new writing has been
 * added. The raw writing never leaves Gemini: what is kept, and later handed to DeepSeek, is this distilled report with
 * no quotes and people named by role. Writing a diary entry is itself a signal (it is usually done when feeling
 * strongly), so each new batch is also scored for intensity and direction, day by day.
 */
export type SelfReport = {
  generatedAt: string;
  range: [string, string];
  /** Which pieces it has seen, so the next import knows what is new. */
  seen: string[];
  baseline: string;
  recent: string;
  helps: string[];
  drains: string[];
  gentle: string[];
  risk: "none" | "watch" | "urgent";
  confidence: "low" | "medium" | "high";
  journal: JournalDay[];
};

const path = async () => `${await scopeRoot()}carcosa/self-report.json`;
export async function readSelfReport(): Promise<SelfReport | null> {
  try {
    const result = await get(await path(), { access: "private", useCache: false });
    if (result && result.statusCode === 200) return JSON.parse(await new Response(result.stream).text()) as SelfReport;
  } catch { /* not written yet */ }
  return null;
}

const SYSTEM = `You read a person's own private writing (diary entries, poems, notes) and write a short, careful report on their emotional state for a companion app that helps them look after themselves. Another model will read only your report, never the writing.
Rules:
- Write every text field in Simplified Chinese, plainly, as observations about patterns, not diagnoses. Never name a mental illness.
- No quotations longer than four words. Never name people: use roles such as 一位朋友, 家人, 导师, 前任.
- Do not repeat sensitive specifics (addresses, health records, money). Describe feelings and patterns.
- "baseline": who this person usually is emotionally across the years, 2-3 sentences.
- "recent": what the newest writing shows compared with the baseline, 2-4 sentences.
- "helps" / "drains": up to 4 short items each, things that in their own words seem to steady or wear them.
- "gentle": up to 4 topics to approach carefully.
- "risk": "urgent" only if the newest writing expresses wanting to die, self-harm or not being safe; "watch" for sustained hopelessness or exhaustion; otherwise "none".
- "confidence": how much the writing supports the report.
- "journal": for each date in NEW that has writing, {"day": "YYYY-MM-DD", "intensity": 1-5 (how strongly felt), "valence": -2..2 (heavy to light)}.
Return only JSON: {"baseline":"","recent":"","helps":[],"drains":[],"gentle":[],"risk":"none","confidence":"medium","journal":[]}.`;

const clean = (v: unknown, max: number) => (typeof v === "string" ? [...v.replace(/\s+/g, " ").trim()].slice(0, max).join("") : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => clean(x, max)).filter(Boolean).slice(0, n) : []);
/** Text up to a budget, newest first, so the most recent writing is never the part cut off. */
const pack = (pieces: Piece[], budget: number) => { const out: { day: string; text: string }[] = []; let used = 0; for (const p of [...pieces].sort((a, b) => b.at.localeCompare(a.at))) { const text = p.text.slice(0, 4000); if (used + text.length > budget) break; used += text.length; out.push({ day: workDay(Date.parse(p.at)), text }); } return out; };

/** Writes a new report when Self holds writing the last report has not seen; otherwise does nothing. */
export async function refreshSelfReport(): Promise<SelfReport | null> {
  const [pieces, previous, graph] = await Promise.all([readPieces(), readSelfReport(), readSelf()]);
  const seen = new Set(previous?.seen ?? []);
  const fresh = pieces.filter((p) => !seen.has(p.id));
  if (!fresh.length) return previous;
  const recentFrom = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const context = pieces.filter((p) => seen.has(p.id) && p.at >= recentFrom);
  const feelings = graph.nodes.filter((n) => n.kind === "feeling").slice(0, 20).map((n) => ({ label: n.label, pieces: n.count, first: n.first.slice(0, 7), last: n.last.slice(0, 7) }));
  const newest = pack(fresh, 60_000);
  const payload = {
    PORTRAIT: graph.portrait?.summary ?? "",
    FEELINGS_OVER_YEARS: feelings,
    PREVIOUS_REPORT: previous ? { baseline: previous.baseline, recent: previous.recent } : null,
    NEW: newest,
    EARLIER_RECENT: pack(context, 20_000),
  };
  const parsed = await geminiJson(SYSTEM, JSON.stringify(payload), 6_000, 120_000);
  const risk = parsed.risk === "urgent" || parsed.risk === "watch" ? parsed.risk : "none";
  const confidence = parsed.confidence === "low" || parsed.confidence === "high" ? parsed.confidence : "medium";
  // only what Gemini actually read is scored (the first report sees just the newest part of years of writing)
  const days = new Set(newest.map((p) => p.day));
  const journal: JournalDay[] = (Array.isArray(parsed.journal) ? parsed.journal : []).map((raw) => raw as Record<string, unknown>)
    .filter((j) => typeof j.day === "string" && days.has(j.day))
    .map((j) => ({ day: j.day as string, intensity: Math.min(5, Math.max(1, Math.round(Number(j.intensity) || 3))), valence: Math.min(2, Math.max(-2, Math.round(Number(j.valence) || 0))) }));
  // dates Gemini skipped still count as days written on
  for (const d of days) if (!journal.some((j) => j.day === d)) journal.push({ day: d, intensity: 3, valence: 0 });
  const merged = [...(previous?.journal ?? []).filter((j) => !days.has(j.day)), ...journal].sort((a, b) => a.day.localeCompare(b.day)).slice(-400);
  const dates = pieces.map((p) => p.at).sort();
  const report: SelfReport = {
    generatedAt: new Date().toISOString(), range: [dates[0]?.slice(0, 10) ?? "", dates[dates.length - 1]?.slice(0, 10) ?? ""],
    seen: pieces.map((p) => p.id),
    baseline: clean(parsed.baseline, 300), recent: clean(parsed.recent, 400),
    helps: list(parsed.helps, 4, 40), drains: list(parsed.drains, 4, 40), gentle: list(parsed.gentle, 4, 40),
    risk, confidence, journal: merged,
  };
  await put(await path(), JSON.stringify(report), { access: "private", allowOverwrite: true, contentType: "application/json" });
  return report;
}

/** What other code may see of the report: everything except the list of piece ids. */
export const publicReport = (r: SelfReport | null) => (r ? { generatedAt: r.generatedAt, range: r.range, baseline: r.baseline, recent: r.recent, helps: r.helps, drains: r.drains, gentle: r.gentle, risk: r.risk, confidence: r.confidence, journal: r.journal.slice(-60) } : null);

// ---- failures: remembered so the page can say the report did not come, instead of waiting for it forever ----------

export type ReportError = { at: string; code: string };
const errorPath = async () => `${await scopeRoot()}carcosa/self-report-error.json`;
export async function readReportError(): Promise<ReportError | null> {
  try {
    const result = await get(await errorPath(), { access: "private", useCache: false });
    if (result && result.statusCode === 200) return JSON.parse(await new Response(result.stream).text()) as ReportError;
  } catch { /* none */ }
  return null;
}

/** Writes the report and remembers a failure (its code only, never any text). */
export async function refreshSelfReportNoting() {
  try { return await refreshSelfReport(); }
  catch (error) {
    const code = error instanceof Error && "code" in error && typeof (error as { code: unknown }).code === "string" ? (error as { code: string }).code : "report_failed";
    await put(await errorPath(), JSON.stringify({ at: new Date().toISOString(), code }), { access: "private", allowOverwrite: true, contentType: "application/json" }).catch(() => undefined);
    return null;
  }
}
