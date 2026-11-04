"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { parseResponse } from "./api";

type Doc = { file: string; url: string; done: number; total: number; open: string[] };
type Project = {
  name: string; color: string; devlogStatus: string; repo?: string;
  progress: { done: number; total: number } | null; trend: "up" | "steady" | "down" | "quiet"; idleDays: number | null;
  signals: { docs: Doc[]; deploy: { state: string; at: string; environment: string } | null; commits: { last7: number; prev7: number; last30: number; lastAt: string | null; source?: "github" | "devlog" }; notebook: { last30: number; topics: string[] }; sync: { folder: string; files: number | null; lastOk: string | null; state: string }[]; repoError?: string };
  assessment: string; next: string;
};
type Data = { updatedAt: string; overview: string; projects: Project[] };

const TREND: Record<Project["trend"], string> = { up: "picking up", steady: "steady", down: "slowing", quiet: "quiet" };
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const ago = (iso: string) => { const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)); return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`; };
const blocks = (done: number, total: number) => { const n = Math.round((done / total) * 20); return "■".repeat(n) + "□".repeat(20 - n); };

/** Where each project stands: progress counted from its own checklists, activity from commits, the notebook and the sync, with a short reading on top. */
export function Projects({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await parseResponse<Data>(await fetch("/api/workspace/mind/projects", { cache: "no-store" }))); }
    catch (cause) { setData((current) => current ?? { updatedAt: "", overview: "", projects: [] }); onError(cause instanceof Error ? cause.message : "Could not load the projects."); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  // A first visit starts the reading in the background; look again shortly until it arrives.
  const empty = data !== null && !data.updatedAt;
  useEffect(() => {
    if (!empty) return;
    let tries = 0;
    const timer = setInterval(() => { if (tries++ < 10) void load(); else clearInterval(timer); }, 6000);
    return () => clearInterval(timer);
  }, [empty, load]);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try { setData(await parseResponse<Data>(await fetch("/api/workspace/mind/projects", { method: "POST" }))); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Could not refresh."); }
    finally { setBusy(false); }
  }

  const projects = [...(data?.projects ?? [])].sort((a, b) => (a.idleDays ?? 9999) - (b.idleDays ?? 9999));
  return <div className="projects">
    <p className="self__lead">Where each project stands, in a line. The counted signals are under “details”.</p>
    <div className="self__actions">
      <button type="button" className="ws-text-button" disabled={busy} onClick={() => void refresh()}>read everything again</button>
      {busy && <span className="self__busy"><Loader2 className="ws-spin" size={14} /> Reading repositories and notes…</span>}
      {data?.updatedAt && !busy && <span className="self__busy">updated {ago(data.updatedAt)}</span>}
    </div>
    {data === null && <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Loading…</p>}
    {empty && !busy && <p className="mind__empty"><Loader2 className="ws-spin" size={14} /> Reading your projects for the first time…</p>}
    {data?.overview && <p className="mind__overview">{data.overview}</p>}
    {projects.map((project) => {
      const s = project.signals;
      return <section key={project.name} className="mind__project projects__card">
        <h2 className="section-label">{project.name} <span>{project.devlogStatus} · {TREND[project.trend]}{project.idleDays !== null ? ` · last activity ${project.idleDays === 0 ? "today" : `${project.idleDays}d ago`}` : ""}</span></h2>
        {project.progress && <p className="projects__bar"><span aria-hidden>{blocks(project.progress.done, project.progress.total)}</span> {project.progress.done} of {project.progress.total} ticked</p>}
        {project.assessment && <p className="mind__summary">{project.assessment}</p>}
        {project.next && <p className="projects__next">next: {project.next}</p>}
        <details className="projects__open"><summary>details</summary><ul className="projects__facts">
          {s.commits.last30 > 0 || s.commits.lastAt ? <li>commits: {s.commits.last7} this week, {s.commits.prev7} the week before, {s.commits.last30} in 30 days{s.commits.lastAt ? `, last ${day.format(new Date(s.commits.lastAt.length === 10 ? `${s.commits.lastAt}T12:00:00Z` : s.commits.lastAt))}` : ""} ({s.commits.source === "github" ? "from GitHub" : "from saved devlog entries, may be incomplete"})</li> : null}
          {s.deploy && <li>deploy ({s.deploy.environment}): {s.deploy.state}, {day.format(new Date(s.deploy.at))}</li>}
          {s.notebook.last30 > 0 && <li>notebook: {s.notebook.last30} entries in 30 days{s.notebook.topics.length ? ` · ${s.notebook.topics.join(", ")}` : ""}</li>}
          {s.sync.map((folder) => <li key={folder.folder}>sync: {folder.folder}{folder.files !== null ? `, ${folder.files} files` : ""}{folder.lastOk ? `, synced ${ago(folder.lastOk)}` : ""}{folder.state !== "idle" ? ` (${folder.state})` : ""}</li>)}
          {s.docs.map((doc) => <li key={doc.file}>{doc.url ? <a href={doc.url} target="_blank" rel="noreferrer">{doc.file}</a> : doc.file}: {doc.done}/{doc.total} ticked</li>)}
          {s.repoError && <li>repository: could not read ({s.repoError})</li>}
          {!project.progress && <li>progress unknown: no checklist found</li>}
        </ul></details>
        {s.docs.some((doc) => doc.open.length > 0) && <details className="projects__open"><summary>still open</summary><ul>{s.docs.flatMap((doc) => doc.open).slice(0, 6).map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
      </section>;
    })}
    {data?.updatedAt && projects.length === 0 && <p className="mind__empty">No projects yet. Add them in the Devlog, with a GitHub repository if there is one.</p>}
  </div>;
}
