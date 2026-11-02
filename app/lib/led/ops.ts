import { hash, PALETTE, type Colour, type LedPanel } from "./engine";

/**
 * Scene ops: a picture for the panel as plain data. This is what the AI director writes and what the panel runs; nothing the
 * model says is ever executed, only checked (`sanitize`) and then mapped onto the painters below.
 */
export const REGION = { x: 80, y: 4, w: 232, h: 156 };
export const TONE_NAMES = ["planet", "rings", "stripes", "terrain", "gradient", "noise", "checker", "diamond"] as const;
export type ToneName = (typeof TONE_NAMES)[number];

type Look = { colour?: Colour; lum?: number };
export type Op = Look & (
  | { op: "text"; s: string; x: number; y: number; scale?: number; font?: "px" | "cjk"; align?: "left" | "center" | "right"; wrap?: number }
  | { op: "rect"; x: number; y: number; w: number; h: number; blink?: boolean }
  | { op: "frame"; x: number; y: number; w: number; h: number }
  | { op: "bar"; x: number; y: number; w: number; h: number; value: number }
  | { op: "fade"; x: number; y: number; w: number }
  | { op: "halftone"; x: number; y: number; w: number; h: number; tone: ToneName; seed?: number }
  | { op: "ascii"; lines: string[]; x: number; y: number }
  | { op: "ticker"; s: string; x: number; y: number; w: number }
);

export const planet = (t: number) => (u: number, v: number) => {
  const x = u * 2 - 1, y = v * 2 - 1, r2 = x * x + y * y; if (r2 > 1) return 0;
  const z = Math.sqrt(1 - r2); const light = Math.max(0, -0.55 * x - 0.5 * y + 0.75 * z);
  const band = 0.1 * Math.sin(y * 13 + Math.sin(x * 3 + t * 0.4) * 1.3);
  return Math.min(1, light * 0.95 + band + 0.05);
};
export const rings = (seed: number) => (u: number, v: number) => { const d = Math.hypot(u - 0.5, v - 0.42) * 7 + seed; return 0.5 + 0.5 * Math.sin(d * 3.1) * (1 - Math.hypot(u - 0.5, v - 0.5) * 0.9); };
export const stripes = (seed: number) => (u: number, v: number) => 0.5 + 0.5 * Math.sin((u * 1.4 + v) * 14 + seed) * (0.35 + 0.65 * v);
export const terrain = (seed: number) => (u: number, v: number) => { const h = 0.5 + 0.28 * Math.sin(u * 9 + seed) + 0.18 * Math.sin(u * 23 + seed * 2); return v > 1 - h * 0.8 ? 0.35 + 0.6 * (v - (1 - h * 0.8)) * 2 : 0.06 + 0.2 * hash(Math.floor(u * 30), Math.floor(v * 30)); };

export function tone(name: ToneName, seed: number, t: number): (u: number, v: number) => number {
  switch (name) {
    case "planet": return planet(t);
    case "rings": return rings(seed);
    case "stripes": return stripes(seed);
    case "terrain": return terrain(seed);
    case "gradient": return (u) => u;
    case "noise": return (u, v) => hash(Math.floor(u * 40) + seed, Math.floor(v * 40));
    case "checker": return (u, v) => ((Math.floor(u * 8) + Math.floor(v * 8)) % 2 ? 0.9 : 0.2);
    case "diamond": return (u, v) => 1 - Math.min(1, (Math.abs(u - 0.5) + Math.abs(v - 0.5)) * 2);
  }
}

// ---- checking what the model wrote ---------------------------------------------------------------------------------
const COLOURS = Object.keys(PALETTE) as Colour[];
const MAX_OPS = 160;
const num = (value: unknown, min: number, max: number, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value * 100) / 100)) : fallback);
const str = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").slice(0, max) : "");

/** Turns whatever came back into ops that are safe to run: unknown ops dropped, numbers clamped into the region, text cut short. */
export function sanitize(raw: unknown): Op[] {
  if (!Array.isArray(raw)) return [];
  const out: Op[] = [];
  const R = REGION;
  for (const item of raw.slice(0, MAX_OPS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const x = num(o.x, R.x, R.x + R.w - 1, R.x), y = num(o.y, R.y, R.y + R.h - 1, R.y);
    const w = num(o.w, 1, R.x + R.w - x, 1), h = num(o.h, 1, R.y + R.h - y, 1);
    const look: Look = { colour: COLOURS.includes(o.colour as Colour) ? (o.colour as Colour) : undefined, lum: o.lum === undefined ? undefined : num(o.lum, 0.1, 1, 1) };
    switch (o.op) {
      case "text": {
        const s = str(o.s, 200); if (!s) break;
        const wide = /[^ -~]/.test(s);
        out.push({ op: "text", s, x, y, scale: num(o.scale, 1, 3, 1), font: wide || o.font === "cjk" ? "cjk" : "px", align: o.align === "center" || o.align === "right" ? o.align : "left", wrap: o.wrap === undefined ? undefined : num(o.wrap, 12, R.w, R.w), ...look });
        break;
      }
      case "rect": out.push({ op: "rect", x, y, w, h, blink: o.blink === true, ...look }); break;
      case "frame": out.push({ op: "frame", x, y, w, h, ...look }); break;
      case "bar": out.push({ op: "bar", x, y, w: Math.max(6, w), h: num(o.h, 3, 12, 5), value: num(o.value, 0, 1, 0), ...look }); break;
      case "fade": out.push({ op: "fade", x, y, w, ...look }); break;
      case "halftone": out.push({ op: "halftone", x, y, w: Math.min(w, 120), h: Math.min(h, 120), tone: TONE_NAMES.includes(o.tone as ToneName) ? (o.tone as ToneName) : "rings", seed: num(o.seed, 0, 99, 1), ...look }); break;
      case "ascii": {
        if (!Array.isArray(o.lines)) break;
        const lines = o.lines.slice(0, 16).map((line) => str(line, 40)).filter((line) => /^[ -~]*$/.test(line));
        if (lines.length) out.push({ op: "ascii", lines, x, y, ...look });
        break;
      }
      case "ticker": { const s = str(o.s, 300).toUpperCase(); if (s && /^[ -~]*$/.test(s)) out.push({ op: "ticker", s, x, y, w: Math.max(30, w), ...look }); break; }
    }
  }
  return out;
}

// ---- running them --------------------------------------------------------------------------------------------------
/** Paints ops onto the panel. They appear one after another, as if the director were laying the bulbs out, `step` seconds apart. */
export function runOps(p: LedPanel, ops: Op[], t: number, since: number, step = 0.045) {
  const shown = Math.min(ops.length, Math.max(0, Math.floor((t - since) / step) + 1));
  for (let n = 0; n < shown; n += 1) {
    const op = ops[n]; const colour = op.colour ?? "amber"; const lum = op.lum ?? 1;
    switch (op.op) {
      case "text": {
        const o = { font: op.font, size: op.font === "cjk" ? 12 : 8, scale: op.scale, colour, lum, align: op.align, clip: [REGION.x, REGION.x + REGION.w] as [number, number] };
        if (op.wrap) p.paragraph(op.s, op.x, op.y, op.wrap, (op.font === "cjk" ? 14 : 10) * (op.scale ?? 1), o); else p.text(op.s, op.x, op.y, o);
        break;
      }
      case "rect": p.rect(op.x, op.y, op.w, op.h, op.blink ? 0.55 + 0.45 * Math.abs(Math.sin(t * 3)) * lum : lum, colour); break;
      case "frame": p.frame(op.x, op.y, op.w, op.h, lum, colour); break;
      case "bar": p.bar(op.x, op.y, op.w, op.h, op.value, colour); break;
      case "fade": for (let i = 0; i < op.w; i += 1) { const v = Math.max(0, 1 - i / op.w) * lum; p.set(op.x + i, op.y, v, colour); if (i % 2 === 0) p.set(op.x + i, op.y + 2, v * 0.6, colour); if (i % 3 === 0) p.set(op.x + i, op.y + 4, v * 0.3, colour); } break;
      case "halftone": p.halftone(op.x, op.y, op.w, op.h, tone(op.tone, op.seed ?? 1, t), colour, 0.8); break;
      case "ascii": p.ascii(op.lines, op.x, op.y, { colour, lum }); break;
      case "ticker": {
        const msg = `${op.s}  //  `; const mw = p.measure(msg); const off = (t * 26) % mw;
        for (const dx of [0, mw]) p.text(msg, op.x - off + dx, op.y, { colour, lum, clip: [op.x, op.x + op.w] });
        break;
      }
    }
  }
  return shown;
}

/** What the panel shows before the director has been asked for anything, and when the model is out of reach. */
export const SAMPLE_OPS: Op[] = [
  { op: "text", s: "SUNDAY PLAN", x: 84, y: 40, scale: 2, colour: "amber" },
  { op: "fade", x: 84, y: 60, w: 160, colour: "amber" },
  { op: "halftone", x: 262, y: 40, w: 44, h: 44, tone: "planet", colour: "amber" },
  { op: "rect", x: 84, y: 72, w: 3, h: 12, colour: "green" }, { op: "text", s: "10:00", x: 92, y: 72, colour: "green" }, { op: "text", s: "阅读 Wood Wide Webs", x: 92, y: 80, font: "cjk", colour: "white", lum: 0.9 },
  { op: "rect", x: 84, y: 98, w: 3, h: 12, colour: "cyan" }, { op: "text", s: "13:00", x: 92, y: 98, colour: "cyan" }, { op: "text", s: "整理 Mindstream", x: 92, y: 106, font: "cjk", colour: "white", lum: 0.9 },
  { op: "rect", x: 84, y: 124, w: 3, h: 12, colour: "magenta", blink: true }, { op: "text", s: "15:00", x: 92, y: 124, colour: "magenta" }, { op: "text", s: "工作室", x: 92, y: 132, font: "cjk", colour: "white", lum: 0.9 },
  { op: "bar", x: 200, y: 100, w: 100, h: 5, value: 0.6, colour: "green" }, { op: "text", s: "DAY 60%", x: 200, y: 110, colour: "white", lum: 0.5 },
  { op: "ticker", s: "SAMPLE: ASK ME FOR ANYTHING TO LIGHT UP", x: 84, y: 156, w: 220, colour: "red" },
];
