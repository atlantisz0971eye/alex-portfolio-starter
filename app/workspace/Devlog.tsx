"use client";

import { ChevronDown, ChevronRight, ExternalLink, FileText, GitCommitHorizontal, ImagePlus, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, ScrollText, Sparkles, Trash2, Waypoints, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { DevEntry, DevProject } from "../lib/devlogStore";
import type { NoteMeta } from "../lib/notesStore";
import { parseResponse } from "./api";
import { shrink } from "./BoardCanvas";
import { zone } from "./calendarFormat";
import { Sheet } from "./Sheet";
import { PageTitle, TopRow } from "./Shell";

type Props = { onError: (message: string) => void; onSignOut: () => void; onOpenStream: (noteId: string) => void };
type Data = { projects: DevProject[]; entries: DevEntry[]; github: boolean };

const json = { "Content-Type": "application/json" };
const api = "/api/workspace/devlog";
const SWATCHES = ["#4a6fb8", "#4f8a5b", "#b9822e", "#8a5aa8", "#b4382c", "#2f8f9d"];
const today = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const month = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const asDate = (value: string) => new Date(`${value}T12:00:00`);
const KIND: Record<DevEntry["kind"], { label: string; icon: typeof FileText }> = { note: { label: "Note", icon: FileText }, commits: { label: "Commits", icon: GitCommitHorizontal }, stream: { label: "Mindstream", icon: Waypoints }, review: { label: "Review", icon: Sparkles } };

/** A weekly activity grid for the last weeks: one cell per day, darker where more was logged. */
function Strip({ entries }: { entries: DevEntry[] }) {
  const cells = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((entry) => counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1));
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    const start = new Date(end);
    start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - 7 * 17);
    return Array.from({ length: 18 * 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const key = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
      return { key, count: counts.get(key) ?? 0, future: day > end };
    });
  }, [entries]);
  return <div className="dl-strip" role="img" aria-label="Activity over the last 18 weeks">{cells.map((cell) => <i key={cell.key} title={`${cell.key}: ${cell.count}`} data-level={cell.future ? "x" : Math.min(3, cell.count)} />)}</div>;
}

export function Devlog({ onError, onSignOut, onOpenStream }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<Partial<DevEntry> | null>(null);
  const [projectEdit, setProjectEdit] = useState<Partial<DevProject> | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<DevEntry | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const auto = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await parseResponse<Data>(await fetch(api, { cache: "no-store" })));
    } catch (cause) {
      setData((current) => current ?? { projects: [], entries: [], github: false });
      onError(cause instanceof Error ? cause.message : "Could not load the devlog.");
    }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  const sync = useCallback(async (projects: DevProject[], quiet = false) => {
    const targets = projects.filter((project) => project.repo);
    if (!targets.length) return;
    setSyncing(true);
    setNote("");
    let days = 0;
    let left = 0;
    try {
      for (const project of targets) {
        try {
          const result = await parseResponse<{ days: number; skippedDays: number }>(await fetch(`${api}/sync`, { method: "POST", headers: json, body: JSON.stringify({ projectId: project.id, zone: zone() }) }));
          days += result.days;
          left += result.skippedDays;
        } catch (cause) {
          if (!quiet) onError(`${project.name}: ${cause instanceof Error ? cause.message : "Could not sync."}`);
        }
      }
      await load();
      setNote(days || left ? `${days} day${days === 1 ? "" : "s"} written from commits${left ? `, ${left} more to go: sync again` : ""}` : "Commits are up to date");
    } finally {
      setSyncing(false);
    }
  }, [load, onError]);

  // Pick up new commits when the page is opened, if a project has not been read for a few hours.
  useEffect(() => {
    if (!data || auto.current) return;
    auto.current = true;
    const stale = data.projects.filter((project) => project.repo && (!project.lastSync || Date.now() - Date.parse(project.lastSync) > 6 * 3_600_000));
    if (stale.length) void sync(stale, true);
  }, [data, sync]);

  const projects = data?.projects ?? [];
  const byId = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const visible = useMemo(() => (data?.entries ?? []).filter((entry) => byId.has(entry.projectId) && (!filter || entry.projectId === filter)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [data, byId, filter]);
  const grouped = useMemo(() => {
    const months: { key: string; days: { date: string; entries: DevEntry[] }[] }[] = [];
    for (const entry of visible) {
      const key = entry.date.slice(0, 7);
      let group = months[months.length - 1];
      if (!group || group.key !== key) { group = { key, days: [] }; months.push(group); }
      const last = group.days[group.days.length - 1];
      if (last && last.date === entry.date) last.entries.push(entry); else group.days.push({ date: entry.date, entries: [entry] });
    }
    return months;
  }, [visible]);
  const current = filter ? byId.get(filter) ?? null : null;

  async function remove(entry: DevEntry) {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await parseResponse(await fetch(api, { method: "POST", headers: json, body: JSON.stringify({ action: "deleteEntry", id: entry.id }) }));
      await load();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not delete."); }
  }

  const toggle = (id: string) => setOpen((currentSet) => { const next = new Set(currentSet); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <>
    <main className="page page--devlog">
      <TopRow onSignOut={onSignOut} />
      <PageTitle actions={<>
        {projects.some((project) => project.repo) && <button type="button" className="ws-round" aria-label="Sync commits" onClick={() => void sync(current ? [current] : projects)} disabled={syncing}>{syncing ? <Loader2 className="ws-spin" size={18} /> : <RefreshCw size={18} />}</button>}
        <button type="button" className="ws-round" aria-label="New entry" onClick={() => setEditing({ projectId: filter ?? projects[0]?.id, date: today(), kind: "note" })} disabled={!projects.length}><Plus size={20} /></button>
      </>}>Devlog</PageTitle>

      {data === null && <div className="mail-skeleton"><div><span className="skeleton skeleton--line" /><span className="skeleton skeleton--line skeleton--short" /></div></div>}
      {data && projects.length === 0 && <div className="empty"><ScrollText size={28} /><p>No projects yet.</p><small>Add a project, write entries as you go, and link a GitHub repository to have commits turned into daily entries.</small><button type="button" className="ws-pill ws-pill--solid" onClick={() => setProjectEdit({})}><Plus size={16} /> New project</button></div>}

      {data && projects.length > 0 && <>
        <div className="dl-chips" role="tablist" aria-label="Projects">
          <button type="button" className={!filter ? "is-on" : ""} onClick={() => setFilter(null)}>All</button>
          {projects.map((project) => <button key={project.id} type="button" className={filter === project.id ? "is-on" : ""} onClick={() => setFilter(project.id)}><i style={{ background: project.color }} />{project.name}</button>)}
          <button type="button" className="dl-chips__add" aria-label="New project" onClick={() => setProjectEdit({})}><Plus size={15} /></button>
        </div>
        {current && <div className="dl-project">
          <p>{current.description || "No description yet."}<small>{current.status}{current.repo ? ` · ${current.repo}` : ""}</small></p>
          <div><button type="button" className="ws-text-button" onClick={() => setReviewOpen(true)}><Sparkles size={15} /> Review</button><button type="button" className="ws-text-button" onClick={() => setProjectEdit(current)}><Pencil size={15} /> Edit</button></div>
        </div>}
        <Strip entries={visible} />
        {note && <p className="dl-note" aria-live="polite">{note}</p>}

        {visible.length === 0 && <p className="ws-muted dl-empty">Nothing logged yet{current ? ` for ${current.name}` : ""}. Tap + to write the first entry{projects.some((project) => project.repo) ? ", or sync commits" : ""}.</p>}
        {grouped.map((group) => <section key={group.key} className="dl-month">
          <h2 className="section-label">{month.format(asDate(`${group.key}-01`))}</h2>
          {group.days.map((day) => <div key={day.date} className="dl-day">
            <time>{dayLabel.format(asDate(day.date))}</time>
            <div className="dl-day__entries">
              {day.entries.map((entry) => {
                const project = byId.get(entry.projectId)!;
                const Kind = KIND[entry.kind];
                const expanded = open.has(entry.id);
                return <article key={entry.id} className={`dl-entry dl-entry--${entry.kind}`} style={{ "--c": project.color } as React.CSSProperties}>
                  <header>
                    <span className="dl-entry__who"><i />{project.name}<Kind.icon size={13} aria-hidden="true" /><small>{Kind.label}</small></span>
                    <button type="button" className="ntree__act" aria-label="Entry options" onClick={() => setMenuFor(entry)}><MoreHorizontal size={16} /></button>
                  </header>
                  {entry.title && <h3>{entry.title}</h3>}
                  {entry.body && <div className="ws-markdown dl-entry__body"><ReactMarkdown>{entry.body}</ReactMarkdown></div>}
                  {entry.images && entry.images.length > 0 && <div className="dl-entry__images">{entry.images.map((name) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={name} src={`${api}/assets/${name}`} alt="" loading="lazy" />)}</div>}
                  {entry.noteId && <button type="button" className="ws-pill dl-entry__open" onClick={() => onOpenStream(entry.noteId!)}><Waypoints size={15} /> Open mindstream</button>}
                  {entry.commits && entry.commits.length > 0 && <div className="dl-commits">
                    <button type="button" onClick={() => toggle(entry.id)} aria-expanded={expanded}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {entry.commits.length} commit{entry.commits.length === 1 ? "" : "s"}</button>
                    {expanded && <ul>{entry.commits.map((commit) => <li key={commit.sha}><a href={commit.url} target="_blank" rel="noreferrer"><code>{commit.sha}</code> {commit.message}<ExternalLink size={11} /></a></li>)}</ul>}
                  </div>}
                </article>;
              })}
            </div>
          </div>)}
        </section>)}
      </>}
    </main>

    <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title || "Entry"} size="compact">
      {menuFor && <div className="doc__group">
        {menuFor.kind !== "commits" && <button type="button" onClick={() => { setEditing(menuFor); setMenuFor(null); }}><Pencil size={18} /> Edit</button>}
        {menuFor.kind === "commits" && <button type="button" onClick={() => { setEditing({ projectId: menuFor.projectId, date: menuFor.date, kind: "note" }); setMenuFor(null); }}><Plus size={18} /> Add a note to this day</button>}
        <button type="button" className="is-danger" onClick={() => { const target = menuFor; setMenuFor(null); void remove(target); }}><Trash2 size={18} /> Delete</button>
      </div>}
    </Sheet>
    <EntrySheet entry={editing} projects={projects} onClose={() => setEditing(null)} onError={onError} onSaved={() => { setEditing(null); void load(); }} />
    <ProjectSheet project={projectEdit} github={!!data?.github} onClose={() => setProjectEdit(null)} onError={onError} onSaved={(saved) => { setProjectEdit(null); setFilter(saved?.id ?? null); void load().then(() => { if (saved?.repo) void sync([saved]); }); }} />
    <ReviewSheet open={reviewOpen} project={current} onClose={() => setReviewOpen(false)} onError={onError} onSaved={() => { setReviewOpen(false); void load(); }} />
  </>;
}

/** Writing or editing one entry: project, day, title, text, photos and an optional pinned mindstream. */
function EntrySheet({ entry, projects, onClose, onError, onSaved }: { entry: Partial<DevEntry> | null; projects: DevProject[]; onClose: () => void; onError: (message: string) => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<DevEntry>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (entry) setForm(entry); }, [entry]);

  useEffect(() => {
    if (!picker || notes) return;
    void (async () => {
      try { setNotes((await parseResponse<{ notes: NoteMeta[] }>(await fetch("/api/workspace/notes", { cache: "no-store" }))).notes.filter((item) => !item.deletedAt && item.kind !== "vocabulary")); } catch { setNotes([]); }
    })();
  }, [picker, notes]);

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const names: string[] = [];
      for (const item of [...files].slice(0, 6 - (form.images?.length ?? 0))) {
        const { blob } = await shrink(item);
        names.push((await parseResponse<{ name: string }>(await fetch(`${api}/assets`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob }))).name);
      }
      setForm((current) => ({ ...current, images: [...(current.images ?? []), ...names] }));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not add the image.");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  async function save() {
    setSaving(true);
    try {
      const kind = form.noteId ? "stream" : form.kind === "stream" ? "note" : form.kind ?? "note";
      await parseResponse(await fetch(api, { method: "POST", headers: json, body: JSON.stringify({ action: "entry", entry: { ...form, kind } }) }));
      onSaved();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Sheet open={!!entry} onClose={onClose} title={form.id ? "Edit entry" : "New entry"} size="tall" primary={{ label: saving ? "Saving…" : "Save", onClick: () => void save(), disabled: saving || (!form.title?.trim() && !form.body?.trim()) }}>
      <div className="dl-form">
        <div className="dl-form__row">
          <label><span>Project</span><select value={form.projectId ?? ""} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label><span>Day</span><input type="date" value={form.date ?? ""} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        </div>
        <label><span>Title</span><input value={form.title ?? ""} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What happened today" maxLength={160} /></label>
        <label><span>Notes (Markdown)</span><textarea value={form.body ?? ""} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="What you tried, decided, got stuck on…" /></label>
        <div className="dl-form__images">
          {(form.images ?? []).map((name) => <span key={name}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`${api}/assets/${name}`} alt="" /><button type="button" aria-label="Remove image" onClick={() => setForm({ ...form, images: (form.images ?? []).filter((item) => item !== name) })}><X size={12} /></button></span>)}
          {(form.images?.length ?? 0) < 6 && <button type="button" className="ws-pill" onClick={() => file.current?.click()} disabled={busy}>{busy ? <Loader2 className="ws-spin" size={15} /> : <ImagePlus size={15} />} Photo</button>}
        </div>
        <div className="dl-form__pin">
          {form.noteId ? <><span><Waypoints size={15} /> Mindstream pinned</span><button type="button" className="ws-text-button" onClick={() => setForm({ ...form, noteId: undefined })}>Remove</button></> : <button type="button" className="ws-pill" onClick={() => setPicker(true)}><Waypoints size={15} /> Pin a mindstream</button>}
        </div>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(event) => void addImages(event.target.files)} />
      </div>
    </Sheet>
    <Sheet open={picker} onClose={() => setPicker(false)} title="Pin a mindstream" size="tall">
      {notes === null ? <p className="board-read__wait"><Loader2 className="ws-spin" size={16} /> Loading…</p> : <div className="doc__group">
        {notes.length === 0 && <p className="ws-muted">No mindstreams yet.</p>}
        {notes.map((item) => <button key={item.id} type="button" onClick={() => { setForm((current) => ({ ...current, noteId: item.id, title: current.title?.trim() ? current.title : item.title || "Mindstream" })); setPicker(false); }}><span>{item.icon || "🧠"}</span> {item.title || "Untitled"}</button>)}
      </div>}
    </Sheet>
  </>;
}

function ProjectSheet({ project, github, onClose, onError, onSaved }: { project: Partial<DevProject> | null; github: boolean; onClose: () => void; onError: (message: string) => void; onSaved: (saved: DevProject | null) => void }) {
  const [form, setForm] = useState<Partial<DevProject> & { pathText?: string }>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (project) setForm({ ...project, pathText: (project.paths ?? []).join(", ") }); }, [project]);

  async function save() {
    setSaving(true);
    try {
      const { project: saved } = await parseResponse<{ project: DevProject }>(await fetch(api, { method: "POST", headers: json, body: JSON.stringify({ action: "project", project: { ...form, paths: form.pathText } }) }));
      onSaved(saved);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not save the project.");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!form.id || !window.confirm(`Delete “${form.name}” and all of its entries?`)) return;
    try {
      await parseResponse(await fetch(api, { method: "POST", headers: json, body: JSON.stringify({ action: "deleteProject", id: form.id }) }));
      onSaved(null);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not delete."); }
  }

  return <Sheet open={!!project} onClose={onClose} title={form.id ? "Edit project" : "New project"} size="tall" primary={{ label: saving ? "Saving…" : "Save", onClick: () => void save(), disabled: saving || !form.name?.trim() }}>
    <div className="dl-form">
      <label><span>Name</span><input value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Alex Workspace" maxLength={80} /></label>
      <label><span>Description</span><textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} style={{ minHeight: 80 }} maxLength={400} /></label>
      <div className="dl-form__row">
        <label><span>Status</span><select value={form.status ?? "active"} onChange={(event) => setForm({ ...form, status: event.target.value as DevProject["status"] })}><option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option></select></label>
        <div className="dl-form__colors" role="group" aria-label="Colour">{SWATCHES.map((color) => <button key={color} type="button" aria-label={color} className={form.color === color ? "is-on" : ""} style={{ background: color }} onClick={() => setForm({ ...form, color })} />)}</div>
      </div>
      <label><span>GitHub repository (optional)</span><input value={form.repo ?? ""} onChange={(event) => setForm({ ...form, repo: event.target.value })} placeholder="owner/name" autoCapitalize="none" autoCorrect="off" /></label>
      <label><span>Only these folders (optional, comma separated)</span><input value={form.pathText ?? ""} onChange={(event) => setForm({ ...form, pathText: event.target.value })} placeholder="app/workspace, app/api/workspace" autoCapitalize="none" autoCorrect="off" /></label>
      <p className="board-read__hint">One repository can hold several projects: give each its own folders and only matching commits are used. {github ? "Private repositories are read with your GITHUB_TOKEN." : "Public repositories work as they are; for a private one add GITHUB_TOKEN in Vercel (read-only access to contents)."}</p>
      {form.id && <button type="button" className="ws-text-button ws-text-button--danger" onClick={() => void remove()}><Trash2 size={16} /> Delete project</button>}
    </div>
  </Sheet>;
}

const RANGES = [{ id: "30", label: "Last 30 days", days: 30 }, { id: "90", label: "Last 90 days", days: 90 }, { id: "all", label: "Everything", days: 3650 }];

/** A retrospective drafted from a project's entries; edit it, then keep it as an entry. */
function ReviewSheet({ open, project, onClose, onError, onSaved }: { open: boolean; project: DevProject | null; onClose: () => void; onError: (message: string) => void; onSaved: () => void }) {
  const [range, setRange] = useState("30");
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setMarkdown(null); setRange("30"); } }, [open]);
  const span = RANGES.find((item) => item.id === range)!;
  const from = () => { const date = new Date(); date.setDate(date.getDate() - span.days); return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date); };

  async function draft() {
    if (!project) return;
    setWorking(true);
    try {
      setMarkdown((await parseResponse<{ markdown: string }>(await fetch(`${api}/review`, { method: "POST", headers: json, body: JSON.stringify({ projectId: project.id, from: from(), to: today() }) }))).markdown);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not draft the review.");
    } finally {
      setWorking(false);
    }
  }
  async function keep() {
    if (!project || !markdown) return;
    setSaving(true);
    try {
      await parseResponse(await fetch(api, { method: "POST", headers: json, body: JSON.stringify({ action: "entry", entry: { projectId: project.id, kind: "review", date: today(), title: `Review · ${span.label.toLowerCase()}`, body: markdown } }) }));
      onSaved();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not save."); } finally { setSaving(false); }
  }

  return <Sheet open={open} onClose={onClose} title={project ? `Review · ${project.name}` : "Review"} size="tall" primary={markdown ? { label: saving ? "Saving…" : "Keep as entry", onClick: () => void keep(), disabled: saving } : undefined}>
    <div className="board-read">
      {markdown === null ? <>
        <div className="ws-segment ms__mode" role="group" aria-label="Range">{RANGES.map((item) => <button key={item.id} type="button" className={range === item.id ? "is-on" : ""} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>
        <p className="board-read__hint">DeepSeek reads the entries in this range and drafts a retrospective you can edit, suited to a process document.</p>
        <button type="button" className="ws-pill ws-pill--solid" onClick={() => void draft()} disabled={working}>{working ? <Loader2 className="ws-spin" size={16} /> : <Sparkles size={16} />} Draft the review</button>
      </> : <textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} style={{ minHeight: 420 }} />}
    </div>
  </Sheet>;
}
