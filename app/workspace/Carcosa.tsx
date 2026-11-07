"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { drawGauge, drawVein, freshness, HOT, type Ink } from "../lib/carcosa/gauge";
import { lump, pixelsOf, W as SW, H as SH, yak } from "../lib/carcosa/sprite";
import { Swarm, type Dot } from "../lib/carcosa/swarm";
import { ThemeContext } from "./Shell";

/**
 * Carcosa, the creature that lives on the workspace: a grey hairline under the corner strip that is the day's hot
 * information (mail, the front page, the plan, devlog entries) still unread and fresh. When all of it is eaten the line
 * dries into a lump, and only then, opening the index, the lump becomes a small yak.
 */
type Kind = "mail" | "news" | "plan" | "devlog";
export type CarcosaItem = { id: string; kind: Kind; title: string; arrived: number; eaten: number | null };
type Ctx = { items: CarcosaItem[]; left: number; total: number; fill: number; dormant: boolean; dream: string | null; eat: (ids: string[]) => void; eatKind: (kind: Kind) => void; requestDream: () => Promise<string | null> };

const CarcosaContext = createContext<Ctx>({ items: [], left: 0, total: 0, fill: 0, dormant: false, dream: null, eat: () => undefined, eatKind: () => undefined, requestDream: async () => null });
export const useCarcosa = () => useContext(CarcosaContext);

const TEN_MINUTES = 10 * 60_000;

export function CarcosaProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CarcosaItem[]>([]);
  const [dream, setDream] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const loadedAt = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace/carcosa", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { items: CarcosaItem[]; dream: string | null };
      setItems(data.items); setDream(data.dream); loadedAt.current = Date.now(); setNow(Date.now());
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

  const eat = useCallback((ids: string[]) => {
    let fresh: string[] = [];
    setItems((current) => {
      fresh = ids.filter((id) => current.some((item) => item.id === id && !item.eaten));
      return fresh.length ? current.map((item) => (fresh.includes(item.id) ? { ...item, eaten: Date.now() } : item)) : current;
    });
    queueMicrotask(() => {
      if (!fresh.length) return;
      void fetch("/api/workspace/carcosa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "eat", ids: fresh }) }).catch(() => undefined);
    });
  }, []);
  const itemsRef = useRef(items); itemsRef.current = items;
  const eatKind = useCallback((kind: Kind) => eat(itemsRef.current.filter((item) => item.kind === kind && !item.eaten).map((item) => item.id)), [eat]);

  const requestDream = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace/carcosa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dream" }) });
      const data = await response.json() as { dream?: string | null };
      if (data.dream) setDream(data.dream);
      return data.dream ?? null;
    } catch { return null; }
  }, []);

  const value = useMemo<Ctx>(() => {
    const f = items.map((item) => freshness({ id: item.id, arrived: item.arrived, read: !!item.eaten }, now));
    const left = f.filter((v) => v >= HOT).length;
    return { items, left, total: items.length, fill: items.length ? f.reduce((a, b) => a + b, 0) / items.length : 0, dormant: left === 0, dream, eat, eatKind, requestDream };
  }, [items, now, dream, eat, eatKind, requestDream]);

  return <CarcosaContext.Provider value={value}>{children}</CarcosaContext.Provider>;
}

const GREY_DARK: [number, number, number] = [200, 200, 194];
const GREY_LIGHT: [number, number, number] = [70, 70, 68];

/** The hairline under the corner strip, or, when everything is eaten, the dried lump at its end. */
export function CarcosaGauge() {
  const { fill, left, total, dormant } = useCarcosa();
  const { theme } = useContext(ThemeContext);
  const line = useRef<HTMLCanvasElement>(null);
  const body = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const c = line.current; if (!c) return;
      const cell = 3; const gw = Math.ceil(c.clientWidth / cell); const gh = 4;
      c.width = gw; c.height = gh;
      const ctx = c.getContext("2d")!; const img = ctx.createImageData(gw, gh); const buf = img.data;
      const grey = theme === "dark" ? GREY_DARK : GREY_LIGHT;
      const ink: Ink = (x, y, a) => { if (x < 0 || y < 0 || x >= gw || y >= gh) return; const o = (y * gw + x) * 4; buf[o] = grey[0]; buf[o + 1] = grey[1]; buf[o + 2] = grey[2]; buf[o + 3] = Math.max(buf[o + 3], Math.round(a * 255)); };
      if (!dormant) drawGauge(ink, 0, gw - 1, 0, fill);
      ctx.putImageData(img, 0, 0);
      const b = body.current; if (!b) return;
      b.width = SW; b.height = SH;
      const bctx = b.getContext("2d")!; const bimg = bctx.createImageData(SW, SH);
      if (dormant) for (const p of pixelsOf(lump())) { const o = (p.y * SW + p.x) * 4; bimg.data[o] = p.rgb[0]; bimg.data[o + 1] = p.rgb[1]; bimg.data[o + 2] = p.rgb[2]; bimg.data[o + 3] = 255; }
      bctx.putImageData(bimg, 0, 0);
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [fill, dormant, theme]);

  return <>
    <canvas ref={line} className="carcosa-line" aria-hidden="true" />
    <canvas ref={body} className="carcosa-lump" aria-hidden="true" data-on={dormant || undefined} />
    <span className="carcosa-count" title="Carcosa: today's hot information still fresh">{dormant ? "carcosa · asleep" : `carcosa · ${left} / ${total}`}</span>
  </>;
}

const HEART = ["..XX.XX..", ".XXXXXXX.", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."];
const CELL = 4;
const SCALE = 2;
const SIGN = "have you seen the sign?";

/** The scene in the open index: only after everything is eaten does the lump become the yak. */
export function CarcosaIndex() {
  const { dormant, left, dream, requestDream } = useCarcosa();
  const { theme } = useContext(ThemeContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [say, setSay] = useState("");
  const [typed, setTyped] = useState("");
  const [waiting, setWaiting] = useState(false);
  const maskUntil = useRef(0);
  const petUntil = useRef(0);
  const hearts = useRef<{ x: number; y: number; born: number }[]>([]);
  const geo = useRef({ gw: 130, gh: 75, ground: 62 });

  const yakAt = () => { const g = geo.current; return { x: Math.floor(g.gw / 2 - (SW * SCALE) / 2), y: g.ground - SH * SCALE }; };

  useEffect(() => {
    if (!dormant) return;
    const c = canvas.current!; const g = geo.current;
    c.width = g.gw; c.height = g.gh;
    const ctx = c.getContext("2d")!;
    const o = yakAt();
    const from: Dot[] = pixelsOf(lump()).flatMap((p) => [{ x: 8 + p.x, y: g.ground - SH + p.y, rgb: p.rgb }]);
    const to: Dot[] = [];
    for (const p of pixelsOf(yak(0))) for (let dy = 0; dy < SCALE; dy += 1) for (let dx = 0; dx < SCALE; dx += 1) to.push({ x: o.x + p.x * SCALE + dx, y: o.y + p.y * SCALE + dy, rgb: p.rgb });
    const swarm = new Swarm(from, to);
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const img = ctx.createImageData(g.gw, g.gh); const buf = img.data;
      const put = (x: number, y: number, rgb: [number, number, number]) => { if (x < 0 || y < 0 || x >= g.gw || y >= g.gh) return; const i = (y * g.gw + x) * 4; buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255; };
      if (!swarm.done) { swarm.step(0.02); swarm.render(buf, g.gw, g.gh); }
      else {
        const hop = t < petUntil.current ? -Math.round(Math.abs(Math.sin((petUntil.current - t) / 90)) * 3 * SCALE) : 0;
        const bob = Math.floor(t / 900) % 2;
        for (const p of pixelsOf(yak((Math.floor(t / 420) % 2) as 0 | 1, t % 4200 < 140, t < maskUntil.current))) for (let dy = 0; dy < SCALE; dy += 1) for (let dx = 0; dx < SCALE; dx += 1) put(o.x + p.x * SCALE + dx, o.y + p.y * SCALE + dy + hop + bob, p.rgb);
        hearts.current = hearts.current.filter((h) => t - h.born < 1400);
        for (const h of hearts.current) { if (t < h.born) continue; const y0 = Math.round(h.y - ((t - h.born) / 1400) * 18 * SCALE); HEART.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "X") put(h.x + x - 4, y0 + y, [226, 130, 130]); })); }
      }
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dormant]);

  // the day's dream, typed out
  useEffect(() => {
    if (!dream || !say) { setTyped(""); return; }
    let i = 0; setTyped("");
    const timer = window.setInterval(() => { i += 1; setTyped(dream.slice(0, i)); if (i >= dream.length) window.clearInterval(timer); }, 45);
    return () => window.clearInterval(timer);
  }, [dream, say]);

  if (!dormant) return <p className="carcosa-hint">carcosa is still eating · {left} still hot</p>;

  const pet = () => {
    const o = yakAt();
    petUntil.current = performance.now() + 700;
    for (let i = 0; i < 3; i += 1) hearts.current.push({ x: o.x + SW * SCALE * 0.6 + (i - 1) * 7, y: o.y - 2 - i * 3, born: performance.now() + i * 120 });
  };
  const sign = async () => {
    maskUntil.current = performance.now() + 2400;
    setSay(SIGN);
    if (!dream) { setWaiting(true); await requestDream(); setWaiting(false); }
  };

  // light: the twin suns are up and the black star has sunk; dark: the other way round
  const sunsUp = theme === "light";
  return <div className="carcosa-scene" data-theme={theme}>
    <canvas ref={canvas} className="carcosa-canvas" aria-hidden="true" />
    <div className="carcosa-ground" />
    {[1, 2].map((n) => <div key={n} className={`carcosa-sun${n === 2 ? " carcosa-sun--2" : ""}${sunsUp ? " is-up" : ""}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={sunsUp ? "M12 1a11 11 0 1 0 0.01 0Z" : "M1 12a11 11 0 0 1 22 0Z"} /></svg></div>)}
    <button type="button" className={`carcosa-star${sunsUp ? "" : " is-up"}`} aria-label="A black star" onClick={() => void sign()}><svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,1 14.8,9 23,9 16.4,14 19,22.5 12,17.5 5,22.5 7.6,14 1,9 9.2,9" /></svg></button>
    <button type="button" className="carcosa-yak" aria-label="Carcosa" onClick={pet} />
    {say && <p className="carcosa-say">{say}</p>}
    {say && (waiting ? <p className="carcosa-dream">……</p> : typed && <p className="carcosa-dream">{typed}</p>)}
  </div>;
}

const SPORE_CELL = 3;

/**
 * Beside every hot thing on screen (anything marked data-carcosa with an id she knows), a spore in the margin to its
 * left, sized by how fresh it still is, and a vein joining the spores of one column. Still and grey: it is redrawn only
 * when the page scrolls, changes or something is eaten. Hidden while the index is open, and wherever something covers it.
 */
export function CarcosaSpores() {
  const { items } = useCarcosa();
  const { theme } = useContext(ThemeContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ items, theme });
  state.current = { items, theme };

  const draw = useCallback(() => {
    const c = canvas.current; if (!c) return;
    const gw = Math.ceil(window.innerWidth / SPORE_CELL); const gh = Math.ceil(window.innerHeight / SPORE_CELL);
    if (c.width !== gw || c.height !== gh) { c.width = gw; c.height = gh; }
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(gw, gh); const buf = img.data;
    const { items: hot, theme: mode } = state.current;
    if (hot.length && !document.querySelector(".sidebar[data-open]")) {
      const grey = mode === "dark" ? GREY_DARK : GREY_LIGHT;
      const ink: Ink = (x, y, a) => { if (x < 0 || y < 0 || x >= gw || y >= gh) return; const o = (y * gw + x) * 4; buf[o] = grey[0]; buf[o + 1] = grey[1]; buf[o + 2] = grey[2]; buf[o + 3] = Math.max(buf[o + 3], Math.round(a * 255)); };
      const byId = new Map(hot.map((item) => [item.id, item]));
      const now = Date.now();
      const columns = new Map<number, { x: number; spots: { id: string; y: number; fresh: number }[] }>();
      for (const el of document.querySelectorAll<HTMLElement>("[data-carcosa]")) {
        const item = byId.get(el.dataset.carcosa ?? "");
        if (!item) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
        // a spore needs a margin to sit in; on a narrow screen there is none, and the top line says enough
        if (r.left < 18) continue;
        const y = r.top + Math.min(r.height / 2, 18);
        // only where the item is really on top: a sheet, the reader or a pop-up over it hides its spore
        const probe = document.elementFromPoint(Math.max(1, r.left + 6), Math.max(1, Math.min(window.innerHeight - 1, y)));
        if (!probe || !el.contains(probe)) continue;
        const sx = Math.max(2, Math.floor((r.left - 14) / SPORE_CELL));
        const key = Math.round(sx / 8);
        const col = columns.get(key) ?? { x: sx, spots: [] };
        col.x = Math.min(col.x, sx);
        col.spots.push({ id: item.id, y: Math.round(y / SPORE_CELL), fresh: freshness({ id: item.id, arrived: item.arrived, read: !!item.eaten }, now) });
        columns.set(key, col);
      }
      for (const col of columns.values()) {
        const top = Math.min(...col.spots.map((s) => s.y));
        drawVein(ink, Math.max(1, col.x - 3), col.x, top, col.spots);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  useEffect(() => {
    let pending = 0;
    const soon = () => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; draw(); }); };
    soon();
    document.addEventListener("scroll", soon, true);
    window.addEventListener("resize", soon);
    const watch = new MutationObserver(soon);
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-carcosa", "data-open", "class"] });
    return () => { document.removeEventListener("scroll", soon, true); window.removeEventListener("resize", soon); watch.disconnect(); if (pending) cancelAnimationFrame(pending); };
  }, [draw]);
  useEffect(() => { draw(); }, [items, theme, draw]);

  return <canvas ref={canvas} className="carcosa-spores" aria-hidden="true" />;
}
