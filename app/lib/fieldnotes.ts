import { list } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { readJsonSafe, updateJson } from "./blobJson";
import { ledgerView, londonTime, workDay, type DayRow } from "./carcosa/ledger";
import { FEELINGS, KIND_LABEL, KINDS, MINE, MINE_LABEL, QUESTIONS, type Capture, type DayContext, type Fetched, type FieldNote, type FieldView, type Gap, type Kind, type Labelled, type Mine } from "./fieldnoteShape";
import { lagText, parsePasted, PLATFORM_LABEL, platformOf, postedFromId } from "./linkParse";
import { currentUser, scopeRoot } from "./workspaceScope";

/**
 * Field notes, kept one file a month in the person's own folder. The store only ever adds: a saved note's own words
 * and scores cannot be changed through it. What may be added later is an addendum, a fetched snapshot of the link, a
 * label, or a withdrawn mark; none of them touches the original.
 */
export class FieldnoteError extends Error {}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RAW = 20_000;
const MAX_ANSWER = 6_000;
const MAX_PASTED = 4_000;
const MAX_ADDENDA = 30;
const BACKDATE_DAYS = 60;

const monthPath = async (month: string) => `${await scopeRoot()}fieldnotes/${month}.json`;
const monthOfId = (id: string) => (/^\d{4}-\d{2}_[0-9a-f-]{36}$/.test(id) ? id.slice(0, 7) : null);
const cut = (value: unknown, max: number) => (typeof value === "string" ? [...value.replace(/\r\n/g, "\n").trim()].slice(0, max).join("") : "");
const score = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10 ? value : undefined);

async function months(): Promise<string[]> {
  const prefix = `${await scopeRoot()}fieldnotes/`;
  const found: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    for (const blob of page.blobs) { const month = blob.pathname.slice(prefix.length).match(/^(\d{4}-\d{2})\.json$/)?.[1]; if (month) found.push(month); }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found.sort();
}

/** Every note, oldest first. */
export async function readNotes(): Promise<FieldNote[]> {
  const files = await Promise.all((await months()).map(async (month) => readJsonSafe<FieldNote[]>(await monthPath(month), [])));
  return files.flat().sort((a, b) => a.at.localeCompare(b.at));
}

export type NoteInput = { kind?: unknown; raw?: unknown; satisfaction?: unknown; intensity?: unknown; mine?: unknown; feelings?: unknown; via?: unknown; answers?: unknown; pasted?: unknown; about?: unknown; from?: unknown; to?: unknown };

/** Saves a note. Unknown fields are dropped; a note with nothing in it is refused. */
export async function addNote(input: NoteInput): Promise<FieldNote> {
  const kind = KINDS.find((k) => k === input.kind);
  if (!kind) throw new FieldnoteError("unknown kind");
  const now = Date.now();
  const at = new Date(now).toISOString();
  const day = workDay(now);
  const note: FieldNote = { id: `${at.slice(0, 7)}_${randomUUID()}`, kind, at, day, raw: cut(input.raw, MAX_RAW) };

  if (kind !== "trigger" && typeof input.about === "string" && DAY.test(input.about) && input.about < day) {
    if (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${input.about}T00:00:00Z`) > BACKDATE_DAYS * 86_400_000) throw new FieldnoteError("too far back");
    if (kind !== "reflection") { note.about = input.about; note.late = true; }
  }
  if (kind === "micro" || kind === "session") {
    note.satisfaction = score(input.satisfaction);
    note.mine = MINE.find((m) => m === input.mine) as Mine | undefined;
  }
  if (kind === "trigger") {
    note.intensity = score(input.intensity);
    if (Array.isArray(input.feelings)) {
      const feelings = [...new Set(input.feelings.map((f) => cut(f, 20)).filter(Boolean))].slice(0, 12);
      if (feelings.length) note.feelings = feelings;
    }
    const via = cut(input.via, 40);
    if (via) note.via = via;
    const pasted = cut(input.pasted, MAX_PASTED);
    if (pasted) {
      const parsed = parsePasted(pasted, now);
      note.capture = { pasted, ...parsed, ...(parsed.postedAt ? { postedFrom: "id" as const } : {}) };
    }
  }
  if (kind === "reflection") {
    if (typeof input.from === "string" && DAY.test(input.from)) note.from = input.from;
    if (typeof input.to === "string" && DAY.test(input.to)) note.to = input.to;
  }
  if (input.answers && typeof input.answers === "object") {
    const allowed = new Set(QUESTIONS[kind].map((q) => q.key));
    const answers = Object.fromEntries(Object.entries(input.answers as Record<string, unknown>).filter(([key]) => allowed.has(key)).map(([key, value]) => [key, cut(value, MAX_ANSWER)]).filter(([, value]) => value));
    if (Object.keys(answers).length) note.answers = answers;
  }
  const empty = !note.raw && !note.answers && !note.capture && note.satisfaction === undefined && note.intensity === undefined && !note.mine && !note.feelings;
  if (empty) throw new FieldnoteError("empty");

  if (kind === "micro" || kind === "session") note.context = (await dayContext(note.about ?? day)) ?? undefined;
  // undefined keys do not survive JSON, so the stored note has only what was given
  await updateJson<FieldNote[]>(await monthPath(at.slice(0, 7)), [], (notes) => [...notes, note]);
  return note;
}

async function change(id: string, fn: (note: FieldNote) => FieldNote | undefined): Promise<FieldNote> {
  const month = monthOfId(id);
  if (!month) throw new FieldnoteError("not found");
  let result: FieldNote | undefined;
  await updateJson<FieldNote[]>(await monthPath(month), [], (notes) => {
    const index = notes.findIndex((n) => n.id === id);
    if (index < 0) return undefined;
    const next = fn(notes[index]);
    result = next ?? notes[index];
    if (!next) return undefined;
    notes[index] = next;
    return notes;
  });
  if (!result) throw new FieldnoteError("not found");
  return result;
}

/** A dated second thought under a note. */
export const addAddendum = (id: string, text: unknown) => {
  const body = cut(text, MAX_ANSWER);
  if (!body) throw new FieldnoteError("empty");
  return change(id, (note) => {
    if ((note.addenda?.length ?? 0) >= MAX_ADDENDA) throw new FieldnoteError("too many addenda");
    return { ...note, addenda: [...(note.addenda ?? []), { at: new Date().toISOString(), text: body }] };
  });
};

/** Sets a note aside or brings it back. The note itself stays as it was. */
export const setWithdrawn = (id: string, on: boolean) => change(id, (note) => {
  if (!!note.withdrawn === on) return undefined;
  const { withdrawn: _was, ...rest } = note;
  return on ? { ...rest, withdrawn: new Date().toISOString() } : rest;
});

export async function findNote(id: string): Promise<FieldNote | null> {
  const month = monthOfId(id);
  if (!month) return null;
  return (await readJsonSafe<FieldNote[]>(await monthPath(month), [])).find((n) => n.id === id) ?? null;
}

/**
 * Stores what the link's page said and how it was labelled. A snapshot that read the page is final: it is the record
 * of what was there when the person saw it, so a later attempt can only fill in one that failed.
 */
export const attachCapture = (id: string, fetched: Fetched, label: Labelled | null) => change(id, (note) => {
  if (!note.capture || note.capture.fetched?.status === "ok") return undefined;
  const capture: Capture = { ...note.capture, fetched, ...(label ? { label } : {}) };
  // a short link hides the post's id until it is followed; failing that, the page's own date is the next best, and is marked as such
  const fromId = !capture.postedAt && fetched.finalUrl ? postedFromId(fetched.finalUrl, platformOf(fetched.finalUrl)) : null;
  if (fromId) { capture.postedAt = fromId; capture.postedFrom = "id"; }
  else if (!capture.postedAt && fetched.publishedAt) { capture.postedAt = fetched.publishedAt; capture.postedFrom = "page"; }
  return { ...note, capture };
});

// ---- what the ledger knows about a day ------------------------------------------------------------------------------

function contextOf(day: string, rows: DayRow[]): DayContext | null {
  const mine = rows.filter((r) => r.day === day && (r.commits > 0 || r.syncs > 0));
  if (!mine.length) return null;
  const times = mine.flatMap((r) => [...r.messages.map((m) => m.at), r.lastAt]).filter(Boolean).sort();
  return {
    day,
    commits: mine.reduce((n, r) => n + r.commits, 0),
    withClaude: mine.reduce((n, r) => n + r.withClaude, 0),
    files: mine.reduce((n, r) => n + r.changed, 0),
    where: [...new Set(mine.map((r) => r.label))],
    ...(times.length ? { firstAt: londonTime(Date.parse(times[0])), lastAt: londonTime(Date.parse(times[times.length - 1])) } : {}),
  };
}

/** The ledger is the owner's, so only the owner's notes carry it. A ledger that cannot be read leaves the note without. */
async function ledgerRows(days: number): Promise<DayRow[]> {
  if ((await currentUser()).role !== "owner") return [];
  try { return (await ledgerView(days)).days; } catch { return []; }
}

async function dayContext(day: string): Promise<DayContext | null> {
  const age = Math.ceil((Date.now() - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  return contextOf(day, await ledgerRows(Math.max(2, age + 1)));
}

const GAP_DAYS = 14;

export async function fieldView(): Promise<FieldView> {
  const today = workDay(Date.now());
  const [notes, rows] = await Promise.all([readNotes(), ledgerRows(GAP_DAYS + 1)]);
  const live = notes.filter((n) => !n.withdrawn);
  const covered = new Set(live.filter((n) => n.kind === "micro" || n.kind === "session").map((n) => n.about ?? n.day));
  const gaps: Gap[] = [...new Set(rows.map((r) => r.day))].filter((day) => day < today && !covered.has(day)).sort().reverse()
    .map((day) => contextOf(day, rows)).filter((c): c is DayContext => !!c && c.commits > 0).slice(0, GAP_DAYS)
    .map((c) => ({ day: c.day, commits: c.commits, withClaude: c.withClaude, where: c.where }));
  const counts = Object.fromEntries(KINDS.map((k) => [k, live.filter((n) => n.kind === k).length])) as Record<Kind, number>;
  return { today, context: contextOf(today, rows), gaps, counts, notes: [...notes].reverse().slice(0, 400) };
}

// ---- export -----------------------------------------------------------------------------------------------------------

const quote = (text: string) => text.split("\n").map((line) => `> ${line}`).join("\n");

function noteMarkdown(note: FieldNote): string {
  const lines: string[] = [`## ${KIND_LABEL[note.kind]} · ${note.at}`, "", `- id：\`${note.id}\``, `- 工作日：${note.day}${note.late ? `（补记，关于 ${note.about}）` : ""}`];
  if (note.withdrawn) lines.push(`- 已撤回：${note.withdrawn}`);
  if (note.from || note.to) lines.push(`- 周期：${note.from ?? "?"} 至 ${note.to ?? "?"}`);
  if (note.satisfaction !== undefined) lines.push(`- 满足感：${note.satisfaction}/10`);
  if (note.mine) lines.push(`- 这像不像我做的：${MINE_LABEL[note.mine]}`);
  if (note.intensity !== undefined) lines.push(`- 强度：${note.intensity}/10`);
  if (note.feelings?.length) lines.push(`- 情绪关键词：${note.feelings.join(" / ")}`);
  if (note.via) lines.push(`- 以什么形式看到：${note.via}`);
  lines.push("", "### 原话", "", note.raw ? quote(note.raw) : "_未记录_");
  if (note.answers) {
    lines.push("", "### 模板回答（本人填写）");
    for (const q of QUESTIONS[note.kind]) if (note.answers[q.key]) lines.push("", `**${q.label}**`, "", quote(note.answers[q.key]));
  }
  if (note.addenda?.length) {
    lines.push("", "### 后记（本人事后补充）");
    for (const a of note.addenda) lines.push("", `_${a.at}_`, "", quote(a.text));
  }
  const c = note.capture;
  if (c) {
    lines.push("", "### 触发物", "", "粘贴的原文：", "", quote(c.pasted), "", "程序解析（非本人填写）：", "");
    if (c.url) lines.push(`- 链接：${c.url}`);
    if (c.platform) lines.push(`- 平台：${PLATFORM_LABEL[c.platform]}`);
    if (c.shared.title) lines.push(`- 分享文本里的标题：${c.shared.title}`);
    if (c.shared.author) lines.push(`- 分享文本里的作者：${c.shared.author}`);
    if (c.postedAt) lines.push(`- 发布时间：${c.postedAt}（${c.postedFrom === "id" ? "由帖子编号推算" : "页面标注"}）${lagText(c.postedAt, note.at) ? `，${lagText(c.postedAt, note.at)}` : ""}`);
    if (c.fetched) {
      const f = c.fetched;
      lines.push(`- 页面快照：${f.at} · ${f.status === "ok" ? "已取到" : f.status === "blocked" ? "页面没有可读内容" : "未能访问"}`);
      if (f.finalUrl && f.finalUrl !== c.url) lines.push(`- 实际地址：${f.finalUrl}`);
      if (f.title) lines.push(`- 页面标题：${f.title}`);
      if (f.author) lines.push(`- 页面作者：${f.author}`);
      if (f.text) lines.push("", "页面文字（抓取时的原样）：", "", quote(f.text));
    }
    if (c.label) lines.push("", `模型归类（${c.label.model}，${c.label.at}，只依据页面文字，未见本人原话）：`, "", `- 是什么：${c.label.what}`, `- 类别：${c.label.kind}`, ...(c.label.who ? [`- 谁发的：${c.label.who}`] : []));
  }
  if (note.context) {
    const x = note.context;
    lines.push("", "### 账本（由代码从提交记录生成，非本人填写）", "", `- ${x.day}：${x.commits} 个提交，其中 ${x.withClaude} 个与 Claude 合写；同步改动 ${x.files} 个文件`, `- 位置：${x.where.join("、")}`, ...(x.firstAt ? [`- 活动时间（伦敦）：${x.firstAt}–${x.lastAt}`] : []));
  }
  return lines.join("\n");
}

/** Everything as one Markdown document, oldest first, with each part marked by who or what produced it. */
export async function exportMarkdown(withdrawn = false): Promise<string> {
  const notes = (await readNotes()).filter((n) => withdrawn || !n.withdrawn);
  const head = ["# Fieldnotes 导出", "", `- 导出时间：${new Date().toISOString()}`, `- 条数：${notes.length}${withdrawn ? "（含已撤回）" : "（不含已撤回）"}`, "- 时间均为 UTC；“工作日”按伦敦时间 05:00 起算。", "- “原话”“模板回答”“后记”是本人所写，保存后未被改动；其余部分标明了来源。", `- 预设情绪关键词：${FEELINGS.join(" / ")}（之外的为本人补充）`];
  return [head.join("\n"), ...notes.map(noteMarkdown)].join("\n\n---\n\n") + "\n";
}
