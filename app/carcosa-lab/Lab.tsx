"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Slime, type Food, type Rect } from "../lib/carcosa/slime";
import { lump, pixelsOf, PALETTE, W as SW, H as SH, yak } from "../lib/carcosa/sprite";

type Mode = "slime" | "yak" | "dormant";
type Item = { id: string; kind: "mail" | "news" | "note"; title: string; meta: string };

const HEART = ["..XX.XX..", ".XXXXXXX.", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."];
const CLUE = "have you seen the sign?";

const START: Item[] = [
  { id: "m1", kind: "mail", title: "Studio crit moved to Thursday", meta: "mail · 09:12" },
  { id: "m2", kind: "mail", title: "Your invoice is ready", meta: "mail · 08:40" },
  { id: "n1", kind: "news", title: "Hundreds homeless due to flats' structural issues", meta: "front page · UK local" },
  { id: "n2", kind: "news", title: "The Moon may have squeezed Earth's first continents into existence", meta: "front page · science" },
  { id: "k1", kind: "note", title: "Kept: a line about the shape of a shadow", meta: "notebook · yesterday" },
];

const rgba = (rgb: [number, number, number], a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

export default function Lab() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [items, setItems] = useState<Item[]>(START);
  const [mode, setMode] = useState<Mode>("slime");
  const [veil, setVeil] = useState(true);
  const [stats, setStats] = useState({ energy: 0.5, eaten: 0 });
  const [caption, setCaption] = useState("");
  const sim = useRef<{ slime: Slime; cell: number; scale: number; gw: number; gh: number } | null>(null);
  const modeRef = useRef<Mode>("slime");
  const veilRef = useRef(true);
  const maskUntil = useRef(0);
  const petUntil = useRef(0);
  const hearts = useRef<{ x: number; y: number; born: number }[]>([]);
  const mouse = useRef({ x: 1e9, y: 0 });
  veilRef.current = veil;

  const bodyOrigin = useCallback((kind: "yak" | "lump") => {
    const s = sim.current!;
    const w = SW * s.scale; const h = SH * s.scale;
    return kind === "yak" ? { x: Math.floor(s.gw * 0.5 - w / 2), y: Math.floor(s.gh * 0.74 - h) } : { x: s.slime.home.x - Math.floor(w / 2), y: s.slime.home.y - Math.floor(h / 2) };
  }, []);

  const targetsFor = useCallback((rows: string[], kind: "yak" | "lump", flip = false) => {
    const s = sim.current!; const o = bodyOrigin(kind);
    const out: { x: number; y: number; rgb: [number, number, number] }[] = [];
    for (const p of pixelsOf(rows)) for (let dy = 0; dy < s.scale; dy += 1) for (let dx = 0; dx < s.scale; dx += 1) out.push({ x: o.x + (flip ? SW - 1 - p.x : p.x) * s.scale + dx, y: o.y + p.y * s.scale + dy, rgb: p.rgb });
    for (let i = out.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out.slice(0, s.slime.n);
  }, [bodyOrigin]);

  const syncFoods = useCallback(() => {
    const s = sim.current; const root = wrap.current;
    if (!s || !root) return;
    const toRect = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      return { x0: Math.floor(r.left / s.cell), y0: Math.floor(r.top / s.cell), x1: Math.ceil(r.right / s.cell), y1: Math.ceil(r.bottom / s.cell) };
    };
    const old = new Map(s.slime.foods.map((f) => [f.id, f.left]));
    const foods: Food[] = [...root.querySelectorAll("[data-food]")].map((el) => ({ ...toRect(el), id: (el as HTMLElement).dataset.food ?? "", left: old.get((el as HTMLElement).dataset.food ?? "") ?? 1 }));
    s.slime.setFoods(foods);
    s.slime.setSolids([...root.querySelectorAll("[data-food],[data-solid]")].map(toRect));
  }, []);

  // build the simulation for this screen
  useEffect(() => {
    const vw = window.innerWidth; const vh = window.innerHeight;
    const small = vw < 700;
    const cell = small ? 6 : 4;
    const gw = Math.ceil(vw / cell); const gh = Math.ceil(vh / cell);
    const scale = small ? 1 : 2;
    const n = small ? 2600 : 5200;
    sim.current = { slime: new Slime(gw, gh, n), cell, scale, gw, gh };
    const c = canvas.current!;
    c.width = gw; c.height = gh;
    syncFoods();
    const onResize = () => window.location.reload();
    window.addEventListener("resize", onResize);
    const onMove = (e: PointerEvent) => { mouse.current = { x: e.clientX / cell, y: e.clientY / cell }; };
    window.addEventListener("pointermove", onMove);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("pointermove", onMove); };
  }, [syncFoods]);

  useEffect(() => { requestAnimationFrame(syncFoods); }, [items, syncFoods]);

  // the loop: a fixed tick for the mould, a draw for every frame
  useEffect(() => {
    let raf = 0; let last = performance.now(); let acc = 0; let statAt = 0;
    const ctx = canvas.current!.getContext("2d")!;
    let img: ImageData | null = null;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = sim.current; if (!s || document.hidden) { last = now; return; }
      acc += Math.min(100, now - last); last = now;
      const m = modeRef.current;
      while (acc >= 1000 / 40) {
        acc -= 1000 / 40;
        s.slime.step(m === "slime" ? -0.02 : 0.009);
      }
      if (!img || img.width !== s.gw) img = ctx.createImageData(s.gw, s.gh);
      s.slime.render(img.data, 1);
      if (m !== "slime" && s.slime.form > 0.97) drawBody(img.data, s, m, now);
      drawHearts(img.data, s, now);
      ctx.putImageData(img, 0, 0);
      if (now - statAt > 400) {
        statAt = now;
        setStats({ energy: s.slime.energy, eaten: s.slime.foods.filter((f) => f.left <= 0).length });
        for (const el of document.querySelectorAll<HTMLElement>("[data-food]")) {
          const f = s.slime.foods.find((x) => x.id === el.dataset.food);
          if (f) { el.style.setProperty("--left", String(f.left)); el.dataset.bitten = f.left < 0.97 ? "1" : "0"; el.dataset.eaten = f.left <= 0 ? "1" : "0"; }
        }
      }
    };
    const put = (buf: Uint8ClampedArray, s: NonNullable<typeof sim.current>, x: number, y: number, rgb: [number, number, number]) => {
      if (x < 0 || y < 0 || x >= s.gw || y >= s.gh) return;
      const o = (y * s.gw + x) * 4; buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2]; buf[o + 3] = 255;
    };
    const drawBody = (buf: Uint8ClampedArray, s: NonNullable<typeof sim.current>, m: Mode, now: number) => {
      if (m === "dormant") {
        const o = bodyOrigin("lump");
        for (const p of pixelsOf(lump())) for (let dy = 0; dy < s.scale; dy += 1) for (let dx = 0; dx < s.scale; dx += 1) put(buf, s, o.x + p.x * s.scale + dx, o.y + p.y * s.scale + dy, p.rgb);
        return;
      }
      const o = bodyOrigin("yak");
      const frame = (Math.floor(now / 420) % 2) as 0 | 1;
      const blink = now % 4200 < 140;
      const masked = now < maskUntil.current;
      const hop = now < petUntil.current ? -Math.round(Math.abs(Math.sin((petUntil.current - now) / 90)) * 3 * s.scale) : 0;
      const bob = Math.floor(now / 900) % 2 === 0 ? 0 : s.scale > 1 ? 1 : 0;
      const flip = mouse.current.x < o.x + (SW * s.scale) / 2;
      const rows = yak(frame, blink, masked);
      for (const p of pixelsOf(rows)) {
        const px = flip ? SW - 1 - p.x : p.x;
        for (let dy = 0; dy < s.scale; dy += 1) for (let dx = 0; dx < s.scale; dx += 1) put(buf, s, o.x + px * s.scale + dx, o.y + p.y * s.scale + dy + hop + bob, p.rgb);
      }
    };
    const drawHearts = (buf: Uint8ClampedArray, s: NonNullable<typeof sim.current>, now: number) => {
      hearts.current = hearts.current.filter((h) => now - h.born < 1400);
      for (const h of hearts.current) {
        const age = (now - h.born) / 1400; const y0 = Math.round(h.y - age * 18 * s.scale);
        HEART.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "X") put(buf, s, h.x + x - 4, y0 + y, [226, 130, 130]); }));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bodyOrigin]);

  function go(next: Mode) {
    const s = sim.current; if (!s) return;
    modeRef.current = next; setMode(next); setCaption("");
    if (next === "yak") { const o = bodyOrigin("yak"); s.slime.setBody(targetsFor(yak(0), "yak", mouse.current.x < o.x + (SW * s.scale) / 2)); }
    else if (next === "dormant") s.slime.setBody(targetsFor(lump(), "lump"));
    else s.slime.setBody(null);
  }

  function addMessage() {
    const titles = ["A reply about the print slot", "Reading list: three new essays", "Reminder: deadline Friday", "Two lines from the walk"];
    const t = titles[Math.floor(Math.random() * titles.length)];
    setItems((cur) => [{ id: `x${Date.now()}`, kind: (Math.random() > 0.5 ? "mail" : "news") as Item["kind"], title: t, meta: "just now" }, ...cur].slice(0, 7));
    if (modeRef.current !== "slime") go("slime");
  }

  function onScene(e: React.PointerEvent) {
    const s = sim.current; if (!s || modeRef.current !== "yak" || s.slime.form < 0.97) return;
    const x = e.clientX / s.cell; const y = e.clientY / s.cell;
    const star = { x: s.gw * 0.14, y: s.gh * 0.16 };
    if (Math.abs(x - star.x) < 6 && Math.abs(y - star.y) < 6) { maskUntil.current = performance.now() + 1800; setCaption(CLUE); window.setTimeout(() => setCaption(""), 4200); return; }
    const o = bodyOrigin("yak");
    if (x >= o.x && x <= o.x + SW * s.scale && y >= o.y && y <= o.y + SH * s.scale) {
      petUntil.current = performance.now() + 700;
      for (let i = 0; i < 3; i += 1) hearts.current.push({ x: Math.round(x + (i - 1) * 7), y: Math.round(o.y - 2 - i * 3), born: performance.now() + i * 120 });
      s.slime.energy = Math.min(1, s.slime.energy + 0.05);
    }
  }

  const s = sim.current;
  const cell = s?.cell ?? 4;
  const unit = (n: number) => n * cell;
  return (
    <div ref={wrap} className="cl" data-mode={mode}>
      <style>{CSS}</style>
      <header data-solid className="cl-head">
        <b>Carcosa</b> <span>lab · {mode} · energy {(stats.energy * 100).toFixed(0)}% · eaten {stats.eaten}</span>
        <div>
          <button onClick={() => go("slime")} aria-pressed={mode === "slime"}>slime</button>
          <button onClick={() => go("yak")} aria-pressed={mode === "yak"}>yak</button>
          <button onClick={() => go("dormant")} aria-pressed={mode === "dormant"}>dormant</button>
          <button onClick={addMessage}>+ message</button>
          <button onClick={() => setVeil((v) => !v)} aria-pressed={veil}>veil</button>
        </div>
      </header>

      <main className="cl-page">
        <h1>TODAY</h1>
        {items.map((it) => <article key={it.id} data-food={it.id} className={`cl-item cl-${it.kind}`}>
          <small>{it.meta}</small>
          <h3>{it.title}</h3>
        </article>)}
      </main>

      {veil && mode === "slime" && <div className="cl-veil" />}

      <div className="cl-scene" style={{ opacity: mode === "yak" ? 1 : 0, pointerEvents: mode === "yak" ? "auto" : "none" }} onPointerDown={onScene}>
        <div className="cl-grid" />
        <div className="cl-ground" style={{ top: unit(Math.floor((s?.gh ?? 100) * 0.74)) }} />
        <div className="cl-sun" style={{ left: "74%", top: unit(Math.floor((s?.gh ?? 100) * 0.74) - 5), width: unit(10), height: unit(10) }} />
        <div className="cl-sun cl-sun2" style={{ left: "81%", top: unit(Math.floor((s?.gh ?? 100) * 0.74) - 3), width: unit(6), height: unit(6) }} />
        <div className="cl-star" style={{ left: unit(Math.floor((s?.gw ?? 100) * 0.14) - 3), top: unit(Math.floor((s?.gh ?? 100) * 0.16) - 3), width: unit(6), height: unit(6) }} />
        <div className="cl-word">INDEX</div>
      </div>

      <canvas ref={canvas} className="cl-canvas" />
      <p className="cl-caption" aria-live="polite">{caption}</p>
    </div>
  );
}

const CSS = `
.cl{--bg:#0b0b0c;--fg:#f2f2f0;--mute:#7b7e85;position:fixed;inset:0;background:var(--bg);color:var(--fg);font-family:ui-monospace,"SF Mono",Menlo,monospace;overflow:hidden}
.cl *{box-sizing:border-box}
.cl-head{position:fixed;z-index:60;top:0;left:0;right:0;display:flex;gap:16px;align-items:baseline;padding:12px 18px;font-size:13px;background:rgba(11,11,12,.7);backdrop-filter:blur(10px);flex-wrap:wrap}
.cl-head span{color:var(--mute)} .cl-head div{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
.cl-head button{font:inherit;color:var(--mute);background:none;border:1px solid rgba(255,255,255,.18);padding:4px 10px;cursor:pointer}
.cl-head button[aria-pressed="true"]{color:var(--fg);border-color:#e6c229}
.cl-page{position:absolute;inset:0;padding:92px 4vw 40px;display:flex;flex-direction:column;gap:18px;max-width:760px;background-image:radial-gradient(circle,rgba(255,255,255,.13) 1px,transparent 1.6px);background-size:20px 22px}
.cl-page h1{margin:0 0 6px;font:800 clamp(56px,13vw,150px)/.9 "Helvetica Neue",Arial,sans-serif;letter-spacing:-.05em}
.cl-item{padding:12px 14px;border-left:2px solid rgba(255,255,255,.16);transition:opacity .4s}
.cl-item small{color:var(--mute);font-size:11px} .cl-item h3{margin:4px 0 0;font-size:16px;line-height:22px;font-weight:600}
.cl-item[data-bitten="1"]{opacity:calc(.55 + var(--left,1) * .45)} .cl-item[data-eaten="1"]::after{content:"■";color:#e6c229;font-size:9px;margin-left:6px}
.cl-veil{position:absolute;inset:0;z-index:20;pointer-events:none;background:radial-gradient(ellipse at 85% 80%,rgba(230,194,41,.1),transparent 55%),radial-gradient(ellipse at 10% 20%,rgba(230,194,41,.04),transparent 50%)}
.cl-scene{position:absolute;inset:0;z-index:30;background:#0b0b0c;transition:opacity .9s}
.cl-grid{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.13) 1px,transparent 1.6px);background-size:20px 22px}
.cl-ground{position:absolute;left:0;right:0;height:2px;background:rgba(255,255,255,.35)}
.cl-sun{position:absolute;background:#ffe05a;border-radius:50%;box-shadow:0 0 18px rgba(255,224,90,.5);clip-path:inset(0 0 50% 0)} .cl-sun2{background:#e6c229;opacity:.85}
.cl-star{position:absolute;background:#000;outline:1px solid rgba(255,255,255,.55);clip-path:polygon(50% 0,62% 38%,100% 38%,70% 60%,82% 100%,50% 76%,18% 100%,30% 60%,0 38%,38% 38%);cursor:pointer;animation:cltw 3.2s steps(2) infinite}
@keyframes cltw{0%,90%{opacity:1}95%{opacity:.25}}
.cl-word{position:absolute;left:2.2vw;bottom:1vw;font:800 clamp(60px,14vw,170px)/.9 "Helvetica Neue",Arial,sans-serif;letter-spacing:-.05em;color:rgba(255,255,255,.1)}
.cl-canvas{position:absolute;inset:0;z-index:40;width:100vw;height:100vh;image-rendering:pixelated;pointer-events:none}
.cl-caption{position:absolute;z-index:50;left:0;right:0;bottom:22px;margin:0;text-align:center;color:#e6c229;font-size:14px;letter-spacing:.06em;pointer-events:none;min-height:18px}
@media (prefers-reduced-motion:reduce){.cl-star{animation:none}}
`;
