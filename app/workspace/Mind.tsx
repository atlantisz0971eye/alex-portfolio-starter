"use client";

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseResponse } from "./api";
import { PageTitle, TopRow } from "./Shell";
import { Notes } from "./Notes";
import { Projects } from "./Projects";
import { Self } from "./Self";
import { useRemembered } from "./useSplit";

type Derived = { title: string; topic: string; project: string; kind: string };
type Item = { id: string; at: string; text: string; source: "notebook" | "devlog"; derived: Derived | null };
type Data = { items: Item[]; topics: { name: string; project: string; summary: string }[]; projects: { name: string; summary: string }[]; overview: string; updatedAt: string };
type Props = { onError: (message: string) => void; onSignOut: () => void; refresh: number; openId: string | null };

const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const UNSORTED = "Unsorted";

/**
 * The notebook: one place to write, and a map the model keeps of everything written (and of the devlog) as a tree of
 * projects and topics with a short summary at each level. Nothing here is filed by hand. The earlier pages and boards
 * stay reachable as the archive.
 */
export function Mind({ onError, onSignOut, refresh, openId }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useRemembered("ws-mind-view", "tree");
  const [archive, setArchive] = useState(!!openId);
  const [rebuilding, setRebuilding] = useState(false);
  const polls = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try { setData(await parseResponse<Data>(await fetch("/api/workspace/mind", { cache: "no-store" }))); }
    catch (cause) { setData((current) => current ?? { items: [], topics: [], projects: [], overview: "", updatedAt: "" }); onError(cause instanceof Error ? cause.message : "Could not load the notebook."); }
  }, [onError]);
  useEffect(() => { void load(); }, [load, refresh]);
  useEffect(() => { if (openId) setArchive(true); }, [openId]);

  // Filing happens in the background; while something waits for it, look again every few seconds.
  const waiting = data?.items.some((item) => !item.derived) ?? false;
  useEffect(() => {
    if (!waiting || archive) { polls.current = 0; return; }
    const timer = setInterval(() => { if (polls.current++ < 15) void load(); else clearInterval(timer); }, 4000);
    return () => clearInterval(timer);
  }, [waiting, archive, load]);

  async function save() {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      const { entry } = await parseResponse<{ entry: { id: string; at: string; text: string } }>(await fetch("/api/workspace/mind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", text: value }) }));
      setData((current) => current && { ...current, items: [{ ...entry, source: "notebook", derived: null }, ...current.items] });
      setText("");
      polls.current = 0;
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not save.");
    } finally { setSaving(false); box.current?.focus(); }
  }

  async function remove(id: string) {
    setData((current) => current && { ...current, items: current.items.filter((item) => item.id !== id) });
    try { await parseResponse(await fetch("/api/workspace/mind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) })); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Could not delete."); void load(); }
  }

  async function rebuild() {
    if (rebuilding) return;
    setRebuilding(true);
    try {
      await parseResponse(await fetch("/api/workspace/mind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reorganize" }) }));
      polls.current = 0;
      setTimeout(() => { void load(); setRebuilding(false); }, 9000);
    } catch (cause) { setRebuilding(false); onError(cause instanceof Error ? cause.message : "Could not rebuild the map."); }
  }

  const tree = useMemo(() => {
    if (!data) return [];
    const filed = data.items.filter((item) => item.derived);
    const projects = new Map<string, Map<string, Item[]>>();
    for (const item of filed) {
      const { project, topic } = item.derived!;
      const topics = projects.get(project) ?? new Map<string, Item[]>();
      topics.set(topic, [...(topics.get(topic) ?? []), item]);
      projects.set(project, topics);
    }
    const latest = (items: Item[]) => items.reduce((max, item) => (item.at > max ? item.at : max), "");
    return [...projects.entries()].map(([name, topics]) => ({
      name,
      summary: data.projects.find((project) => project.name === name)?.summary ?? "",
      count: [...topics.values()].reduce((sum, items) => sum + items.length, 0),
      topics: [...topics.entries()].map(([topic, items]) => ({ name: topic, summary: data.topics.find((entry) => entry.name === topic && entry.project === name)?.summary ?? "", items })).sort((a, b) => latest(b.items).localeCompare(latest(a.items))),
      latest: latest([...topics.values()].flat()),
    })).sort((a, b) => (a.name === UNSORTED ? 1 : b.name === UNSORTED ? -1 : b.latest.localeCompare(a.latest)));
  }, [data]);

  if (archive) return <>
    <button type="button" className="mind__back" onClick={() => setArchive(false)}>← notebook</button>
    <Notes onError={onError} onSignOut={onSignOut} refresh={refresh} openId={openId} />
  </>;

  const entry = (item: Item) => <details key={item.id} className="mind__entry">
    <summary><span className="mind__kind">{item.derived?.kind ?? "…"}</span><span className="mind__title">{item.derived?.title ?? item.text.slice(0, 48)}</span><time>{day.format(new Date(item.at))}</time>{item.source === "devlog" && <i>devlog</i>}</summary>
    <p>{item.text}</p>
    {item.source === "notebook" && <button type="button" className="mind__delete" aria-label="Delete this entry" onClick={() => void remove(item.id)}><Trash2 size={14} /> delete</button>}
  </details>;

  const unfiled = data?.items.filter((item) => !item.derived) ?? [];
  return <main className="page page--mind">
    <TopRow onSignOut={onSignOut} />
    <div className="page__inner">
      <PageTitle actions={<><button type="button" className="ws-text-button" onClick={() => setArchive(true)}>archive</button><button type="button" className="ws-round" aria-label="Rebuild the map" title="Have the model file everything again" onClick={() => void rebuild()} disabled={rebuilding}>{rebuilding ? <Loader2 className="ws-spin" size={18} /> : <RefreshCw size={18} />}</button></>}>Mindstreams</PageTitle>
      <textarea ref={box} className="mind__input" rows={3} value={text} placeholder="Write anything. It gets filed for you." aria-label="Write in the notebook" maxLength={4000}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); } }} />
      <p className="mind__hint">{saving ? "Saving…" : waiting ? "Filing…" : "Enter to save · Shift+Enter for a new line"}</p>

      {data === null && <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Loading…</p>}
      {data?.overview && <p className="mind__overview">{data.overview}</p>}

      <div className="mail-chips mind__tabs" role="group" aria-label="View">
        <button type="button" className={view === "tree" ? "is-on" : ""} onClick={() => setView("tree")}>Tree</button>
        <button type="button" className={view === "stream" ? "is-on" : ""} onClick={() => setView("stream")}>Stream</button>
        <button type="button" className={view === "projects" ? "is-on" : ""} onClick={() => setView("projects")}>Projects</button>
        <button type="button" className={view === "self" ? "is-on" : ""} onClick={() => setView("self")}>Self</button>
      </div>
      {(view === "tree" || view === "stream") && data && data.items.length === 0 && <p className="mind__empty">Nothing yet. Write a thought above, in any order.</p>}
      {view === "projects" && <Projects onError={onError} />}
      {view === "self" && <Self onError={onError} />}

      {view === "tree" && <>
        {unfiled.length > 0 && <section className="mind__project"><h2 className="section-label">filing</h2>{unfiled.map(entry)}</section>}
        {tree.map((project) => <section key={project.name} className="mind__project">
          <h2 className="section-label">{project.name} <span>{project.count}</span></h2>
          {project.summary && <p className="mind__summary">{project.summary}</p>}
          {project.topics.map((topic) => <details key={topic.name} className="mind__topic" open={topic.items.length <= 3}>
            <summary><b>{topic.name}</b><span>{topic.items.length}</span></summary>
            {topic.summary && <p className="mind__summary mind__summary--topic">{topic.summary}</p>}
            {[...topic.items].sort((a, b) => b.at.localeCompare(a.at)).map(entry)}
          </details>)}
        </section>)}
      </>}
      {view === "stream" && <section className="mind__project">{(data?.items ?? []).map((item) => <div key={item.id} className="mind__streamrow">{entry(item)}{item.derived && <small>{item.derived.project} · {item.derived.topic}</small>}</div>)}</section>}
    </div>
  </main>;
}
