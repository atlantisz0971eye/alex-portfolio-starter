"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { lump, pixelsOf, W as SW, H as SH, yak } from "../lib/carcosa/sprite";
import { Swarm, type Dot } from "../lib/carcosa/swarm";
import { ThemeContext } from "./Shell";

/**
 * Carcosa, the creature that lives in the Carcosa tab. She eats what the development ledger records (synced changes,
 * commits, deploys), learns the owner's routine from when that happens, and shows it back: eating, a well-fed yak, a
 * hungry dried lump, or asleep outside the usual hours; and a sky of twin suns while work keeps its usual shape, the
 * black star when it has clearly left it, both while it drifts. The sky also drives the "auto" theme.
 */
export type Phase = "eating" | "sleeping" | "yak" | "lump";
export type Sky = "suns" | "both" | "star";
type Bite = { at: string; kind: "sync" | "commit" | "deploy" | "tick"; label: string; value: number };
type Signal = { key: string; level: "both" | "star"; text: string };
export type Creature = {
  phase: Phase; sky: Sky; theme: "light" | "dark"; satiety: number; lastFedAt: string | null;
  routine: { hours: number[]; start: number | null; end: number | null; days: number; medianLoad: number };
  today: { day: string; load: number; firstAt: string | null; lastAt: string | null };
  streak: number; signals: Signal[]; bites: Bite[]; learning: boolean; dream: string | null;
};
type Ctx = { creature: Creature | null; requestDream: () => Promise<string | null>; reload: () => void };

const CarcosaContext = createContext<Ctx>({ creature: null, requestDream: async () => null, reload: () => undefined });
export const useCarcosa = () => useContext(CarcosaContext);

const TEN_MINUTES = 10 * 60_000;

export function CarcosaProvider({ children }: { children: ReactNode }) {
  const [creature, setCreature] = useState<Creature | null>(null);
  const loadedAt = useRef(0);
  const { reportAuto } = useContext(ThemeContext);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace/carcosa", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as Creature;
      loadedAt.current = Date.now();
      setCreature(data);
    } catch { /* she can wait */ }
  }, []);

  // the same beat as the scheduled check: every ten minutes, and when the tab comes back after a while
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), TEN_MINUTES);
    const back = () => { if (document.visibilityState === "visible" && Date.now() - loadedAt.current > 2 * 60_000) void load(); };
    document.addEventListener("visibilitychange", back);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [load]);
  useEffect(() => { if (creature) reportAuto(creature.theme); }, [creature, reportAuto]);

  const requestDream = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace/carcosa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dream" }) });
      const data = await response.json() as { dream?: string | null };
      if (data.dream) setCreature((c) => (c ? { ...c, dream: data.dream ?? null } : c));
      return data.dream ?? null;
    } catch { return null; }
  }, []);

  const value = useMemo<Ctx>(() => ({ creature, requestDream, reload: () => void load() }), [creature, requestDream, load]);
  return <CarcosaContext.Provider value={value}>{children}</CarcosaContext.Provider>;
}

const HEART = ["..XX.XX..", ".XXXXXXX.", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."];
const ZED = ["XXXX", "..X.", ".X..", "XXXX"];
const SCALE = 2;
const SIGN = "have you seen the sign?";
const FOOD: [number, number, number] = [150, 150, 145];

type Paint = (x: number, y: number, rgb: [number, number, number]) => void;
const stamp = (put: Paint, rows: string[], ox: number, oy: number, scale: number) => {
  for (const p of pixelsOf(rows)) for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) put(ox + p.x * scale + dx, oy + p.y * scale + dy, p.rgb);
};

/** The scene: the creature in her phase under her sky. Click the yak to pet her; click the black star for the day's dream. */
function Scene({ creature }: { creature: Creature }) {
  const { requestDream } = useCarcosa();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [say, setSay] = useState("");
  const [typed, setTyped] = useState("");
  const [waiting, setWaiting] = useState(false);
  const maskUntil = useRef(0);
  const petUntil = useRef(0);
  const hearts = useRef<{ x: number; y: number; born: number }[]>([]);
  const geo = { gw: 130, gh: 75, ground: 62 };
  const { phase } = creature;
  const big = phase === "yak" || (phase === "sleeping" && creature.satiety >= 0.5);
  const yakAt = { x: Math.floor(geo.gw / 2 - (SW * SCALE) / 2), y: geo.ground - SH * SCALE };
  const lumpAt = { x: Math.floor(geo.gw / 2 - SW / 2) - 2, y: geo.ground - SH + 1 };

  useEffect(() => {
    const c = canvas.current!; c.width = geo.gw; c.height = geo.gh;
    const ctx = c.getContext("2d")!;
    // the lump gathers itself into the yak once, when she is first seen well fed
    let swarm: Swarm | null = null;
    if (big) {
      const from: Dot[] = pixelsOf(lump()).map((p) => ({ x: lumpAt.x + p.x, y: lumpAt.y + p.y, rgb: p.rgb }));
      const to: Dot[] = [];
      for (const p of pixelsOf(yak(0))) for (let dy = 0; dy < SCALE; dy += 1) for (let dx = 0; dx < SCALE; dx += 1) to.push({ x: yakAt.x + p.x * SCALE + dx, y: yakAt.y + p.y * SCALE + dy, rgb: p.rgb });
      swarm = new Swarm(from, to);
    }
    const crumbs = Array.from({ length: 14 }, (_, i) => ({ side: i % 2 ? 1 : -1, y: geo.ground - 4 - ((i * 7) % 16), phase: (i * 0.137) % 1 }));
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const img = ctx.createImageData(geo.gw, geo.gh); const buf = img.data;
      const put: Paint = (x, y, rgb) => { if (x < 0 || y < 0 || x >= geo.gw || y >= geo.gh) return; const i = (y * geo.gw + x) * 4; buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255; };
      if (swarm && !swarm.done) { swarm.step(0.02); swarm.render(buf, geo.gw, geo.gh); }
      else if (big) {
        const asleep = phase === "sleeping";
        const hop = !asleep && t < petUntil.current ? -Math.round(Math.abs(Math.sin((petUntil.current - t) / 90)) * 3 * SCALE) : 0;
        const bob = asleep ? 0 : Math.floor(t / 900) % 2;
        stamp(put, yak(asleep ? 0 : ((Math.floor(t / 420) % 2) as 0 | 1), asleep || t % 4200 < 140, t < maskUntil.current), yakAt.x, yakAt.y + hop + bob, SCALE);
      } else {
        // the lump breathes a little while it eats, and not at all while it sleeps
        const breathe = phase === "eating" ? Math.floor(t / 500) % 2 : 0;
        stamp(put, lump(), lumpAt.x, lumpAt.y - breathe, 1);
      }
      if (phase === "eating") {
        // crumbs of the day's work drift in from both sides and vanish into her
        const cx = geo.gw / 2;
        for (const c0 of crumbs) {
          const k = ((t / 2600) + c0.phase) % 1;
          const x = Math.round(cx + c0.side * (1 - k) * (geo.gw / 2 - 4) + c0.side * (big ? 18 : 10) * k * -0.2);
          if (Math.abs(x - cx) < (big ? 20 : 12)) continue;
          put(x, c0.y + Math.round(Math.sin(k * 6.28) * 2), FOOD);
        }
      }
      if (phase === "sleeping") {
        const k = (t % 3000) / 3000;
        const zx = (big ? yakAt.x + SW * SCALE - 8 : lumpAt.x + SW - 4) + Math.round(k * 6);
        const zy = (big ? yakAt.y + 4 : lumpAt.y + 4) - Math.round(k * 14);
        ZED.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "X") put(zx + x, zy + y, [140, 140, 136]); }));
      }
      hearts.current = hearts.current.filter((h) => t - h.born < 1400);
      for (const h of hearts.current) { if (t < h.born) continue; const y0 = Math.round(h.y - ((t - h.born) / 1400) * 18 * SCALE); HEART.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "X") put(h.x + x - 4, y0 + y, [226, 130, 130]); })); }
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // geometry is constant; the scene restarts only when her form changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, big]);

  const dream = creature.dream;
  useEffect(() => {
    if (!dream || !say) { setTyped(""); return; }
    let i = 0; setTyped("");
    const timer = window.setInterval(() => { i += 1; setTyped(dream.slice(0, i)); if (i >= dream.length) window.clearInterval(timer); }, 45);
    return () => window.clearInterval(timer);
  }, [dream, say]);

  const pet = () => {
    if (!big || phase === "sleeping") return;
    petUntil.current = performance.now() + 700;
    for (let i = 0; i < 3; i += 1) hearts.current.push({ x: yakAt.x + SW * SCALE * 0.6 + (i - 1) * 7, y: yakAt.y - 2 - i * 3, born: performance.now() + i * 120 });
  };
  const sign = async () => {
    maskUntil.current = performance.now() + 2400;
    setSay(SIGN);
    if (!dream) { setWaiting(true); await requestDream(); setWaiting(false); }
  };

  const sunsUp = creature.sky !== "star";
  const starUp = creature.sky !== "suns";
  return <div className="carcosa-scene" data-sky={creature.sky}>
    <canvas ref={canvas} className="carcosa-canvas" aria-hidden="true" />
    <div className="carcosa-ground" />
    {[1, 2].map((n) => <div key={n} className={`carcosa-sun${n === 2 ? " carcosa-sun--2" : ""}${sunsUp ? " is-up" : ""}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={sunsUp ? "M12 1a11 11 0 1 0 0.01 0Z" : "M1 12a11 11 0 0 1 22 0Z"} /></svg></div>)}
    <button type="button" className={`carcosa-star${starUp ? " is-up" : ""}`} aria-label="A black star" onClick={() => void sign()}><svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,1 14.8,9 23,9 16.4,14 19,22.5 12,17.5 5,22.5 7.6,14 1,9 9.2,9" /></svg></button>
    <button type="button" className="carcosa-yak" aria-label="Carcosa" onClick={pet} />
    {say && <p className="carcosa-say">{say}</p>}
    {say && (waiting ? <p className="carcosa-dream">……</p> : typed && <p className="carcosa-dream">{typed}</p>)}
  </div>;
}

const PHASE: Record<Phase, string> = { eating: "正在吃", yak: "吃饱了，是牦牛", lump: "饿了，干成一团菌核", sleeping: "睡着了" };
const SKY: Record<Sky, string> = { suns: "双日 · 节律如常", both: "双日与黑星同框 · 在偏离", star: "黑星 · 已经离开平时的样子" };
const clock = (s: number | null) => { if (s === null) return "—"; const t = (s + 5) % 24; return `${String(Math.floor(t)).padStart(2, "0")}:${String(Math.round((t % 1) * 60) % 60).padStart(2, "0")}`; };
const when = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** The routine as a strip of 24 hours (from 05:00), the usual window marked, and now. */
function Routine({ creature }: { creature: Creature }) {
  const { hours, start, end } = creature.routine;
  const max = Math.max(...hours, 0.0001);
  const order = Array.from({ length: 24 }, (_, i) => (i + 5) % 24);
  const nowH = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" });
  return <div className="carcosa-routine" aria-label="When you usually work">
    <div className="carcosa-routine__bars">
      {order.map((h, i) => { const inside = start !== null && end !== null && i + 0.5 >= start && i + 0.5 <= end; return <span key={h} data-in={inside || undefined} data-now={Number(nowH) === h || undefined} style={{ height: `${Math.max(4, (hours[h] / max) * 100)}%` }} title={`${String(h).padStart(2, "0")}:00`} />; })}
    </div>
    <div className="carcosa-routine__axis"><span>05</span><span>11</span><span>17</span><span>23</span><span>05</span></div>
  </div>;
}

/** The pet's page in the Carcosa tab. */
export function CarcosaPet() {
  const { creature, reload } = useCarcosa();
  if (!creature) return <section className="is-embedded"><p className="carcosa-muted">Carcosa is waking…</p></section>;
  const c = creature;
  return <section className="is-embedded carcosa-pet">
    <div className="carcosa-pet__top">
      <Scene creature={c} />
      <div className="carcosa-pet__state">
        <p className="carcosa-pet__phase">{PHASE[c.phase]}</p>
        <p className="carcosa-muted">{SKY[c.sky]}</p>
        <div className="carcosa-meter" aria-label={`Fed ${Math.round(c.satiety * 100)}%`}><span style={{ width: `${Math.round(c.satiety * 100)}%` }} /></div>
        <p className="carcosa-muted">饱 {Math.round(c.satiety * 100)}%{c.lastFedAt ? ` · 上次喂食 ${when.format(new Date(c.lastFedAt))}` : ""}</p>
        {c.signals.length > 0 && <ul className="carcosa-signals">{c.signals.map((s) => <li key={s.key} data-level={s.level}>{s.text}</li>)}</ul>}
        <button type="button" className="ws-text-button" onClick={reload}>look again</button>
      </div>
    </div>

    <h2 className="section-label">routine</h2>
    <p className="carcosa-muted">{c.learning ? `还在学你的作息（已看过 ${c.routine.days} 天，满 5 天开始判断）。` : `从最近 ${c.routine.days} 个工作日学到：通常 ${clock(c.routine.start)} 开始，${clock(c.routine.end)} 收工；一天大约吃 ${c.routine.medianLoad}。`}{` 今天 ${c.today.firstAt ?? "还没开始"}${c.today.lastAt && c.today.lastAt !== c.today.firstAt ? `–${c.today.lastAt}` : ""}，吃了 ${c.today.load}；连续 ${c.streak} 天。`}</p>
    <Routine creature={c} />

    <h2 className="section-label">what she ate</h2>
    <p className="carcosa-muted">提交 3 · 同步每个文件 0.4（最多 12 个）· 勾选每项 1 · 生产部署 2；六小时消化一半。</p>
    {c.bites.length === 0 ? <p className="carcosa-muted">Nothing yet.</p> : <ul className="carcosa-audit">{c.bites.map((b, n) => <li key={n}><time>{day.format(new Date(b.at))}</time> <b>+{Math.round(b.value * 10) / 10}</b> {b.label}</li>)}</ul>}
  </section>;
}
