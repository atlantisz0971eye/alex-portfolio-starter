"use client";

import { useEffect, useRef } from "react";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

/**
 * The Workbench background: a milling toolpath that spirals outward from the plate's chamfered outline, one
 * offset pass after another, then stops. It only draws the new stretch of path each frame, runs only while the
 * section is on screen and the tab is visible, and costs nothing once the cut is finished.
 */

const STEP = 14; // distance between passes
const FIRST = 12; // gap between the plate and the first pass
const CHAMFER = 18; // matches .workbench-cut
const MAX_PASSES = 48;
const DURATION = 30; // seconds for the whole cut
const TAN_22_5 = Math.tan(Math.PI / 8); // keeps an offset chamfer parallel to the one inside it

type Segment = { x1: number; y1: number; x2: number; y2: number; length: number; alpha: number };

/** The whole toolpath as straight segments: offset outlines of the plate joined into one continuous spiral. */
function toolpath(width: number, height: number, plate: DOMRect, origin: DOMRect) {
  const px = plate.left - origin.left;
  const py = plate.top - origin.top;
  const segments: Segment[] = [];
  let previous: [number, number] | null = null;
  let passes = 0;
  for (let k = 0; k < MAX_PASSES; k += 1) {
    const d = FIRST + k * STEP;
    const x = px - d;
    const y = py - d;
    const w = plate.width + d * 2;
    const h = plate.height + d * 2;
    if (x < -STEP && y < -STEP && x + w > width + STEP && y + h > height + STEP) break;
    passes += 1;
    const c = CHAMFER + d * TAN_22_5;
    const ring: [number, number][] = [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c], [x + c, y]];
    const points = previous ? [previous, ...ring] : ring;
    for (let i = 1; i < points.length; i += 1) {
      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      segments.push({ x1, y1, x2, y2, length: Math.hypot(x2 - x1, y2 - y1), alpha: k });
    }
    previous = ring[ring.length - 1];
  }
  // Fade the passes as they move away from the plate, like a facing cut that gets shallower.
  for (const segment of segments) segment.alpha = 0.03 + 0.17 * Math.pow(1 - segment.alpha / (passes + 1), 1.4);
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  return { segments, total };
}

export function WorkbenchMill() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const headRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const head = headRef.current;
    const section = canvas?.parentElement;
    const plate = section?.querySelector<HTMLElement>(".workbench-cut");
    const context = canvas?.getContext("2d");
    if (!canvas || !head || !section || !plate || !context) return;

    const frameGap = 1000 / (isTouchDevice ? 12 : 24);
    let path = { segments: [] as Segment[], total: 0 };
    let progress = 0; // 0 to 1, how much of the cut is done
    let drawnTo = 0; // length along the path already on the canvas
    let visible = false;
    let frame = 0;
    let last = 0;

    const strokeUpTo = (target: number) => {
      let start = 0;
      for (const segment of path.segments) {
        const end = start + segment.length;
        if (end > drawnTo && start < target) {
          const from = Math.max(0, drawnTo - start) / segment.length;
          const to = Math.min(segment.length, target - start) / segment.length;
          context.strokeStyle = `rgba(214, 219, 228, ${segment.alpha})`;
          context.beginPath();
          context.moveTo(segment.x1 + (segment.x2 - segment.x1) * from, segment.y1 + (segment.y2 - segment.y1) * from);
          context.lineTo(segment.x1 + (segment.x2 - segment.x1) * to, segment.y1 + (segment.y2 - segment.y1) * to);
          context.stroke();
        }
        if (end >= target) {
          const t = (target - start) / segment.length;
          head.style.transform = `translate(${segment.x1 + (segment.x2 - segment.x1) * t}px, ${segment.y1 + (segment.y2 - segment.y1) * t}px)`;
          break;
        }
        start = end;
      }
      drawnTo = target;
    };

    // Rebuild the path for the current layout and redraw what was already cut, without animating it again.
    const layout = () => {
      const box = section.getBoundingClientRect();
      canvas.width = Math.round(box.width);
      canvas.height = Math.round(box.height);
      context.lineWidth = 1;
      path = toolpath(box.width, box.height, plate.getBoundingClientRect(), box);
      drawnTo = 0;
      strokeUpTo(progress * path.total);
      head.classList.toggle("is-cutting", progress > 0 && progress < 1);
    };

    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden || progress >= 1) return;
      if (now - last >= frameGap) {
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        progress = Math.min(1, progress + dt / DURATION);
        head.classList.toggle("is-cutting", progress < 1);
        strokeUpTo(progress * path.total);
      }
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (frame || !visible || document.hidden || progress >= 1) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };

    if (prefersReducedMotion) progress = 1;
    layout();

    const onScreen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      section.classList.toggle("is-lit", visible);
      if (visible) run();
    }, { threshold: 0.15 });
    onScreen.observe(section);

    let pending = 0;
    const resized = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(layout);
    });
    resized.observe(section);
    resized.observe(plate);

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

  return (
    <>
      <canvas ref={canvasRef} className="workbench-mill" aria-hidden />
      <span ref={headRef} className="workbench-mill__head" aria-hidden />
      <div className="workbench-mill__light" aria-hidden />
    </>
  );
}
