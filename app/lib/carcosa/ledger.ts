import { get, put } from "@vercel/blob";
import { readEntries, readProjects } from "../devlogStore";
import { listDevices, type SyncDevice } from "../syncStore";

/**
 * Carcosa's ledger: what really happened in development, from three places that each see a different grain.
 * Drive Sync sees the working folders (files changed, boxes ticked, the commit checked out, what is not committed or
 * pushed); GitHub sees commits; the deployments Vercel writes to GitHub see what reached production. They are joined
 * by commit sha where they can be, and by work day (which starts at 05:00 London time, so a late night stays with
 * the day it belongs to) where they cannot. The ledger only adds facts; nothing in it is written by a model.
 */
export type LedgerEvent =
  | { kind: "sync"; at: string; source: string; changed: number }
  | { kind: "tick"; at: string; source: string; delta: number }
  | { kind: "head"; at: string; source: string; sha: string; dirty: number; ahead: number; repo?: string }
  | { kind: "commit"; at: string; repo: string; sha: string; message: string; claude: boolean }
  | { kind: "deploy"; at: string; repo: string; sha: string; env: string; state: string; id: number };

// The ledger is the owner's: the computer reports without a signed-in session, so it is not resolved per person.
const ROOT = "workspace/carcosa/";
const DAY_START_HOURS = 5;
const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
export const workDay = (ms: number) => dayFormat.format(new Date(ms - DAY_START_HOURS * 3_600_000));
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false });
export const londonTime = (ms: number) => timeFormat.format(new Date(ms));

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const result = await get(ROOT + path, { access: "private", useCache: false });
    if (result && result.statusCode === 200) return JSON.parse(await new Response(result.stream).text()) as T;
  } catch { /* first use */ }
  return fallback;
}
const writeJson = (path: string, value: unknown) => put(ROOT + path, JSON.stringify(value), { access: "private", allowOverwrite: true, contentType: "application/json" });

const keyOf = (e: LedgerEvent) => e.kind === "commit" ? `commit|${e.repo}|${e.sha}` : e.kind === "deploy" ? `deploy|${e.repo}|${e.id}|${e.state}` : e.kind === "head" ? `head|${e.source}|${e.sha}` : `${e.kind}|${e.source}|${e.at}`;
const monthOf = (at: string) => at.slice(0, 7);

/** Adds events to their month's file, once each. */
export async function appendEvents(events: LedgerEvent[]) {
  const byMonth = new Map<string, LedgerEvent[]>();
  for (const e of events) byMonth.set(monthOf(e.at), [...(byMonth.get(monthOf(e.at)) ?? []), e]);
  for (const [month, fresh] of byMonth) {
    const current = await readJson<LedgerEvent[]>(`events/${month}.json`, []);
    const seen = new Set(current.map(keyOf));
    const added = fresh.filter((e) => !seen.has(keyOf(e)) && (seen.add(keyOf(e)), true));
    if (added.length) await writeJson(`events/${month}.json`, [...current, ...added].sort((a, b) => a.at.localeCompare(b.at)));
  }
}

export async function readEvents(sinceMs: number) {
  const months = new Set<string>();
  for (let t = sinceMs; t <= Date.now() + 86_400_000; t += 20 * 86_400_000) months.add(new Date(t).toISOString().slice(0, 7));
  months.add(new Date().toISOString().slice(0, 7));
  const lists = await Promise.all([...months].map((m) => readJson<LedgerEvent[]>(`events/${m}.json`, [])));
  return lists.flat().filter((e) => Date.parse(e.at) >= sinceMs);
}

const ticked = (f?: SyncDevice["folders"][number]) => (f?.checklist ?? []).reduce((sum, c) => sum + c.done, 0);

/** What changed between two reports from the computer, as ledger events: a sync that carried changes, ticked boxes, a new commit checked out. */
export async function recordSync(previous: SyncDevice | null, next: SyncDevice) {
  const now = new Date().toISOString();
  const events: LedgerEvent[] = [];
  for (const f of next.folders) {
    const p = previous?.folders.find((item) => item.name === f.name);
    if (f.lastOk && f.lastOk !== p?.lastOk && (f.transferred ?? 0) > 0) events.push({ kind: "sync", at: f.lastOk, source: f.name, changed: f.transferred ?? 0 });
    const delta = ticked(f) - ticked(p);
    if (p && delta > 0) events.push({ kind: "tick", at: now, source: f.name, delta });
    if (f.git && f.git.head !== p?.git?.head) events.push({ kind: "head", at: f.git.headAt ?? now, source: f.name, sha: f.git.head, dirty: f.git.dirty, ahead: f.git.ahead, repo: f.git.repo });
  }
  if (events.length) await appendEvents(events);
}

// ---- GitHub: commits and deployments ------------------------------------------------------------------------------

type RepoState = { since?: string; mainSha?: string; mainAt?: string; deploys: Record<string, string>; /** Why the last poll could not read it, if it could not. */ error?: string };
type PollState = { polledAt: number; repos: Record<string, RepoState> };
const FINAL = new Set(["success", "failure", "error", "inactive"]);

async function gh(path: string) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "alex-workspace-carcosa", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if ((response.status === 403 || response.status === 429) && response.headers.get("x-ratelimit-remaining") === "0") throw new Error("github_rate");
  if (!response.ok) throw new Error(`github_${response.status}`);
  return response.json();
}

/** Every repository the ledger watches: those named on devlog projects and those the computer reports folders for. */
async function knownRepos(devices: SyncDevice[]) {
  const projects = await readProjects().catch(() => []);
  const repos = new Set<string>();
  for (const p of projects) if (p.repo) repos.add(p.repo);
  for (const d of devices) for (const f of d.folders) if (f.git?.repo) repos.add(f.git.repo);
  return [...repos].slice(0, 10);
}

/** Fetches new commits and deployment results, at most every nine minutes unless forced. Needs the owner's scope for the devlog projects. */
export async function pollRepos(force = false) {
  const state = await readJson<PollState>("poll.json", { polledAt: 0, repos: {} });
  if (!force && Date.now() - state.polledAt < 9 * 60_000) return state;
  const devices = await listDevices().catch(() => []);
  const events: LedgerEvent[] = [];
  for (const repo of await knownRepos(devices)) {
    const rs: RepoState = state.repos[repo] ?? { deploys: {} };
    try {
      const since = rs.since ?? new Date(Date.now() - 14 * 86_400_000).toISOString();
      const commits = await gh(`/repos/${repo}/commits?per_page=100&since=${encodeURIComponent(since)}`) as { sha: string; commit: { message: string; author?: { date?: string }; committer?: { date?: string } } }[];
      for (const c of commits) {
        const at = c.commit.committer?.date ?? c.commit.author?.date ?? since;
        events.push({ kind: "commit", at, repo, sha: c.sha, message: c.commit.message.split("\n")[0].slice(0, 200), claude: /Co-Authored-By:\s*Claude/i.test(c.commit.message) });
      }
      if (commits[0]) { rs.mainSha = commits[0].sha; rs.mainAt = commits[0].commit.committer?.date; rs.since = rs.mainAt ?? rs.since; }
      const deployments = await gh(`/repos/${repo}/deployments?per_page=15`) as { id: number; sha: string; environment: string; created_at: string }[];
      for (const d of deployments) {
        const known = rs.deploys[d.id];
        if (known && FINAL.has(known)) continue;
        const statuses = await gh(`/repos/${repo}/deployments/${d.id}/statuses?per_page=1`) as { state: string; created_at: string }[];
        const status = statuses[0];
        const st = status?.state ?? "pending";
        if (st !== known) events.push({ kind: "deploy", at: status?.created_at ?? d.created_at, repo, sha: d.sha, env: d.environment, state: st, id: d.id });
        rs.deploys[d.id] = st;
      }
      rs.deploys = Object.fromEntries(Object.entries(rs.deploys).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 60));
      delete rs.error;
    } catch (error) {
      // one repository failing does not stop the others, but it is remembered so the page can say so
      const code = error instanceof Error ? error.message : "";
      rs.error = code === "github_rate" ? "rate_limited" : /github_(404|403|401)/.test(code) ? "no_access" : "failed";
    }
    state.repos[repo] = rs;
  }
  if (events.length) await appendEvents(events);
  state.polledAt = Date.now();
  await writeJson("poll.json", state);
  return state;
}

// ---- the view: three sources side by side --------------------------------------------------------------------------

export type DayRow = { day: string; key: string; label: string; repo?: string; syncs: number; changed: number; ticks: number; commits: number; withClaude: number; deploysOk: number; deploysFailed: number; shas: string[]; messages: { at: string; sha: string; message: string; claude: boolean }[]; lastAt: string; devlog: boolean };
export type Alignment = { repo: string; local?: { device: string; folder: string; head: string; dirty: number; ahead: number; behind: number; seen: string }; main?: string; prod?: { sha: string; at: string }; lastDeploy?: { sha: string; state: string; at: string }; aligned: boolean };
export type Issue = { repo: string; kind: "unreadable" | "unpushed" | "uncommitted" | "deploy_failed" | "deploying" | "prod_behind" | "devlog_missing"; text: string; day?: string };

const short = (sha?: string) => (sha ?? "").slice(0, 7);
const isProd = (env: string) => /prod/i.test(env);

export async function ledgerView(days = 14) {
  const since = Date.now() - (days + 1) * 86_400_000;
  const [events, devices, projects, entries, poll] = await Promise.all([readEvents(since), listDevices().catch(() => []), readProjects().catch(() => []), readEntries().catch(() => []), readJson<PollState>("poll.json", { polledAt: 0, repos: {} })]);
  const folderRepo = new Map<string, string>();
  for (const d of devices) for (const f of d.folders) if (f.git?.repo) folderRepo.set(f.name, f.git.repo);
  for (const e of events) if (e.kind === "head" && e.repo && !folderRepo.has(e.source)) folderRepo.set(e.source, e.repo);

  const rows = new Map<string, DayRow>();
  const row = (day: string, repo: string | undefined, source: string | undefined) => {
    const key = repo ?? `folder:${source}`;
    const id = `${day}|${key}`;
    let r = rows.get(id);
    if (!r) { r = { day, key, label: repo ? repo.split("/")[1] : source ?? "?", repo, syncs: 0, changed: 0, ticks: 0, commits: 0, withClaude: 0, deploysOk: 0, deploysFailed: 0, shas: [], messages: [], lastAt: "", devlog: false }; rows.set(id, r); }
    return r;
  };
  for (const e of events) {
    const day = workDay(Date.parse(e.at));
    if (e.kind === "sync" || e.kind === "tick" || e.kind === "head") {
      const r = row(day, folderRepo.get(e.source), e.source);
      if (e.kind === "sync") { r.syncs += 1; r.changed += e.changed; }
      if (e.kind === "tick") r.ticks += e.delta;
      if (e.at > r.lastAt) r.lastAt = e.at;
    } else if (e.kind === "commit") {
      const r = row(day, e.repo, undefined);
      r.commits += 1; if (e.claude) r.withClaude += 1; r.shas.push(e.sha); r.messages.push({ at: e.at, sha: e.sha, message: e.message, claude: e.claude });
      if (e.at > r.lastAt) r.lastAt = e.at;
    } else if (e.kind === "deploy" && isProd(e.env) && FINAL.has(e.state)) {
      const r = row(day, e.repo, undefined);
      if (e.state === "success") r.deploysOk += 1; else if (e.state !== "inactive") r.deploysFailed += 1;
    }
  }
  for (const r of rows.values()) {
    if (!r.repo) continue;
    const ids = new Set(projects.filter((p) => p.repo === r.repo).map((p) => p.id));
    r.devlog = entries.some((e) => ids.has(e.projectId) && e.date === r.day);
  }

  const repos = new Set<string>([...Object.keys(poll.repos), ...folderRepo.values()]);
  const alignment: Alignment[] = [];
  const issues: Issue[] = [];
  for (const repo of repos) {
    const local = devices.flatMap((d) => d.folders.filter((f) => f.git?.repo === repo).map((f) => ({ device: d.name, folder: f.name, head: f.git!.head, dirty: f.git!.dirty, ahead: f.git!.ahead, behind: f.git!.behind, seen: d.lastSeen })))[0];
    const deploys = events.filter((e): e is Extract<LedgerEvent, { kind: "deploy" }> => e.kind === "deploy" && e.repo === repo && isProd(e.env)).sort((a, b) => a.at.localeCompare(b.at));
    const last = deploys[deploys.length - 1];
    const ok = [...deploys].reverse().find((e) => e.state === "success");
    const main = poll.repos[repo]?.mainSha;
    const aligned = !!local && !!main && !!ok && local.head === main && ok.sha === main && local.dirty === 0;
    alignment.push({ repo, local, main, prod: ok ? { sha: ok.sha, at: ok.at } : undefined, lastDeploy: last ? { sha: last.sha, state: last.state, at: last.at } : undefined, aligned });
    const name = repo.split("/")[1];
    const err = poll.repos[repo]?.error;
    if (err) issues.push({ repo, kind: "unreadable", text: err === "no_access" ? `${name}：GitHub 令牌读不到这个仓库，提交和部署都看不到` : err === "rate_limited" ? `${name}：GitHub 请求次数暂时用完，稍后会再读` : `${name}：上次读取 GitHub 失败` });
    if (local?.ahead) issues.push({ repo, kind: "unpushed", text: `${name}：本地有 ${local.ahead} 个提交还没推送` });
    if (local?.dirty) issues.push({ repo, kind: "uncommitted", text: `${name}：${local.dirty} 个文件改了还没提交` });
    if (last && (last.state === "failure" || last.state === "error")) issues.push({ repo, kind: "deploy_failed", text: `${name}：最近一次生产部署失败（${short(last.sha)}）` });
    else if (last && !FINAL.has(last.state)) issues.push({ repo, kind: "deploying", text: `${name}：${short(last.sha)} 正在部署` });
    else if (main && ok && ok.sha !== main) issues.push({ repo, kind: "prod_behind", text: `${name}：GitHub 已到 ${short(main)}，生产仍是 ${short(ok.sha)}` });
  }
  const recent = [...rows.values()].filter((r) => r.repo && r.commits > 0 && !r.devlog && Date.now() - Date.parse(`${r.day}T12:00:00Z`) < 7 * 86_400_000);
  for (const r of recent) issues.push({ repo: r.repo!, kind: "devlog_missing", text: `${r.label} · ${r.day}：${r.commits} 个提交，devlog 里还没有记录`, day: r.day });

  return {
    polledAt: poll.polledAt ? new Date(poll.polledAt).toISOString() : null,
    alignment: alignment.sort((a, b) => a.repo.localeCompare(b.repo)),
    issues,
    days: [...rows.values()].sort((a, b) => (b.day + b.lastAt).localeCompare(a.day + a.lastAt)),
  };
}

// ---- audit: what agents did --------------------------------------------------------------------------------------

export type AuditRow = { at: string; actor: string; action: string; detail: string };
export async function audit(actor: string, action: string, detail: string) {
  const rows = await readJson<AuditRow[]>("audit.json", []);
  await writeJson("audit.json", [{ at: new Date().toISOString(), actor, action, detail: detail.slice(0, 300) }, ...rows].slice(0, 200));
}
export const readAudit = () => readJson<AuditRow[]>("audit.json", []);
export { readJson as readLedgerJson, writeJson as writeLedgerJson };
