/**
 * Carcosa on a page: a still, grey trace of how much of today's hot information is left. A hairline under the corner
 * strip is the gauge; a vein in the left margin branches to each hot item and ends in a spore sized by how fresh the
 * item still is. Nothing moves; it is redrawn only when something arrives, is read, or ages.
 */
export type Hot = { id: string; arrived: number; read: boolean; kind?: string };
export type Spot = { id: string; y: number; fresh: number };

export const HALF_LIFE_MS = 12 * 3_600_000;
/** The front page changes twice a day and is browsed, not answered, so its stories go cold in twelve hours, not twenty-four. */
export const HALF_LIFE_NEWS_MS = 6 * 3_600_000;
/** Below this an item no longer counts as hot. */
export const HOT = 0.25;

/** 1 when it has just arrived, halving every twelve hours; nearly nothing once read. */
export function freshness(item: Hot, now: number) {
  const aged = 0.5 ** (Math.max(0, now - item.arrived) / (item.kind === "news" ? HALF_LIFE_NEWS_MS : HALF_LIFE_MS));
  return item.read ? Math.min(aged, 0.08) : aged;
}

/** How full the gauge is, and how many items still count as hot. */
export function level(items: Hot[], now: number) {
  if (!items.length) return { fill: 0, left: 0, total: 0 };
  const f = items.map((item) => freshness(item, now));
  return { fill: f.reduce((a, b) => a + b, 0) / items.length, left: f.filter((v) => v >= HOT).length, total: items.length };
}

// a stable pseudo-random sequence per string, so the same item always grows the same way
function seeded(key: string) {
  let s = 2166136261;
  for (let i = 0; i < key.length; i += 1) s = Math.imul(s ^ key.charCodeAt(i), 16777619);
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507); s = Math.imul(s ^ (s >>> 13), 3266489909); return ((s ^= s >>> 16) >>> 0) / 4294967296; };
}

export type Ink = (x: number, y: number, a: number) => void;

/** The hairline: `fill` of the width solid, with short hyphae hanging from it; the rest a faint dotted line. */
export function drawGauge(ink: Ink, x0: number, x1: number, y: number, fill: number) {
  const end = Math.round(x0 + (x1 - x0) * Math.max(0, Math.min(1, fill)));
  const r = seeded("gauge");
  for (let x = x0; x <= x1; x += 1) {
    const h = r(); const k = r(); const w = r();
    if (x > end) { if (x % 3 === 0) ink(x, y, 0.12); continue; }
    ink(x, y, 0.42);
    if (h < 0.18) { const len = 1 + Math.floor(k * 3); for (let d = 1; d <= len; d += 1) ink(x + (w < 0.3 ? 1 : 0), y + d, 0.3 - 0.06 * d); }
  }
  if (fill > 0) { ink(end, y - 1, 0.5); ink(end + 1, y, 0.5); ink(end, y + 1, 0.5); }
}

/** The vein down the margin at `x`, a branch to each item, and a spore at the end sized by freshness. */
export function drawVein(ink: Ink, x: number, sporeX: number, top: number, spots: Spot[]) {
  if (!spots.length) return;
  const r = seeded("vein");
  const bottom = Math.max(...spots.map((s) => s.y));
  let vx = x;
  for (let y = top; y <= bottom; y += 1) { if (r() < 0.12) vx += r() < 0.5 ? -1 : 1; vx = Math.max(x - 1, Math.min(x + 1, vx)); ink(vx, y, 0.3); }
  for (const s of spots) {
    const alive = s.fresh >= HOT;
    for (let k = x + 1; k < sporeX; k += 1) ink(k, s.y, alive ? 0.28 : 0.12);
    const rad = alive ? Math.max(1, Math.round(s.fresh * 2.2)) : 1;
    for (let dy = -rad; dy <= rad; dy += 1) for (let dx = -rad; dx <= rad; dx += 1) {
      const d = dx * dx + dy * dy;
      if (d > rad * rad + 0.5) continue;
      if (!alive) { if (d >= rad * rad - 1) ink(sporeX + dx, s.y + dy, 0.32); } else ink(sporeX + dx, s.y + dy, 0.22 + 0.42 * s.fresh);
    }
  }
}
