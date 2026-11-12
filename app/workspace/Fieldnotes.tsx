"use client";

import { Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FEELINGS, KIND_LABEL, KINDS, MINE, MINE_LABEL, QUESTIONS, SEEN_VIA, type Capture, type DayContext, type FieldNote, type FieldView, type Kind, type Mine } from "../lib/fieldnoteShape";
import { lagText, parsePasted, PLATFORM_LABEL } from "../lib/linkParse";
import { parseResponse } from "./api";
import { CarcosaCheckin } from "./Carcosa";
import type { FieldSub } from "./Shell";

/**
 * Fieldnotes: research notes on working with AI. Four kinds, written by hand and kept as written: a trigger record (a
 * link plus the first reaction, quick enough for a phone), a thirty-second note at the end of a work day, the full
 * record of a session, and a reflection every few weeks. Each kind is a section with its own address, so the one in
 * use can be bookmarked. Earlier notes are never on a writing section, so a new one is not written to match the last;
 * looking back has a section of its own ("回看"), and belongs to the reflection.
 */
type Draft = { raw: string; pasted: string; satisfaction?: number; intensity?: number; mine?: Mine; feelings: string[]; extra: string; via: string; answers: Record<string, string>; about: string; from: string; to: string };
const EMPTY: Draft = { raw: "", pasted: "", feelings: [], extra: "", via: "", answers: {}, about: "", from: "", to: "" };
const DRAFT_KEY = "ws-fieldnotes-draft";
const MODES: { id: Kind; hint: string }[] = [
  { id: "trigger", hint: "刷到新发布或别人的作品时，当下记。贴链接，写第一反应，1–3 分钟。只贴链接不写感受也可以。" },
  { id: "micro", hint: "每个工作日收工时，30 秒：一个分数，一句原话。" },
  { id: "session", hint: "值得展开的一次工作：换了工具或分工、情绪强烈、分数异常时写，10–15 分钟。不用每项都填。" },
  { id: "reflection", hint: "每 2–4 周一次，对照这段时间的记录回看。" },
];

const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const whenYear = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
/** A post may be years old; a year is shown once it is not this one. */
const posted = (iso: string) => (new Date(iso).getFullYear() === new Date().getFullYear() ? when : whenYear).format(new Date(iso));
const post = async <T,>(body: Record<string, unknown>) => parseResponse<T>(await fetch("/api/workspace/fieldnotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const daysBefore = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const mean = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null);

function Scale({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  return <div className="fn-scale" role="group" aria-label={label}>
    <span>{label}</span>
    <div>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <button key={n} type="button" aria-pressed={value === n} className={value === n ? "is-on" : ""} onClick={() => onChange(value === n ? undefined : n)}>{n}</button>)}</div>
  </div>;
}

function Chips({ label, options, value, onToggle }: { label: string; options: readonly string[]; value: string[]; onToggle: (option: string) => void }) {
  return <div className="fn-chips" role="group" aria-label={label}>
    <span>{label}</span>
    <div>{options.map((option) => <button key={option} type="button" aria-pressed={value.includes(option)} className={value.includes(option) ? "is-on" : ""} onClick={() => onToggle(option)}>{option}</button>)}</div>
  </div>;
}

function Questions({ kind, answers, onChange }: { kind: Kind; answers: Record<string, string>; onChange: (key: string, value: string) => void }) {
  const groups = [...new Set(QUESTIONS[kind].map((q) => q.group))];
  return <div className="fn-questions">{groups.map((group) => <fieldset key={group}>
    <legend>{group}</legend>
    {QUESTIONS[kind].filter((q) => q.group === group).map((q) => <label key={q.key}>
      <span>{q.label}</span>
      <textarea rows={2} value={answers[q.key] ?? ""} onChange={(e) => onChange(q.key, e.target.value)} />
    </label>)}
  </fieldset>)}</div>;
}

const contextLine = (c: DayContext) => `${c.commits} 个提交${c.commits ? `（${c.withClaude} 个与 Claude 合写）` : ""}${c.files ? ` · 同步改动 ${c.files} 个文件` : ""} · ${c.where.join("、")}${c.firstAt ? ` · ${c.firstAt}–${c.lastAt}` : ""}`;

/** What the program made of a link. Everything here is marked as not the person's own words. */
function CaptureBlock({ capture, seenAt, reading }: { capture: Capture; seenAt: string; reading?: boolean }) {
  const f = capture.fetched;
  const title = f?.title ?? capture.shared.title;
  const author = capture.shared.author ?? f?.author;
  return <div className="fn-capture">
    <p className="fn-capture__head">
      {capture.platform ? PLATFORM_LABEL[capture.platform] : "没有找到链接"}
      {author ? ` · ${author}` : ""}
      {capture.postedAt ? ` · 发于 ${posted(capture.postedAt)}${capture.postedFrom === "id" ? "（由编号推算）" : "（页面标注）"}${lagText(capture.postedAt, seenAt) ? ` · ${lagText(capture.postedAt, seenAt)}` : ""}` : ""}
    </p>
    {title && <p className="fn-capture__title">{title}</p>}
    {capture.label && <p className="fn-capture__label">{capture.label.kind} · {capture.label.what} <em>模型归类</em></p>}
    {f?.text && <details><summary>页面文字（{when.format(new Date(f.at))} 抓取的原样）</summary><p>{f.text}</p></details>}
    {reading ? <p className="carcosa-muted"><Loader2 className="ws-spin" size={12} /> 正在读取链接…</p>
      : f && f.status !== "ok" ? <p className="carcosa-muted">{f.status === "blocked" ? "这个平台不让服务器读页面，只留下了你粘贴的内容。" : "链接没能打开，只留下了你粘贴的内容。"}想留证据可以在后记里补一句它说了什么。</p> : null}
    {capture.url && <a href={capture.url} target="_blank" rel="noreferrer noopener">{capture.url}</a>}
  </div>;
}

function NoteCard({ note, reading, onChanged, onError }: { note: FieldNote; reading?: boolean; onChanged: (note: FieldNote) => void; onError: (message: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { onChanged((await post<{ note: FieldNote }>({ ...body, id: note.id })).note); return true; }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Could not save."); return false; }
    finally { setBusy(false); }
  };
  const facts = [
    note.satisfaction !== undefined ? `满足感 ${note.satisfaction}/10` : "",
    note.mine ? MINE_LABEL[note.mine] : "",
    note.intensity !== undefined ? `强度 ${note.intensity}/10` : "",
    note.feelings?.length ? note.feelings.join(" / ") : "",
    note.via ?? "",
  ].filter(Boolean);
  return <article className="fn-note" data-kind={note.kind} data-withdrawn={note.withdrawn ? "" : undefined}>
    <header>
      <b>{KIND_LABEL[note.kind]}</b> <time dateTime={note.at}>{when.format(new Date(note.at))}</time>
      {note.late && <span className="fn-tag">补记 · 关于 {note.about?.slice(5)}</span>}
      {note.from && <span className="fn-tag">{note.from.slice(5)} 至 {note.to?.slice(5)}</span>}
      {note.withdrawn && <span className="fn-tag">已撤回</span>}
    </header>
    {note.raw ? <p className="fn-raw">{note.raw}</p> : note.kind === "trigger" && <p className="carcosa-muted">只留了链接，没有写感受。</p>}
    {facts.length > 0 && <p className="fn-facts">{facts.join(" · ")}</p>}
    {note.answers && <dl className="fn-answers">{QUESTIONS[note.kind].filter((q) => note.answers?.[q.key]).map((q) => <div key={q.key}><dt>{q.label}</dt><dd>{note.answers?.[q.key]}</dd></div>)}</dl>}
    {note.capture && <CaptureBlock capture={note.capture} seenAt={note.at} reading={reading} />}
    {note.context && <p className="carcosa-muted">账本（代码生成）：{contextLine(note.context)}</p>}
    {note.addenda?.map((a) => <p key={a.at} className="fn-addendum"><time dateTime={a.at}>后记 {when.format(new Date(a.at))}</time>{a.text}</p>)}
    {adding ? <div className="fn-addendum-form">
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="事后想到的。原文不会被改动，这段会带着今天的日期附在下面。" />
      <button type="button" className="ws-text-button" disabled={busy || !text.trim()} onClick={() => void run({ action: "addendum", text }).then((ok) => { if (ok) { setText(""); setAdding(false); } })}>{busy ? "…" : "add"}</button>
      <button type="button" className="ws-text-button" onClick={() => setAdding(false)}>cancel</button>
    </div> : <p className="fn-actions">
      <button type="button" className="ws-text-button" onClick={() => setAdding(true)}>加后记</button>
      <button type="button" className="ws-text-button" disabled={busy} onClick={() => void run({ action: "withdraw", on: !note.withdrawn })}>{note.withdrawn ? "恢复" : "撤回"}</button>
    </p>}
  </article>;
}

/** What the period held, for a reflection: counts and averages only, worked out here from the notes themselves. */
function PeriodSummary({ notes, gaps, from, to }: { notes: FieldNote[]; gaps: FieldView["gaps"]; from: string; to: string }) {
  const triggers = notes.filter((n) => n.kind === "trigger");
  const days = notes.filter((n) => n.kind === "micro" || n.kind === "session");
  const feelings = new Map<string, number>();
  for (const n of triggers) for (const f of n.feelings ?? []) feelings.set(f, (feelings.get(f) ?? 0) + 1);
  const top = [...feelings].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f}×${n}`).join("、");
  const silent = triggers.filter((n) => !n.raw && n.intensity === undefined && !n.feelings).length;
  const satisfaction = mean(days.flatMap((n) => (n.satisfaction !== undefined ? [n.satisfaction] : [])));
  const intensity = mean(triggers.flatMap((n) => (n.intensity !== undefined ? [n.intensity] : [])));
  const missed = gaps.filter((g) => g.day >= from && g.day <= to);
  return <ul className="fn-summary">
    <li>收工与单次记录 {days.length} 条{satisfaction !== null ? `，满足感平均 ${satisfaction}` : ""}{days.filter((n) => n.late).length ? `，其中 ${days.filter((n) => n.late).length} 条是补记` : ""}</li>
    <li>触发记录 {triggers.length} 条{intensity !== null ? `，强度平均 ${intensity}` : ""}{top ? `；${top}` : ""}</li>
    <li>只贴了链接、没写感受的 {silent} 条</li>
    {missed.length > 0 && <li>有工作、没有记录的日子 {missed.length} 天：{missed.map((g) => g.day.slice(5)).join("、")}</li>}
  </ul>;
}

export function Fieldnotes({ section, onSection, onError }: { section: FieldSub; onSection: (section: FieldSub) => void; onError: (message: string) => void }) {
  const [view, setView] = useState<FieldView | null>(null);
  const [failed, setFailed] = useState("");
  // "回看" writes nothing; the form underneath keeps the kind it would have, so the hooks below stay the same
  const reviewing = section === "review";
  const kind: Kind = reviewing ? "trigger" : section;
  const [drafts, setDrafts] = useState<Record<Kind, Draft>>({ micro: EMPTY, session: EMPTY, trigger: EMPTY, reflection: EMPTY });
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [just, setJust] = useState<string[]>([]);
  const [reading, setReading] = useState<string[]>([]);
  const [filter, setFilter] = useState<Kind | "all">("all");

  const load = useCallback(async () => {
    try { setView(await parseResponse<FieldView>(await fetch("/api/workspace/fieldnotes", { cache: "no-store" }))); setFailed(""); }
    catch (cause) { setFailed(cause instanceof Error ? cause.message : "Could not read the field notes."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // an unsent draft survives a reload or a closed tab; it lives only in this browser until saved
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Record<Kind, Partial<Draft>>> | null;
      if (saved) setDrafts((current) => Object.fromEntries(KINDS.map((k) => [k, { ...current[k], ...saved[k] }])) as Record<Kind, Draft>);
    } catch { /* start empty */ }
    setRestored(true);
  }, []);
  useEffect(() => { if (restored) try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch { /* per-browser convenience */ } }, [drafts, restored]);

  const draft = drafts[kind];
  const set = (patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));
  const toggle = (feeling: string) => set({ feelings: draft.feelings.includes(feeling) ? draft.feelings.filter((f) => f !== feeling) : [...draft.feelings, feeling] });
  const parsed = useMemo(() => (kind === "trigger" && draft.pasted.trim() ? parsePasted(draft.pasted) : null), [kind, draft.pasted]);

  const today = view?.today ?? "";
  const from = draft.from || (today ? daysBefore(today, 14) : "");
  const to = draft.to || today;
  const replace = (note: FieldNote) => setView((current) => current && { ...current, notes: current.notes.map((n) => (n.id === note.id ? note : n)) });

  const ready = kind === "trigger" ? !!(draft.raw.trim() || draft.pasted.trim() || draft.intensity || draft.feelings.length || draft.extra.trim())
    : kind === "micro" ? !!(draft.raw.trim() || draft.satisfaction || draft.mine)
    : !!(draft.raw.trim() || draft.satisfaction || draft.mine || Object.values(draft.answers).some((a) => a.trim()));

  async function save() {
    if (saving || !ready) return;
    setSaving(true);
    try {
      const extra = draft.extra.split(/[\/、,，\s]+/).map((f) => f.trim()).filter(Boolean);
      const { note } = await post<{ note: FieldNote }>({ action: "add", kind, raw: draft.raw, satisfaction: draft.satisfaction, intensity: draft.intensity, mine: draft.mine, feelings: [...draft.feelings, ...extra], via: draft.via, answers: draft.answers, pasted: draft.pasted, about: draft.about, ...(kind === "reflection" ? { from, to } : {}) });
      setDrafts((current) => ({ ...current, [kind]: EMPTY }));
      setJust((ids) => [note.id, ...ids]);
      setView((current) => current && { ...current, notes: [note, ...current.notes], counts: { ...current.counts, [note.kind]: current.counts[note.kind] + 1 }, gaps: current.gaps.filter((g) => g.day !== (note.about ?? note.day)) });
      // the note is saved; reading the link happens after and apart, so a slow site never holds up the record or the next one
      if (note.capture?.url) void readLink(note.id);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not save."); }
    finally { setSaving(false); }
  }

  async function readLink(id: string) {
    setReading((ids) => [...ids, id]);
    try { replace((await post<{ note: FieldNote }>({ action: "enrich", id })).note); }
    catch { /* the note stands without a snapshot */ }
    finally { setReading((ids) => ids.filter((other) => other !== id)); }
  }

  if (failed) return <section className="is-embedded"><p className="carcosa-muted">{failed}</p></section>;
  if (!view) return <section className="is-embedded"><p className="carcosa-muted"><Loader2 className="ws-spin" size={14} /> Reading the field notes…</p></section>;

  const total = KINDS.reduce((n, k) => n + view.counts[k], 0);
  const fresh = view.notes.filter((n) => just.includes(n.id));
  const period = view.notes.filter((n) => !n.withdrawn && n.kind !== "reflection" && (n.about ?? n.day) >= from && (n.about ?? n.day) <= to);
  const history = view.notes.filter((n) => filter === "all" || n.kind === filter);
  const mode = MODES.find((m) => m.id === kind)!;

  const privacy = <p className="carcosa-muted carcosa-privacy">你写的原话、分数和回答只存在你自己的存储里，不发给任何模型，也不通过 MCP 开放。粘贴链接后，服务器会去读一次那个页面并留下快照；只有页面上的文字会发给 DeepSeek 归类。账本那一行由代码从提交记录生成。</p>;

  if (reviewing) return <section className="is-embedded fn">
    <div className="carcosa-row">
      <nav className="carcosa-tabs fn-filter" aria-label="Filter">
        {(["all", ...KINDS] as const).map((k) => <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>{k === "all" ? `全部 ${total}` : `${KIND_LABEL[k]} ${view.counts[k]}`}</button>)}
      </nav>
      <a className="ws-text-button" href="/api/workspace/fieldnotes?export=md" download><Download size={14} /> export</a>
    </div>
    {history.length === 0 ? <p className="carcosa-muted">还没有记录。</p> : history.map((note) => <NoteCard key={note.id} note={note} reading={reading.includes(note.id)} onChanged={replace} onError={onError} />)}
    {privacy}
  </section>;

  return <section className="is-embedded fn">
    <p className="carcosa-muted">{mode.hint}</p>

    <div className="fn-form">
      {kind === "trigger" && <>
        <label className="fn-field"><span>触发物：粘贴链接，或 app 里“复制链接”得到的整段文字</span>
          <textarea rows={2} value={draft.pasted} onChange={(e) => set({ pasted: e.target.value })} placeholder="https://…" /></label>
        {parsed && (parsed.url ? <CaptureBlock capture={{ pasted: draft.pasted, ...parsed, ...(parsed.postedAt ? { postedFrom: "id" as const } : {}) }} seenAt={new Date().toISOString()} /> : <p className="carcosa-muted">这里面没有找到链接。照样可以保存，它会作为你对触发物的描述留下来。</p>)}
      </>}

      {(kind === "micro" || kind === "session") && <>
        <p className="carcosa-muted">{draft.about ? `补记 ${draft.about}。` : view.context ? `今天（账本）：${contextLine(view.context)}` : "今天账本里还没有工作记录。"}</p>
        <Scale label="满足感" value={draft.satisfaction} onChange={(satisfaction) => set({ satisfaction })} />
        <Chips label="这像不像我做的" options={MINE.map((m) => MINE_LABEL[m])} value={draft.mine ? [MINE_LABEL[draft.mine]] : []} onToggle={(label) => { const picked = MINE.find((m) => MINE_LABEL[m] === label); set({ mine: draft.mine === picked ? undefined : picked }); }} />
      </>}

      {kind === "reflection" && <>
        <div className="carcosa-fields">
          <label>从 <input type="date" value={from} max={to} onChange={(e) => set({ from: e.target.value })} /></label>
          <label>到 <input type="date" value={to} max={today} onChange={(e) => set({ to: e.target.value })} /></label>
        </div>
        <PeriodSummary notes={period} gaps={view.gaps} from={from} to={to} />
      </>}

      <label className="fn-field"><span>{kind === "trigger" ? "第一反应（原话，不要修饰）" : kind === "micro" ? "一句原话" : "原始记录（先写，不要用 AI 润色；想到什么写什么）"}</span>
        <textarea rows={kind === "micro" ? 2 : kind === "trigger" ? 3 : 6} value={draft.raw} onChange={(e) => set({ raw: e.target.value })} /></label>

      {kind === "trigger" && <>
        <Chips label="情绪" options={FEELINGS} value={draft.feelings} onToggle={toggle} />
        <label className="fn-inline">其他情绪 <input type="text" maxLength={60} value={draft.extra} onChange={(e) => set({ extra: e.target.value })} placeholder="自己的词，用空格分开" /></label>
        <Scale label="强度" value={draft.intensity} onChange={(intensity) => set({ intensity })} />
        <Chips label="怎么看到的" options={SEEN_VIA} value={draft.via ? [draft.via] : []} onToggle={(via) => set({ via: draft.via === via ? "" : via })} />
        <details className="fn-more"><summary>再多写一点（可选）</summary><Questions kind="trigger" answers={draft.answers} onChange={(key, value) => set({ answers: { ...draft.answers, [key]: value } })} /></details>
      </>}
      {(kind === "session" || kind === "reflection") && <Questions kind={kind} answers={draft.answers} onChange={(key, value) => set({ answers: { ...draft.answers, [key]: value } })} />}

      <div className="fn-save">
        <button type="button" className="ws-text-button ws-text-button--bold" disabled={saving || !ready} onClick={() => void save()}>{saving ? <Loader2 className="ws-spin" size={14} /> : "■"} save</button>
        {draft.about && <button type="button" className="ws-text-button" onClick={() => set({ about: "" })}>改为记今天</button>}
        <span className="carcosa-muted">保存后原文不能再改，只能加后记。</span>
      </div>
    </div>

    {fresh.length > 0 && <>
      <h2 className="section-label">just saved</h2>
      {fresh.map((note) => <NoteCard key={note.id} note={note} reading={reading.includes(note.id)} onChanged={replace} onError={onError} />)}
    </>}

    {kind === "reflection" && <>
      <h2 className="section-label">this period <span>{period.length}</span></h2>
      {period.length === 0 ? <p className="carcosa-muted">这段时间没有记录。</p> : period.map((note) => <NoteCard key={note.id} note={note} onChanged={replace} onError={onError} />)}
    </>}

    {(kind === "micro" || kind === "session") && view.gaps.length > 0 && <>
      <h2 className="section-label">worked, not noted</h2>
      <p className="carcosa-muted">账本里有工作、这里没有记录的日子。空着也是数据；想补的话，补记会和当天写的分开标注。</p>
      <ul className="fn-gaps">{view.gaps.map((g) => <li key={g.day}>
        <span>{g.day.slice(5)} · {g.commits} 个提交（{g.withClaude} 个与 Claude 合写）· {g.where.join("、")}</span>
        <button type="button" className="ws-text-button" onClick={() => set({ about: g.day })}>补记</button>
      </li>)}</ul>
    </>}

    {kind === "micro" && <>
      <h2 className="section-label">carcosa</h2>
      <p className="carcosa-muted">顺手给 Carcosa 的今日自报。它和上面的记录分开存：每日一读时自报会发给 DeepSeek，上面的原话和分数不会。</p>
      <CarcosaCheckin />
    </>}

    {kind !== "reflection" && <p className="carcosa-muted fn-earlier">写的时候不展示以前的记录，免得向自己的过去看齐。{total > 0 && <> 共 {total} 条，在 <button type="button" className="ws-text-button" onClick={() => onSection("review")}>回看</button> 里。</>}</p>}

    {privacy}
  </section>;
}
