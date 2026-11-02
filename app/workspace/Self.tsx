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
const SIZE = 1000, C = SIZE / 2, R0 = 90, R1 = 440;
const day = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

async function call<T>(body: object): Promise<T> {
  const response = await fetch("/api/workspace/self", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string; message?: string }; throw new Error(ERRORS[data.error ?? ""] ?? data.message ?? "Something went wrong."); }
  return response.json() as Promise<T>;
}

const hash = (text: string) => { let h = 2166136261; for (const ch of text) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
const TAU = Math.PI * 2;

type Planet = Node & { cx: number; cy: number; r: number; angle: number; size: number; spokeIn: number; spokeOut: number };

/** Orbits: one ring per year (earliest inside), each concept on the ring of the year it appears most, kinds grouped in sectors, related concepts drawn toward each other. */
function orbit(nodes: Node[], edges: Edge[], from: string, to: string) {
  const y0 = new Date(from).getUTCFullYear(), y1 = new Date(to).getUTCFullYear();
  const radius = (year: number) => (y1 === y0 ? (R0 + R1) / 2 : R0 + ((Math.min(y1, Math.max(y0, year)) - y0) / (y1 - y0)) * (R1 - R0));
  const planets: Planet[] = nodes.map((node) => {
    const sector = (KINDS.indexOf(node.kind) / KINDS.length) * TAU - Math.PI / 2;
    return { ...node, r: radius(+node.peak), angle: sector + (hash(node.id) - 0.5) * (TAU / KINDS.length) * 0.9, cx: 0, cy: 0, size: 4 + Math.sqrt(node.score) * 1.7, spokeIn: radius(+node.first.slice(0, 4)), spokeOut: radius(+node.last.slice(0, 4)) };
  });
  const index = new Map(planets.map((planet, i) => [planet.id, i]));
  const place = (p: Planet) => { p.cx = C + p.r * Math.cos(p.angle); p.cy = C + p.r * Math.sin(p.angle); };
  for (let step = 0; step < 320; step += 1) {
    const da = planets.map(() => 0);
    planets.forEach(place);
    for (let i = 0; i < planets.length; i += 1) for (let j = i + 1; j < planets.length; j += 1) {
      const d = Math.hypot(planets[i].cx - planets[j].cx, planets[i].cy - planets[j].cy) + 0.01;
      const min = planets[i].size + planets[j].size + 22;
      if (d < min) { let delta = planets[i].angle - planets[j].angle; delta = Math.atan2(Math.sin(delta), Math.cos(delta)); const dir = Math.abs(delta) < 1e-4 ? (hash(planets[i].id + planets[j].id) < 0.5 ? -1 : 1) : Math.sign(delta); const push = ((min - d) / planets[i].r) * 0.5 * dir; da[i] += push; da[j] -= push; }
    }
    for (const edge of edges) { const i = index.get(edge.a), j = index.get(edge.b); if (i === undefined || j === undefined) continue; let delta = planets[j].angle - planets[i].angle; delta = Math.atan2(Math.sin(delta), Math.cos(delta)); const pull = delta * 0.0007 * Math.min(3, edge.weight); da[i] += pull; da[j] -= pull; }
    // Kinds keep to their own part of the sky: a gentle spring back toward the sector each one started in.
    planets.forEach((planet, i) => { const home = (KINDS.indexOf(planet.kind) / KINDS.length) * TAU - Math.PI / 2; da[i] += Math.atan2(Math.sin(home - planet.angle), Math.cos(home - planet.angle)) * 0.012; planet.angle += da[i]; });
  }
  planets.forEach(place);
  return { planets, rings: Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ year: y0 + i, r: radius(y0 + i) })) };
}

/** The writing as a small solar system: rings are years, planets are the themes and images that return, and what keeps company is joined by a soft arc. */
function OrbitMap({ data, shown, selected, onSelect }: { data: Data; shown: Set<Kind>; selected: string | null; onSelect: (id: string | null) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const { planets, rings } = useMemo(() => orbit(data.nodes, data.edges, data.from, data.to), [data.nodes, data.edges, data.from, data.to]);
  const visible = useMemo(() => planets.filter((planet) => shown.has(planet.kind)), [planets, shown]);
  const byId = useMemo(() => new Map(visible.map((planet) => [planet.id, planet])), [visible]);
  const focus = hover ?? selected;
  const near = useMemo(() => { const set = new Set<string>(); if (focus) { set.add(focus); for (const edge of data.edges) { if (edge.a === focus) set.add(edge.b); if (edge.b === focus) set.add(edge.a); } } return set; }, [focus, data.edges]);
  const labelled = useMemo(() => new Set([...visible].sort((a, b) => b.score - a.score).slice(0, 20).map((planet) => planet.id)), [visible]);
  const arc = (a: Planet, b: Planet) => { const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2; return `M${a.cx.toFixed(1)} ${a.cy.toFixed(1)} Q${(mx + (C - mx) * 0.4).toFixed(1)} ${(my + (C - my) * 0.4).toFixed(1)} ${b.cx.toFixed(1)} ${b.cy.toFixed(1)}`; };
  return <svg className="self__map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Orbits of recurring themes and images, one ring per year" onClick={() => onSelect(null)}>
    <circle className="self__sun" cx={C} cy={C} r={7} /><circle className="self__sunhalo" cx={C} cy={C} r={26} />
    {rings.map((ring) => <g key={ring.year} className="self__ring"><circle cx={C} cy={C} r={ring.r} /><text x={C} y={C - ring.r - 5} textAnchor="middle">{ring.year}</text></g>)}
    {data.edges.slice(0, 90).map((edge) => { const a = byId.get(edge.a), b = byId.get(edge.b); if (!a || !b) return null; const lit = focus && (edge.a === focus || edge.b === focus); return <path key={`${edge.a}|${edge.b}`} className={`self__edge${lit ? " is-lit" : ""}`} d={arc(a, b)} strokeWidth={0.6 + Math.min(1.6, edge.weight * 0.2)} />; })}
    {visible.map((planet) => {
      const dim = focus && !near.has(planet.id); const out = Math.cos(planet.angle) >= 0;
      return <g key={planet.id} className={`self__node self__node--${planet.kind}${dim ? " is-dim" : ""}${selected === planet.id ? " is-selected" : ""}`} onMouseEnter={() => setHover(planet.id)} onMouseLeave={() => setHover(null)} onClick={(event) => { event.stopPropagation(); onSelect(selected === planet.id ? null : planet.id); }} tabIndex={0} role="button" aria-label={`${planet.label}, ${planet.count} pieces`} onKeyDown={(event) => { if (event.key === "Enter") onSelect(planet.id); }}>
        {planet.spokeOut - planet.spokeIn > 2 && <line className="self__trail" x1={C + planet.spokeIn * Math.cos(planet.angle)} y1={C + planet.spokeIn * Math.sin(planet.angle)} x2={C + planet.spokeOut * Math.cos(planet.angle)} y2={C + planet.spokeOut * Math.sin(planet.angle)} />}
        <circle className="self__halo" cx={planet.cx} cy={planet.cy} r={planet.size * 2.1} />
        <circle className="self__core" cx={planet.cx} cy={planet.cy} r={planet.size} />
        {(labelled.has(planet.id) || near.has(planet.id) || selected === planet.id) && <text x={planet.cx + (out ? 1 : -1) * (planet.size + 7)} y={planet.cy + 4} textAnchor={out ? "start" : "end"}>{planet.label}</text>}
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
      <OrbitMap data={data} shown={shown} selected={selected} onSelect={setSelected} />
      <small className="self__note">Each ring is a year, the earliest inside. A planet rests on the year a concept appears most; the thin line along its direction shows the years it lasted; bigger means more of your writing, and kinds gather in their own part of the sky. {data.dropped > 0 && `${data.dropped} concepts that appear only once are left out.`}</small>
    </section>}

    {node && <section className="self__detail">
      <h2 className="section-label">{node.label} <span>{node.kind} · {node.count} pieces · {node.first.slice(0, 4)}–{node.last.slice(0, 4)}, most in {node.peak}</span></h2>
      <button type="button" className="ws-text-button" onClick={() => void run("hide", async () => { await call({ action: "hide", id: node.id }); setSelected(null); })}>hide this concept</button>
      {pieces === null ? <p className="ws-muted"><Loader2 className="ws-spin" size={14} /></p> : pieces.map((piece) => <details key={piece.id} className="mind__entry"><summary><span className="mind__kind">{piece.type ?? ""}</span><span className="mind__title">{piece.title || piece.text.replace(/\s+/g, " ").slice(0, 60)}</span><time>{day.format(new Date(piece.at))}</time></summary><p>{piece.text}</p></details>)}
    </section>}
  </div>;
}
