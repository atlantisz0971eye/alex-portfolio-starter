"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drawGauge, drawVein, freshness, level, type Ink } from "../lib/carcosa/gauge";
import { lump, pixelsOf, W as SW, H as SH, yak } from "../lib/carcosa/sprite";
import { Swarm, type Dot } from "../lib/carcosa/swarm";

type View = "page" | "index";
type Item = { id: string; kind: "mail" | "news" | "note"; title: string; meta: string; arrived: number; read: boolean };

const HOUR = 3_600_000;
const GREY: [number, number, number] = [200, 200, 194];
const HEART = ["..XX.XX..", ".XXXXXXX.", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."];
const CLUE = "have you seen the sign?";

const seed = (): Item[] => {
  const t = Date.now();
  return [
    { id: "m1", kind: "mail", title: "A reply about the print slot", meta: "mail", arrived: t - 0.2 * HOUR, read: false },
    { id: "m2", kind: "mail", title: "Studio crit moved to Thursday", meta: "mail", arrived: t - 3 * HOUR, read: false },
    { id: "m3", kind: "mail", title: "Your invoice is ready", meta: "mail", arrived: t - 5 * HOUR, read: true },
    { id: "n1", kind: "news", title: "Hundreds homeless due to flats' structural issues", meta: "front page · UK local", arrived: t - 1 * HOUR, read: false },
    { id: "n2", kind: "news", title: "The Moon may have squeezed Earth's first continents", meta: "front page · science", arrived: t - 9 * HOUR, read: false },
    { id: "n3", kind: "news", title: "Ceasefire talks resume", meta: "front page · world", arrived: t - 20 * HOUR, read: false },
    { id: "k1", kind: "note", title: "Summary: three threads from this week's reading", meta: "notebook · summary", arrived: t - 2 * HOUR, read: false },
  ];
};

const ago = (ms: number) => (ms < HOUR ? `${Math.max(1, Math.round(ms / 60000))}m ago` : `${Math.round(ms / HOUR)}h ago`);

export default function Lab() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [items, setItems] = useState<Item[]>(seed);
  const [clock, setClock] = useState(0);
  const [view, setView] = useState<View>("page");
  const [caption, setCaption] = useState("");
  const geo = useRef({ cell: 4, gw: 0, gh: 0, scale: 2 });
  const gaugeDots = useRef<Dot[]>([]);
  const swarm = useRef<Swarm | null>(null);
  const phase = useRef<"in" | "here" | "out" | null>(null);
  const mouse = useRef({ x: 1e9 });
  const maskUntil = useRef(0);
  const petUntil = useRef(0);
  const hearts = useRef<{ x: number; y: number; born: number }[]>([]);

  const now = Date.now() + clock;
  const { fill, left, total } = level(items, now);

  // ---- the page: still, grey, redrawn only when something changes -------------------
  const drawPage = useCallback(() => {
    const c = canvas.current; const el = root.current;
    if (!c || !el) return;
    const g = geo.current;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(g.gw, g.gh);
    const buf = img.data;
    const ink: Ink = (x, y, a) => {
      if (x < 0 || y < 0 || x >= g.gw || y >= g.gh) return;
      const o = (y * g.gw + x) * 4;
      buf[o] = GREY[0]; buf[o + 1] = GREY[1]; buf[o + 2] = GREY[2]; buf[o + 3] = Math.max(buf[o + 3], Math.round(a * 255));
    };
    const head = el.querySelector(".cl-head")!.getBoundingClientRect();
    const gy = Math.ceil(head.bottom / g.cell) + 1;
    const x0 = Math.round(18 / g.cell); const x1 = g.gw - x0;
    const dots: Dot[] = [];
    if (total > 0 && left === 0) {
      // nothing hot is left: the mould dries into a lump at the start of the line
      for (const p of pixelsOf(lump())) {
        const x = x0 + p.x - 8; const y = gy + p.y - 12;
        if (x < 0 || y < 0) continue;
        const o = (y * g.gw + x) * 4; buf[o] = p.rgb[0]; buf[o + 1] = p.rgb[1]; buf[o + 2] = p.rgb[2]; buf[o + 3] = 255;
        dots.push({ x, y, rgb: p.rgb });
      }
    } else {
      drawGauge(ink, x0, x1, gy, fill);
      const end = Math.round(x0 + (x1 - x0) * fill);
      for (let x = x0; x <= end; x += 1) dots.push({ x, y: gy, rgb: GREY });
    }
    gaugeDots.current = dots;
    const list = el.querySelector(".cl-items")!.getBoundingClientRect();
    const sporeX = Math.floor(list.left / g.cell) - 4;
    const veinX = sporeX - 4;
    const spots = [...el.querySelectorAll<HTMLElement>("[data-hot]")].map((node) => {
      const h3 = node.querySelector("h3")!.getBoundingClientRect();
      const item = items.find((i) => i.id === node.dataset.hot)!;
      return { id: item.id, y: Math.round((h3.top + h3.height / 2) / g.cell), fresh: freshness(item, now) };
    });
    drawVein(ink, Math.max(1, veinX), Math.max(3, sporeX), Math.floor(list.top / g.cell), spots);
    ctx.putImageData(img, 0, 0);
  }, [fill, items, left, now, total]);

  // size the grid to the screen
  useEffect(() => {
    const small = window.innerWidth < 700;
    const cell = small ? 3 : 4;
    geo.current = { cell, gw: Math.ceil(window.innerWidth / cell), gh: Math.ceil(window.innerHeight / cell), scale: 2 };
    const c = canvas.current!; c.width = geo.current.gw; c.height = geo.current.gh;
    const onResize = () => window.location.reload();
    const onMove = (e: PointerEvent) => { mouse.current = { x: e.clientX / cell }; };
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("pointermove", onMove); };
  }, []);

  useEffect(() => { if (view === "page" && !phase.current) requestAnimationFrame(drawPage); }, [view, drawPage]);
  // the page scrolls under a fixed drawing, so it is redrawn when it moves
  const drawRef = useRef(drawPage);
  drawRef.current = drawPage;
  useEffect(() => {
    const el = root.current; if (!el) return;
    let pending = false;
    const onScroll = () => { if (pending || phase.current) return; pending = true; requestAnimationFrame(() => { pending = false; drawRef.current(); }); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ---- index: the mould gathers out of the line into the yak, and goes back ------------
  const yakOrigin = () => { const g = geo.current; return { x: Math.floor(g.gw / 2 - (SW * g.scale) / 2), y: Math.floor(g.gh * 0.74 - SH * g.scale) }; };
  const yakDots = (flip: boolean): Dot[] => {
    const g = geo.current; const o = yakOrigin(); const out: Dot[] = [];
    for (const p of pixelsOf(yak(0))) for (let dy = 0; dy < g.scale; dy += 1) for (let dx = 0; dx < g.scale; dx += 1) out.push({ x: o.x + (flip ? SW - 1 - p.x : p.x) * g.scale + dx, y: o.y + p.y * g.scale + dy, rgb: p.rgb });
    return out;
  };

  useEffect(() => {
    if (view !== "index" && phase.current !== "out") return;
    let raf = 0;
    const ctx = canvas.current!.getContext("2d")!;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const g = geo.current;
      const img = ctx.createImageData(g.gw, g.gh);
      const buf = img.data;
      const put = (x: number, y: number, rgb: [number, number, number]) => { if (x < 0 || y < 0 || x >= g.gw || y >= g.gh) return; const o = (y * g.gw + x) * 4; buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2]; buf[o + 3] = 255; };
      if (phase.current === "in" || phase.current === "out") {
        swarm.current!.step(0.018);
        swarm.current!.render(buf, g.gw, g.gh);
        if (swarm.current!.done) {
          if (phase.current === "in") phase.current = "here";
          else { phase.current = null; swarm.current = null; cancelAnimationFrame(raf); drawPage(); return; }
        }
      } else if (phase.current === "here") {
        const o = yakOrigin();
        const flip = mouse.current.x < o.x + (SW * g.scale) / 2;
        const hop = t < petUntil.current ? -Math.round(Math.abs(Math.sin((petUntil.current - t) / 90)) * 3 * g.scale) : 0;
        const bob = Math.floor(t / 900) % 2 === 0 ? 0 : 1;
        for (const p of pixelsOf(yak((Math.floor(t / 420) % 2) as 0 | 1, t % 4200 < 140, t < maskUntil.current))) {
          const px = flip ? SW - 1 - p.x : p.x;
          for (let dy = 0; dy < g.scale; dy += 1) for (let dx = 0; dx < g.scale; dx += 1) put(o.x + px * g.scale + dx, o.y + p.y * g.scale + dy + hop + bob, p.rgb);
        }
        hearts.current = hearts.current.filter((h) => t - h.born < 1400);
        for (const h of hearts.current) {
          if (t < h.born) continue;
          const y0 = Math.round(h.y - ((t - h.born) / 1400) * 18 * g.scale);
          HEART.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "X") put(h.x + x - 4, y0 + y, [226, 130, 130]); }));
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view, drawPage]);

  function go(next: View) {
    if (next === view || phase.current === "in" || phase.current === "out") return;
    const g = geo.current; const o = yakOrigin();
    const flip = mouse.current.x < o.x + (SW * g.scale) / 2;
    if (next === "index") { swarm.current = new Swarm(gaugeDots.current, yakDots(flip)); phase.current = "in"; }
    else {
      const back = gaugeDots.current.length ? gaugeDots.current : [{ x: 4, y: 20, rgb: GREY } as Dot];
      // the yak's pixels go back to the line, taking its grey
      const from = yakDots(flip);
      swarm.current = new Swarm(from, from.map((_, i) => back[i % back.length]));
      phase.current = "out";
    }
    setCaption("");
    setView(next);
  }

  function onScene(e: React.PointerEvent) {
    if (phase.current !== "here") return;
    const g = geo.current; const x = e.clientX / g.cell; const y = e.clientY / g.cell;
    if (Math.abs(x - g.gw * 0.14) < 6 && Math.abs(y - g.gh * 0.16) < 6) { maskUntil.current = performance.now() + 1800; setCaption(CLUE); window.setTimeout(() => setCaption(""), 4200); return; }
    const o = yakOrigin();
    if (x >= o.x && x <= o.x + SW * g.scale && y >= o.y && y <= o.y + SH * g.scale) {
      petUntil.current = performance.now() + 700;
      for (let i = 0; i < 3; i += 1) hearts.current.push({ x: Math.round(x + (i - 1) * 7), y: Math.round(o.y - 2 - i * 3), born: performance.now() + i * 120 });
    }
  }

  const addMessage = () => {
    const titles = ["A reply about the print slot, again", "Reading list: three new essays", "Reminder: deadline Friday", "Front page: a council budget vote"];
    setItems((cur) => [{ id: `x${Date.now()}`, kind: "mail" as const, title: titles[Math.floor(Math.random() * titles.length)], meta: "mail", arrived: Date.now() + clock, read: false }, ...cur].slice(0, 9));
  };
  const toggleRead = (id: string) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, read: !i.read } : i)));

  const g = geo.current;
  const unit = (n: number) => n * g.cell;
  const ground = Math.floor((g.gh || 200) * 0.74);
  return (
    <div ref={root} className="cl">
      <style>{CSS}</style>
      <header className="cl-head">
        <b>Alex Workspace</b><span className="cl-ix">index</span>
        <span className="cl-gauge">carcosa · {left} / {total} hot left</span>
        <nav>
          <button onClick={() => go("page")} aria-pressed={view === "page"}>page</button>
          <button onClick={() => go("index")} aria-pressed={view === "index"}>index</button>
          <button onClick={addMessage}>+ message</button>
          <button onClick={() => setClock((c) => c + 6 * HOUR)}>+6h</button>
          <button onClick={() => { setItems(seed()); setClock(0); }}>reset</button>
        </nav>
      </header>

      <main className="cl-page">
        <h1>TODAY</h1>
        <div className="cl-items">
          {items.map((it) => {
            const f = freshness(it, now);
            return <button type="button" key={it.id} data-hot={it.id} className={`cl-item${f < 0.25 ? " is-cold" : ""}`} onClick={() => toggleRead(it.id)}>
              <small>{it.meta} · {ago(now - it.arrived)}{it.read ? " · read" : ""}</small>
              <h3>{it.title}</h3>
            </button>;
          })}
        </div>
        <p className="cl-note">Click an item to read it. +6h ages everything. When nothing hot is left, the line dries into a lump.</p>
      </main>

      <div className="cl-scene" style={{ opacity: view === "index" ? 1 : 0, pointerEvents: view === "index" ? "auto" : "none" }} onPointerDown={onScene}>
        <div className="cl-grid" />
        <div className="cl-ground" style={{ top: unit(ground) }} />
        <div className="cl-sun" style={{ left: "74%", top: unit(ground - 5), width: unit(10), height: unit(10) }} />
        <div className="cl-sun cl-sun2" style={{ left: "81%", top: unit(ground - 3), width: unit(6), height: unit(6) }} />
        <div className="cl-star" style={{ left: unit(Math.floor(g.gw * 0.14) - 3), top: unit(Math.floor(g.gh * 0.16) - 3), width: unit(6), height: unit(6) }} />
        <div className="cl-word">INDEX</div>
      </div>

      <canvas ref={canvas} className="cl-canvas" />
      <p className="cl-caption" aria-live="polite">{caption}</p>
    </div>
  );
}

const CSS = `
.cl{--bg:#0b0b0c;--fg:#f2f2f0;--mute:#7b7e85;position:fixed;inset:0;background:var(--bg);color:var(--fg);font-family:ui-monospace,"SF Mono",Menlo,monospace;overflow:auto}
.cl *{box-sizing:border-box}
.cl-head{position:fixed;z-index:60;top:0;left:0;right:0;display:flex;gap:22px;align-items:baseline;padding:14px 18px 12px;font-size:14px;background:rgba(11,11,12,.72);backdrop-filter:blur(10px);flex-wrap:wrap}
.cl-ix{color:var(--mute)} .cl-ix::before{content:"■ ";color:#2f6bff}
.cl-gauge{margin-left:auto;color:var(--mute);font-size:12px}
.cl-head nav{display:flex;gap:6px;flex-wrap:wrap}
.cl-head button{font:inherit;font-size:12px;color:var(--mute);background:none;border:1px solid rgba(255,255,255,.16);padding:3px 9px;cursor:pointer}
.cl-head button[aria-pressed="true"]{color:var(--fg);border-color:rgba(255,255,255,.5)}
.cl-page{position:relative;min-height:100%;padding:96px 6vw 60px;background-image:radial-gradient(circle,rgba(255,255,255,.12) 1px,transparent 1.6px);background-size:20px 22px}
.cl-page h1{margin:0 0 30px;font:800 clamp(56px,12vw,150px)/.9 "Helvetica Neue",Arial,sans-serif;letter-spacing:-.05em}
.cl-items{display:flex;flex-direction:column;gap:6px;max-width:760px}
.cl-item{all:unset;display:block;padding:10px 0 12px;cursor:pointer}
.cl-item small{color:var(--mute);font-size:11px} .cl-item h3{margin:4px 0 0;font-size:17px;line-height:23px;font-weight:700}
.cl-item.is-cold h3{color:#9a9b97;font-weight:500}
.cl-note{margin-top:34px;color:var(--mute);font-size:12px;max-width:520px}
.cl-scene{position:fixed;inset:0;z-index:30;background:#0b0b0c;transition:opacity .7s}
.cl-grid{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.12) 1px,transparent 1.6px);background-size:20px 22px}
.cl-ground{position:absolute;left:0;right:0;height:2px;background:rgba(255,255,255,.3)}
.cl-sun{position:absolute;background:#ffe05a;border-radius:50%;box-shadow:0 0 18px rgba(255,224,90,.45);clip-path:inset(0 0 50% 0)} .cl-sun2{background:#e6c229;opacity:.85}
.cl-star{position:absolute;background:#000;outline:1px solid rgba(255,255,255,.5);clip-path:polygon(50% 0,62% 38%,100% 38%,70% 60%,82% 100%,50% 76%,18% 100%,30% 60%,0 38%,38% 38%);cursor:pointer;animation:cltw 3.2s steps(2) infinite}
@keyframes cltw{0%,90%{opacity:1}95%{opacity:.25}}
.cl-word{position:absolute;left:2.2vw;bottom:1vw;font:800 clamp(60px,14vw,170px)/.9 "Helvetica Neue",Arial,sans-serif;letter-spacing:-.05em;color:rgba(255,255,255,.08)}
.cl-canvas{position:fixed;inset:0;z-index:40;width:100vw;height:100vh;image-rendering:pixelated;pointer-events:none}
.cl-caption{position:fixed;z-index:50;left:0;right:0;bottom:22px;margin:0;text-align:center;color:#e6c229;font-size:14px;letter-spacing:.06em;pointer-events:none;min-height:18px}
@media (prefers-reduced-motion:reduce){.cl-star{animation:none}}
`;
