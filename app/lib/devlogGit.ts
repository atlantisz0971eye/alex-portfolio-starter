import { quickDeepSeek } from "./workspaceDeepSeek";
import type { DevEntry, DevProject } from "./devlogStore";

type Commit = { sha: string; message: string; date: string; url: string };
const MAX_DAYS = 14;

/** Commits of a repository since a time, newest first, restricted to the project's paths when it has any. */
async function fetchCommits(project: DevProject, since: string): Promise<Commit[]> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "alex-workspace", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const found = new Map<string, Commit>();
  for (const path of project.paths?.length ? project.paths : [""]) {
    for (let page = 1; page <= 3; page += 1) {
      const url = `https://api.github.com/repos/${project.repo}/commits?per_page=100&page=${page}&since=${encodeURIComponent(since)}${path ? `&path=${encodeURIComponent(path)}` : ""}`;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (response.status === 404 || response.status === 401 || response.status === 403) throw new Error(`github_${response.status}`);
      if (!response.ok) throw new Error("github_failed");
      const list = await response.json() as { sha: string; html_url: string; commit: { message: string; author?: { date?: string } } }[];
      for (const item of list) found.set(item.sha, { sha: item.sha, url: item.html_url, message: item.commit.message, date: item.commit.author?.date ?? since });
      if (list.length < 100) break;
    }
  }
  return [...found.values()].sort((a, b) => b.date.localeCompare(a.date));
}

const headline = (message: string) => message.split("\n")[0].trim().slice(0, 160);
const detail = (message: string) => message.split("\n").slice(1).filter((line) => line.trim() && !/^co-authored-by:/i.test(line.trim())).join(" ").slice(0, 280);

const SYSTEM = `你是开发日志助手。用户给你某个项目某一天的 git 提交信息，请写一条开发日志。
只输出 JSON：{"title":"当天主题，24 字内","bullets":["要点1","要点2"]}
要求：2 到 4 条要点，说明做了什么以及为什么（从提交信息推断，不确定的不要编造，不要罗列提交哈希）；保持提交里的专有名词和英文术语原样；用中文写，除非提交信息全是英文且很短。`;

async function summarize(project: string, day: string, commits: Commit[]): Promise<{ title: string; body: string }> {
  const lines = commits.map((commit) => `- ${headline(commit.message)}${detail(commit.message) ? ` (${detail(commit.message)})` : ""}`).join("\n").slice(0, 6000);
  const raw = await quickDeepSeek(SYSTEM, `项目：${project}\n日期：${day}\n提交：\n${lines}`, 700, 40_000);
  try {
    const parsed = JSON.parse((raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { title?: unknown; bullets?: unknown };
    const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.filter((item): item is string => typeof item === "string" && !!item.trim()).slice(0, 5) : [];
    if (typeof parsed.title === "string" && parsed.title.trim() && bullets.length) return { title: parsed.title.trim().slice(0, 100), body: bullets.map((item) => `- ${item.trim()}`).join("\n") };
  } catch { /* fall through to the plain summary */ }
  return { title: headline(commits[0].message), body: commits.slice(0, 6).map((commit) => `- ${headline(commit.message)}`).join("\n") };
}

const dayIn = (iso: string, zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Reads new commits and writes one summarized entry per day (the newest days first, a limited number per run). */
export const shaKey = (shas: string[]) => shas.map((sha) => sha.slice(0, 7)).sort().join(",");

export async function syncProject(project: DevProject, zone: string, known: Map<string, string> = new Map()) {
  if (!project.repo) throw new Error("no_repo");
  const since = project.lastSync ? new Date(Date.parse(project.lastSync) - 36 * 3_600_000).toISOString() : new Date(Date.now() - 90 * 86_400_000).toISOString();
  const commits = await fetchCommits(project, since);
  const byDay = new Map<string, Commit[]>();
  for (const commit of commits) byDay.set(dayIn(commit.date, zone), [...(byDay.get(dayIn(commit.date, zone)) ?? []), commit]);
  // A day whose commits are unchanged since the last run keeps its entry and costs no summary.
  const days = [...byDay.keys()].sort().reverse().filter((day) => known.get(day) !== shaKey(byDay.get(day)!.slice(0, 40).map((commit) => commit.sha)));
  const todo = days.slice(0, MAX_DAYS);
  const entries: Omit<DevEntry, "id" | "createdAt" | "updatedAt" | "projectId" | "kind">[] = [];
  for (let index = 0; index < todo.length; index += 3) {
    const batch = await Promise.all(todo.slice(index, index + 3).map(async (day) => {
      const list = byDay.get(day)!;
      const summary = await summarize(project.name, day, list);
      return { date: day, title: summary.title, body: summary.body, commits: list.slice(0, 40).map((commit) => ({ sha: commit.sha.slice(0, 7), message: headline(commit.message), url: commit.url })) };
    }));
    entries.push(...batch);
  }
  return { entries, commitCount: commits.length, skippedDays: days.length - todo.length };
}

const REVIEW = `你是项目回顾助手。用户给你一个项目一段时间内的开发日志条目，请写一篇可以放进作品集过程文档的回顾，Markdown，不要任何解释：
- “## 概述”：2 到 3 句话说清这段时间做了什么。
- “## 进展”：按主题列出关键进展。
- “## 决策与转折”：做过的选择、改变过的方向，以及原因（只写日志里有依据的）。
- “## 卡点与教训”：遇到的问题和学到的东西；没有就省略这一节。
- “## 下一步”：从日志中可以看出的后续方向；不确定就省略。
保持原文语言，不添加日志里没有的事实。`;

export async function reviewEntries(project: string, from: string, to: string, entries: DevEntry[]) {
  const material = entries.sort((a, b) => a.date.localeCompare(b.date)).map((entry) => `### ${entry.date} · ${entry.title}\n${entry.body.slice(0, 800)}`).join("\n\n").slice(0, 12_000);
  return quickDeepSeek(REVIEW, `项目：${project}\n时间：${from} 到 ${to}\n\n日志：\n${material}`, 2500, 55_000);
}
