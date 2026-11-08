"use client";

import { useEffect, useRef } from "react";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

/**
 * The Gallery background: the venation of one large leaf, grown by space colonisation (Runions et al. 2005).
 * Points of auxin are scattered inside a leaf outline that is larger than the section, a vein grows from the
 * petiole towards them and each point is used up when a vein reaches it, so the veins branch the way real ones do.
 * The leaf grows for about twenty seconds and then stops; leaving and coming back grows a new one.
 * Only the new stretches are drawn each frame, and nothing runs off screen or in a hidden tab.
 */

const STEP = 7; // length a vein grows each round
const REACH = 90; // how far a point of auxin pulls
const KILL = 9; // a point is used up when a vein comes this close
const DENSITY = 1 / 1500; // points of auxin per square pixel of leaf
const MAX_POINTS = 1400;
const ROUNDS_PER_SECOND = 13; // so a leaf takes roughly 20 seconds whatever the frame rate
const MAX_ROUNDS = 300; // about 23 seconds at ROUNDS_PER_SECOND

/** order 0 is the midrib; a side branch is one order higher than the vein it leaves. */
type Node = { x: number; y: number; parent: number; order: number; children: number };
type Vein = { x1: number; y1: number; x2: number; y2: number; width: number; alpha: number };

/** A small seeded random generator, so one growth is consistent from start to end. */
function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new leaf for this section: its petiole just outside a corner, its tip far past the opposite one. */
function createLeaf(width: number, height: number, seed: number) {
  const rand = random(seed);
  const fromLeft = rand() < 0.5;
  const base = { x: fromLeft ? -width * 0.04 : width * 1.04, y: height * (0.92 + rand() * 0.12) };
  const tip = { x: fromLeft ? width * (0.95 + rand() * 0.35) : width * (0.05 - rand() * 0.35), y: -height * (0.15 + rand() * 0.25) };
  const ax = tip.x - base.x;
  const ay = tip.y - base.y;
  const length = Math.hypot(ax, ay);
  const ux = ax / length;
  const uy = ay / length;
  const halfWidth = length * (0.4 + rand() * 0.08);
  // Ovate: widest a little below the middle, narrowing to the tip.
  const inside = (x: number, y: number) => {
    const dx = x - base.x;
    const dy = y - base.y;
    const u = (dx * ux + dy * uy) / length;
    const v = -dx * uy + dy * ux;
    if (u <= 0.01 || u >= 1) return false;
    return Math.abs(v) < halfWidth * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.9);
  };

  // Points of auxin only where they can be seen, plus a margin so veins enter from off screen.
  const points: { x: number; y: number }[] = [];
  const wanted = Math.min(MAX_POINTS, Math.round(width * height * DENSITY));
  for (let tries = 0; points.length < wanted && tries < wanted * 20; tries += 1) {
    const x = -REACH + rand() * (width + REACH * 2);
    const y = -REACH + rand() * (height + REACH * 2);
    if (inside(x, y)) points.push({ x, y });
  }

  // The petiole and the start of the midrib, so the first vein heads along the leaf.
  const nodes: Node[] = [];
  for (let i = 0; i <= 6; i += 1) nodes.push({ x: base.x + ux * STEP * i * 2, y: base.y + uy * STEP * i * 2, parent: i - 1, order: 0, children: i < 6 ? 1 : 0 });
  return { nodes, points, start: points.length, axis: { x: ux, y: uy }, tip: nodes.length - 1 };
}

export function GalleryVeins() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !section || !context) return;

    const frameGap = 1000 / (isTouchDevice ? 12 : 24);
    let leaf = createLeaf(1, 1, 1);
    let veins: Vein[] = [];
    let rounds = 0;
    let done = false;
    let grown = false; // a leaf has finished; the next visit grows a new one
    let visible = false;
    let frame = 0;
    let last = 0;
    let budget = 0;

    const strokeVein = (vein: Vein) => {
      context.lineWidth = vein.width;
      context.strokeStyle = `rgba(181, 203, 154, ${vein.alpha})`;
      context.beginPath();
      context.moveTo(vein.x1, vein.y1);
      context.lineTo(vein.x2, vein.y2);
      context.stroke();
    };

    const addVein = (from: Node, to: Node) => {
      // The midrib is thickest; each order of branching is thinner and fainter, down to hair-thin veinlets.
      const width = Math.max(0.6, 2.4 / (1 + to.order * 0.9));
      const alpha = Math.max(0.11, 0.32 / (1 + to.order * 0.4));
      const vein = { x1: from.x, y1: from.y, x2: to.x, y2: to.y, width, alpha };
      veins.push(vein);
      strokeVein(vein);
    };

    /** One round of space colonisation. Returns false when the leaf has nothing left to grow towards. */
    const grow = () => {
      const { nodes, points } = leaf;
      // Stop once almost every point is used up: the last few are often out of reach and would keep it busy.
      if (points.length <= leaf.start * 0.03 || rounds >= MAX_ROUNDS) return false;
      rounds += 1;
      // A coarse grid of veins, so each point only looks at its neighbours.
      const grid = new Map<string, number[]>();
      const key = (x: number, y: number) => `${Math.floor(x / REACH)},${Math.floor(y / REACH)}`;
      nodes.forEach((node, index) => {
        const k = key(node.x, node.y);
        const cell = grid.get(k);
        if (cell) cell.push(index);
        else grid.set(k, [index]);
      });
      const pull = new Map<number, { x: number; y: number }>();
      const alive: { x: number; y: number }[] = [];
      for (const point of points) {
        const cx = Math.floor(point.x / REACH);
        const cy = Math.floor(point.y / REACH);
        let best = -1;
        let bestDistance = REACH;
        for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
          for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
            for (const index of grid.get(`${gx},${gy}`) ?? []) {
              const distance = Math.hypot(nodes[index].x - point.x, nodes[index].y - point.y);
              if (distance < bestDistance) {
                bestDistance = distance;
                best = index;
              }
            }
          }
        }
        if (best >= 0 && bestDistance < KILL) continue; // used up
        alive.push(point);
        if (best < 0) continue;
        const direction = pull.get(best) ?? { x: 0, y: 0 };
        direction.x += (point.x - nodes[best].x) / bestDistance;
        direction.y += (point.y - nodes[best].y) / bestDistance;
        pull.set(best, direction);
      }
      leaf.points = alive;
      if (!pull.size) {
        // Nothing in reach yet: keep extending the midrib along the leaf until it meets the points.
        if (!alive.length) return false;
        const tip = nodes[leaf.tip];
        tip.children += 1;
        const child = { x: tip.x + leaf.axis.x * STEP, y: tip.y + leaf.axis.y * STEP, parent: leaf.tip, order: 0, children: 0 };
        leaf.tip = nodes.push(child) - 1;
        addVein(tip, child);
        return true;
      }
      for (const [index, direction] of pull) {
        const parent = nodes[index];
        // A slight bias along the leaf keeps the midrib and the main veins running towards the tip.
        const dx = direction.x + leaf.axis.x * 0.35;
        const dy = direction.y + leaf.axis.y * 0.35;
        const length = Math.hypot(dx, dy) || 1;
        // The first vein out of a node carries on its order; any later one is a side branch.
        const order = parent.children === 0 ? parent.order : parent.order + 1;
        parent.children += 1;
        const child = { x: parent.x + (dx / length) * STEP, y: parent.y + (dy / length) * STEP, parent: index, order, children: 0 };
        nodes.push(child);
        addVein(parent, child);
      }
      return true;
    };

    const fresh = () => {
      const box = section.getBoundingClientRect();
      canvas.width = Math.round(box.width);
      canvas.height = Math.round(box.height);
      context.lineCap = "round";
      leaf = createLeaf(box.width, box.height, Math.floor(Math.random() * 2 ** 31));
      veins = [];
      rounds = 0;
      done = false;
      leaf.nodes.slice(1).forEach((node) => addVein(leaf.nodes[node.parent], node));
    };

    // Same leaf, new canvas size: redraw the veins already grown instead of growing again.
    const resize = () => {
      const box = section.getBoundingClientRect();
      if (Math.round(box.width) === canvas.width && Math.round(box.height) === canvas.height) return;
      canvas.width = Math.round(box.width);
      canvas.height = Math.round(box.height);
      context.lineCap = "round";
      veins.forEach(strokeVein);
    };

    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden || done) return;
      if (now - last >= frameGap) {
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        budget += dt * ROUNDS_PER_SECOND;
        while (budget >= 1 && !done) {
          budget -= 1;
          if (!grow()) done = true;
        }
        if (done) grown = true;
      }
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (frame || !visible || document.hidden || done) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };

    fresh();
    if (prefersReducedMotion) {
      while (grow());
      done = true;
    }

    const onScreen = new IntersectionObserver(([entry]) => {
      const wasVisible = visible;
      visible = entry.isIntersecting;
      if (visible && !wasVisible && grown && !prefersReducedMotion) {
        grown = false;
        fresh();
      }
      if (visible) run();
    }, { threshold: 0.1 });
    onScreen.observe(section);

    let pending = 0;
    const resized = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(resize);
    });
    resized.observe(section);

    const onVisibility = () => run();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pending);
      onScreen.disconnect();
      resized.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="gallery-veins" aria-hidden />;
}
