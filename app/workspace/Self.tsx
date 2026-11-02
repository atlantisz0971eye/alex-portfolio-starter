"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseResponse } from "./api";
import { readJournalFiles } from "./journalParse";

type Kind = "theme" | "image" | "feeling" | "person" | "place" | "author";
type Node = { id: string; label: string; kind: Kind; count: number; score: number; first: string; last: string; peak: string; pieceIds: string[]; x: number; y: number };
type Edge = { a: string; b: string; weight: number };
type Portrait = { generatedAt: string; summary: string; sections: { heading: string; text: string; evidence: string[] }[] };
type Data = { total: number; read: number; from: string; to: string; nodes: Node[]; edges: Edge[]; portrait: Portrait | null; dropped: number; updatedAt: string; cited: { id: string; at: string; text: string; type?: string }[] };
type Piece = { id: string; at: string; title?: string; text: string; type?: string };

const KINDS: Kind[] = ["theme", "image", "feeling", "person", "place", "author"];
const ERRORS: Record<string, string> = { gemini_not_configured: "Gemini is not set up on this deployment (GEMINI_API_KEY).", gemini_forbidden: "Gemini refused the request. Check the key and its billing.", gemini_billing: "Gemini needs billing turned on for this key.", gemini_failed: "Gemini did not answer. Try again.", ai_quota: "Today’s AI allowance is used up." };
const W = 1000, H = 600, ML = 28, MR = 28, MT = 18, MB = 34;
const day = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

async function call<T>(body: object): Promise<T> {
  const response = await fetch("/api/workspace/self", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string; message?: string }; throw new Error(ERRORS[data.error ?? ""] ?? data.message ?? "Something went wrong."); }
  return response.json() as Promise<T>;
}

/** The network of concepts across the years: where each one lives in time, and what it keeps company with. Built from the writing, read-only. */
function SelfMap({ data, shown, selected, onSelect }: { data: Data; shown: Set<Kind>; selected: string | null; onSelect: (id: string | null) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const nodes = useMemo(() => data.nodes.filter((node) => shown.has(node.kind)), [data.nodes, shown]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const t0 = Date.parse(data.from), t1 = Date.parse(data.to), span = Math.max(1, t1 - t0);
  const px = (t: number) => ML + ((t - t0) / span) * (W - ML - MR);
  const py = (y: number) => MT + y * (H - MT - MB);
  const focus = hover ?? selected;
  const near = useMemo(() => { const set = new Set<string>(); if (focus) { set.add(focus); for (const edge of data.edges) { if (edge.a === focus) set.add(edge.b); if (edge.b === focus) set.add(edge.a); } } return set; }, [focus, data.edges]);
  const labelled = useMemo(() => new Set([...nodes].sort((a, b) => b.score - a.score).slice(0, 26).map((node) => node.id)), [nodes]);
  const years: number[] = []; for (let y = new Date(t0).getUTCFullYear() + 1; y <= new Date(t1).getUTCFullYear(); y += 1) years.push(y);
  return <svg className="self__map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Network of recurring themes and images over time" onClick={() => onSelect(null)}>
    {years.map((year) => { const x = px(Date.UTC(year, 0, 1)); return <g key={year} className="self__year"><line x1={x} x2={x} y1={MT} y2={H - MB} /><text x={x + 4} y={H - 14}>{year}</text></g>; })}
    {data.edges.slice(0, 220).map((edge) => { const a = byId.get(edge.a), b = byId.get(edge.b); if (!a || !b) return null; const lit = focus && (edge.a === focus || edge.b === focus); return <line key={`${edge.a}|${edge.b}`} className={`self__edge${lit ? " is-lit" : ""}`} x1={px(Date.parse(a.first) / 2 + Date.parse(a.last) / 2)} y1={py(a.y)} x2={px(Date.parse(b.first) / 2 + Date.parse(b.last) / 2)} y2={py(b.y)} strokeWidth={0.5 + Math.min(3, edge.weight * 0.35)} />; })}
    {nodes.map((node) => {
      const x0 = px(Date.parse(node.first)), x1 = px(Date.parse(node.last)), cx = px(Date.parse(node.first) / 2 + Date.parse(node.last) / 2), cy = py(node.y), size = 5 + Math.sqrt(node.score) * 2.4;
      const dim = focus && !near.has(node.id);
      return <g key={node.id} className={`self__node self__node--${node.kind}${dim ? " is-dim" : ""}${selected === node.id ? " is-selected" : ""}`} onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(null)} onClick={(event) => { event.stopPropagation(); onSelect(selected === node.id ? null : node.id); }} tabIndex={0} role="button" aria-label={`${node.label}, ${node.count} pieces`} onKeyDown={(event) => { if (event.key === "Enter") onSelect(node.id); }}>
        {x1 - x0 > 2 && <line className="self__span" x1={x0} x2={x1} y1={cy} y2={cy} />}
        <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} />
        {(labelled.has(node.id) || near.has(node.id) || selected === node.id) && <text x={cx + size / 2 + 4} y={cy + 4}>{node.label}</text>}
      </g>;
    })}
  </svg>;
}

export function Self({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [shown, setShown] = useState<Set<Kind>>(new Set(KINDS));
  const [selected, setSelected] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setData(await parseResponse<Data>(await fetch("/api/workspace/self", { cache: "no-store" }))); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Could not load."); setData((current) => current ?? { total: 0, read: 0, from: "", to: "", nodes: [], edges: [], portrait: null, dropped: 0, updatedAt: "", cited: [] }); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setPieces(null);
    if (!selected) return;
    let live = true;
    void fetch(`/api/workspace/self?node=${encodeURIComponent(selected)}`, { cache: "no-store" }).then((r) => r.json()).then((d: { pieces?: Piece[] }) => { if (live) setPieces(d.pieces ?? []); }).catch(() => undefined);
    return () => { live = false; };
  }, [selected]);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    try { await work(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setBusy(""); setNote(""); await load(); }
  }

  const readAndBuild = async () => {
    for (;;) {
      const { read, total } = await call<{ read: number; total: number }>({ action: "analyze" });
      setNote(`Reading ${read} of ${total}…`);
      if (read >= total) break;
    }
    setNote("Building the network and the portrait…");
    await call({ action: "build" });
  };

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    await run("import", async () => {
      setNote("Opening the files…");
      const report = await readJournalFiles([...list]);
      let added = 0;
      for (let at = 0; at < report.pieces.length; at += 40) {
        const result = await call<{ added: number }>({ action: "import", pieces: report.pieces.slice(at, at + 40) });
        added += result.added;
        setNote(`Saving ${Math.min(at + 40, report.pieces.length)} of ${report.pieces.length}…`);
      }
      onError(`${report.files} files, ${report.pieces.length} entries with a date (${added} new)${report.undated ? `, ${report.undated} skipped for having no date` : ""}.`);
      await readAndBuild();
    });
    if (file.current) file.current.value = "";
  }

  const toggle = (kind: Kind) => setShown((current) => { const next = new Set(current); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; });
  const node = data?.nodes.find((item) => item.id === selected) ?? null;
  const cited = useMemo(() => new Map((data?.cited ?? []).map((item) => [item.id, item])), [data]);
  const working = !!busy;

  return <div className="self">
    <input ref={file} type="file" accept=".zip,.html,.htm,.txt,.md" multiple hidden onChange={(event) => void pick(event.target.files)} />
    <p className="self__lead">Your writing over the years, read by Gemini and drawn as a network: where each theme and image lives in time, and what it keeps company with. Photos and recordings never leave your device; only the text and the date are sent.</p>
    <div className="self__actions">
      <button type="button" className="ws-text-button" disabled={working} onClick={() => file.current?.click()}>import journal (.zip, .html, .txt)</button>
      {data && data.total > data.read && <button type="button" className="ws-text-button" disabled={working} onClick={() => void run("read", readAndBuild)}>continue reading ({data.read}/{data.total})</button>}
      {data && data.total > 0 && <button type="button" className="ws-text-button" disabled={working} onClick={() => void run("build", async () => { setNote("Building…"); await call({ action: "build" }); })}>rebuild</button>}
      {data && data.total > 0 && <button type="button" className="ws-text-button" disabled={working} onClick={() => { if (window.confirm("Delete the imported writing and everything made from it? Your Journal itself is not touched.")) void run("wipe", async () => { await call({ action: "wipe" }); setSelected(null); }); }}>delete all</button>}
      {working && <span className="self__busy"><Loader2 className="ws-spin" size={14} /> {note || "Working…"}</span>}
    </div>

    {data === null && <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Loading…</p>}
    {data && data.total === 0 && !working && <p className="mind__empty">Nothing imported yet. On your iPhone: Settings → Apps → Journal → Export all Journal Entries, then choose the ZIP here.</p>}

    {data?.portrait && <section className="self__portrait">
      {data.portrait.summary && <p className="mind__overview">{data.portrait.summary}</p>}
      {data.portrait.sections.map((section) => <div key={section.heading} className="self__section">
        <h2 className="section-label">{section.heading}</h2>
        <p>{section.text}</p>
        {section.evidence.map((id) => cited.get(id) && <small key={id} className="self__cite">{day.format(new Date(cited.get(id)!.at))} · {cited.get(id)!.type} — {cited.get(id)!.text}</small>)}
      </div>)}
      <small className="self__note">A reading, not a verdict: made from {data.read} pieces, {data.from.slice(0, 4)}–{data.to.slice(0, 4)}.</small>
    </section>}

    {data && data.nodes.length > 0 && <section>
      <div className="mail-chips self__kinds" role="group" aria-label="What to show">
        {KINDS.map((kind) => <button key={kind} type="button" className={shown.has(kind) ? "is-on" : ""} onClick={() => toggle(kind)}>{kind}</button>)}
      </div>
      <SelfMap data={data} shown={shown} selected={selected} onSelect={setSelected} />
      <small className="self__note">Left to right is time. A square sits at the middle of the years a concept appears in; the line is how long it lasted; bigger means more of your writing. {data.dropped > 0 && `${data.dropped} concepts that appear only once are left out.`}</small>
    </section>}

    {node && <section className="self__detail">
      <h2 className="section-label">{node.label} <span>{node.kind} · {node.count} pieces · {node.first.slice(0, 4)}–{node.last.slice(0, 4)}, most in {node.peak}</span></h2>
      <button type="button" className="ws-text-button" onClick={() => void run("hide", async () => { await call({ action: "hide", id: node.id }); setSelected(null); })}>hide this concept</button>
      {pieces === null ? <p className="ws-muted"><Loader2 className="ws-spin" size={14} /></p> : pieces.map((piece) => <details key={piece.id} className="mind__entry"><summary><span className="mind__kind">{piece.type ?? ""}</span><span className="mind__title">{piece.title || piece.text.replace(/\s+/g, " ").slice(0, 60)}</span><time>{day.format(new Date(piece.at))}</time></summary><p>{piece.text}</p></details>)}
    </section>}
  </div>;
}
