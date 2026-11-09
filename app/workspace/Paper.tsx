"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseResponse } from "./api";
import { keepInNotebook } from "./keep";
import { notice } from "./notice";

type Item = { id: string; title: string; zh: string; summary: string; note: string; source: string; url: string; published: string | null };
type Section = { key: string; label: string; zh: string; items: Item[] };
type Bridge = { text: string; basis: string; links: { title: string; source: string; url: string }[] };
type Edition = { generatedAt: string; date: string; sections: Section[]; bridge: Bridge | null; summarised: boolean };

const stamp = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ago(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/** The front page: five columns of stories, each with its own link, and a line across the columns when two of them are really connected. */
export function Paper({ onError }: { onError: (message: string) => void }) {
  const [edition, setEdition] = useState<Edition | null | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const tries = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await parseResponse<{ edition: Edition | null }>(await fetch("/api/workspace/news", { cache: "no-store" }));
      setEdition(data.edition);
      return data.edition;
    } catch {
      setEdition((current) => current ?? null);
      return null;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // A missing or old edition is being made in the background; look again a few times.
  useEffect(() => {
    if (edition === undefined) return;
    const old = !edition || Date.now() - Date.parse(edition.generatedAt) > 9 * 3_600_000;
    if (!old || tries.current >= 4) return;
    const timer = setTimeout(() => { tries.current += 1; void load(); }, 25_000);
    return () => clearTimeout(timer);
  }, [edition, load]);

  async function renew() {
    if (working) return;
    setWorking(true);
    try {
      const data = await parseResponse<{ edition: Edition }>(await fetch("/api/workspace/news", { method: "POST" }));
      setEdition(data.edition);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not make a new edition.");
    } finally {
      setWorking(false);
    }
  }

  const keep = (item: Item) => void keepInNotebook(`${item.zh}\n${item.summary}\n${item.source} · ${item.url}`).then(() => notice("Kept in your notebook.")).catch((cause) => onError(cause instanceof Error ? cause.message : "Could not keep it."));

  return <section className="paper" aria-label="Front page">
    <div className="paper__bar">
      <span>{edition ? `EDITION ${stamp.format(new Date(edition.generatedAt))}` : "EDITION"}</span>
      <button type="button" className="ws-text-button" onClick={() => void renew()} disabled={working} aria-label="Make a new edition">{working ? <Loader2 className="ws-spin" size={14} /> : <RefreshCw size={14} />} renew</button>
    </div>

    {edition === undefined && <p className="paper__note"><Loader2 className="ws-spin" size={14} /> Opening the paper…</p>}
    {edition === null && <p className="paper__note">The paper for this hour is being set. It shows up here in a minute.</p>}
    {edition && !edition.summarised && <p className="paper__note">The summaries are unavailable right now; headlines are shown as published.</p>}

    {edition && <>
      <div className="paper__cols">
        {edition.sections.map((section) => <section key={section.key} className="paper__col" data-section={section.key}>
          <h2 className="paper__label">{section.label}<span>{section.zh}{section.key === "random" ? " · 抽签" : ""}</span></h2>
          {section.items.length === 0 ? <p className="paper__none">Nothing fresh from these sources.</p> : section.items.map((item, index) => <article key={item.id} className={index === 0 ? "paper__story is-lead" : "paper__story"}>
            <h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.zh}</a></h3>
            <p>{item.summary}</p>
            <small>{item.source}{item.note ? ` · ${item.note}` : ""}{item.published ? ` · ${ago(item.published)}` : ""} <button type="button" className="paper__keep" onClick={() => keep(item)}>keep</button></small>
          </article>)}
        </section>)}
      </div>

      {edition.bridge && <aside className="paper__bridge" aria-label="A connection across columns">
        <h2 className="paper__label">BRIDGE<span>{edition.bridge.basis}</span></h2>
        <p>{edition.bridge.text}</p>
        <small>{edition.bridge.links.map((link, index) => <span key={link.url}>{index > 0 && " ↔ "}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.source}: {link.title}</a></span>)}</small>
      </aside>}
    </>}
  </section>;
}
