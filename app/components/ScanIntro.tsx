"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ink, ROW_PX, readRow, snapshotPage, type ScanRow, type ScanSnapshot } from "../lib/scanPage";
import { BPM, ScanSynth, type Step } from "../lib/scanSynth";
import { prefersReducedMotion } from "../utils/environment";

type ScanIntroProps = { open: boolean; onClose: () => void };

/**
 * The welcome screen: an opaque scanner over the real portfolio. Scrolling moves a read head down the page under
 * it; each band of the page it crosses is drawn as a line of ASCII (edges as lines, text as its own letters) and
 * read as a step of techno. Entering drops the visitor into the page wherever the read head is.
 * Sound lives only here: it fades out and the audio shuts down on entering.
 */

const ACCENT: Record<string, [number, number, number]> = {
  top: [200, 204, 214],
  tian: [126, 160, 255],
  ren: [178, 150, 230],
  di: [110, 200, 196],
  development: [150, 158, 222],
  gallery: [170, 206, 132],
  workbench: [214, 219, 228],
  bio: [232, 196, 140],
};

// Each section plays in its own mode over A: darkest for technology, a little light for the gallery.
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MODE: Record<string, number[]> = { top: PHRYGIAN, tian: PHRYGIAN, ren: AEOLIAN, di: DORIAN, development: PHRYGIAN, gallery: DORIAN, workbench: AEOLIAN, bio: DORIAN };
const ROOT = 55; // A1

const note = (scale: number[], degree: number, octave = 0) => {
  const d = ((degree % scale.length) + scale.length) % scale.length;
  const o = Math.floor(degree / scale.length) + octave;
  return ROOT * Math.pow(2, (scale[d] + 12 * o) / 12);
};

/** How one scanned row sounds at one sixteenth of the bar. */
function stepFor(bar: ScanRow[], s: number): Step {
  const silent: Step = { kick: false, hat: false, openHat: false, clap: false, bass: null, stab: null };
  if (!bar.length) return silent;
  const row = bar[s % bar.length];
  const previous = bar[(s + bar.length - 1) % bar.length];
  // Gaps between sections read as empty rows: the kick drops out and the bar becomes a breakdown.
  const breakdown = bar.filter((r) => r.empty).length > bar.length * 0.6;
  const busy = bar.some((r) => r.textDensity > 0);
  const scale = MODE[row.section] ?? AEOLIAN;
  const step: Step = {
    kick: s % 4 === 0 && !breakdown,
    clap: (s === 4 || s === 12) && !breakdown && busy,
    hat: s % 2 === 1 && row.textDensity > 0.03,
    openHat: s % 4 === 2 && row.textDensity > 0.16,
    bass: null,
    stab: null,
  };
  // The bass reads the layout: how many edges cross the row and where the first one sits pick the note.
  if (!row.empty && (s % 2 === 0 || row.edges.length > 1)) {
    const degree = row.edges.length * 2 + ((row.edges[0] ?? 0) % 7) + Math.round(row.textDensity * 10);
    const accent = row.heading || row.links > 0 || row.sectionStart;
    const slide = previous.edges.some((edge) => row.edges.includes(edge)) && !previous.empty;
    step.bass = { freq: note(scale, degree, row.heading ? 1 : 0), accent, slide };
  }
  if ((row.heading || row.sectionStart) && s % 2 === 0) {
    const degree = row.edges.length + 2;
    step.stab = [note(scale, degree, 3), note(scale, degree + 2, 3), note(scale, degree + 4, 3)];
  }
  return step;
}

const INK_ALPHA: Record<number, number> = { [Ink.Edge]: 0.5, [Ink.Text]: 0.72, [Ink.Heading]: 1, [Ink.Media]: 0.32, [Ink.Rule]: 0.9, [Ink.Link]: 0.6 };

export function ScanIntro({ open, onClose }: ScanIntroProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [powered, setPowered] = useState(false); // sound on
  const [started, setStarted] = useState(false); // the title screen is gone
  const [leaving, setLeaving] = useState(false);
  const [readout, setReadout] = useState({ y: 0, height: 1, section: "top", complete: false });

  const state = useRef({
    snapshot: null as ScanSnapshot | null,
    readY: 0,
    lastRow: -1,
    screen: [] as ScanRow[],
    bar: [] as ScanRow[],
    cols: 120,
    rows: 40,
    cell: { w: 8, h: 16 },
    dirty: true,
    direction: 1,
    speed: 0,
    moved: 0,
    synth: null as ScanSynth | null,
    leaving: false,
  });

  const enter = useCallback(() => {
    const s = state.current;
    if (s.leaving) return;
    s.leaving = true;
    setLeaving(true);
    s.synth?.stop(0.7);
    s.synth = null;
    // Land with the read line a little above the middle of the screen.
    const target = Math.max(0, s.readY - window.innerHeight * 0.4);
    window.setTimeout(() => {
      onClose();
      window.setTimeout(() => window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior }), 30);
    }, prefersReducedMotion ? 0 : 720);
  }, [onClose]);

  const power = useCallback(() => {
    const s = state.current;
    setStarted(true);
    if (s.synth || s.leaving) return;
    try {
      s.synth = new ScanSynth((step) => stepFor(s.bar, step));
      s.synth.start();
      setPowered(true);
    } catch {
      setPowered(false); // no Web Audio: the scan still works, silently
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const main = document.querySelector("main");
    if (!root || !canvas || !context || !main) return;
    const s = state.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.focus({ preventScroll: true });

    const takeSnapshot = () => {
      s.snapshot = snapshotPage(main);
      setReadout((r) => ({ ...r, height: s.snapshot?.height ?? 1 }));
    };

    const layout = () => {
      const box = root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = box.width < 640 ? 10 : 13;
      context.font = `${size}px ui-monospace, "SF Mono", Menlo, "JetBrains Mono", monospace`;
      context.textBaseline = "top";
      s.cell = { w: context.measureText("M").width, h: Math.round(size * 1.3) };
      s.cols = Math.max(20, Math.floor(box.width / s.cell.w));
      s.rows = Math.max(8, Math.floor(box.height / s.cell.h));
      // Re-read what is on screen at the new width.
      if (s.snapshot) s.screen = s.screen.map((row) => readRow(s.snapshot!, row.index, s.cols));
      s.dirty = true;
    };

    const draw = () => {
      const box = root.getBoundingClientRect();
      context.clearRect(0, 0, box.width, box.height);
      const { w, h } = s.cell;
      const top = box.height - s.screen.length * h;
      s.screen.forEach((row, i) => {
        const [r, g, b] = ACCENT[row.section] ?? ACCENT.top;
        const y = top + i * h;
        // Draw runs of the same ink in one call each.
        let start = 0;
        for (let c = 1; c <= row.chars.length; c += 1) {
          if (c === row.chars.length || row.inks[c] !== row.inks[start]) {
            const ink = row.inks[start];
            if (ink !== Ink.Blank) {
              const alpha = INK_ALPHA[ink] ?? 0.5;
              context.fillStyle = ink === Ink.Heading ? `rgba(255,255,255,${alpha})` : ink === Ink.Edge || ink === Ink.Media ? `rgba(210,214,222,${alpha})` : `rgba(${r},${g},${b},${alpha})`;
              context.fillText(row.chars.slice(start, c), start * w, y);
            }
            start = c;
          }
        }
      });
      // The read head: the newest line, lit.
      if (s.screen.length) {
        const y = s.direction > 0 ? box.height - h : top;
        const [r, g, b] = ACCENT[s.screen[s.direction > 0 ? s.screen.length - 1 : 0].section] ?? ACCENT.top;
        context.fillStyle = `rgba(${r},${g},${b},0.09)`;
        context.fillRect(0, y, box.width, h);
        context.fillStyle = `rgba(${r},${g},${b},0.9)`;
        context.fillRect(0, s.direction > 0 ? y + h - 1 : y, box.width, 1);
      }
    };

    let frame = 0;
    const render = () => {
      frame = 0;
      if (s.dirty) {
        s.dirty = false;
        draw();
      }
    };
    const requestDraw = () => {
      s.dirty = true;
      if (!frame) frame = requestAnimationFrame(render);
    };

    /** Move the read head by some page pixels and scan every row it passes. */
    const move = (delta: number) => {
      if (!s.snapshot || s.leaving) return;
      setStarted(true);
      const max = s.snapshot.height - 1;
      s.readY = Math.max(0, Math.min(max, s.readY + delta));
      s.moved += Math.abs(delta);
      const row = Math.floor(s.readY / ROW_PX);
      if (row === s.lastRow) return;
      const direction = row > s.lastRow ? 1 : -1;
      s.direction = direction;
      // Only the newest screenful matters when scrolling fast.
      const from = s.lastRow < 0 ? Math.max(0, row - s.rows + 1) : s.lastRow + direction;
      const first = Math.abs(row - from) + 1 > s.rows ? row - direction * (s.rows - 1) : from;
      // The screen stays in page order, top to bottom: scanning down adds lines at the bottom, scanning up at the top.
      for (let i = first; direction > 0 ? i <= row : i >= row; i += direction) {
        const scanned = readRow(s.snapshot, i, s.cols);
        if (direction > 0) s.screen.push(scanned);
        else s.screen.unshift(scanned);
        s.bar.push(scanned);
      }
      if (s.screen.length > s.rows) {
        if (direction > 0) s.screen.splice(0, s.screen.length - s.rows);
        else s.screen.length = s.rows;
      }
      if (s.bar.length > 16) s.bar.splice(0, s.bar.length - 16);
      s.lastRow = row;
      const section = (direction > 0 ? s.screen[s.screen.length - 1] : s.screen[0])?.section ?? "top";
      const complete = s.readY >= max - window.innerHeight * 0.2;
      setReadout({ y: Math.round(s.readY), height: s.snapshot.height, section, complete });
      requestDraw();
    };

    // Speed of scanning drives the master filter; measured ten times a second.
    const meter = window.setInterval(() => {
      s.speed = s.speed * 0.6 + (s.moved * 10) * 0.4;
      s.moved = 0;
      s.synth?.setBrightness(s.speed / 2600);
    }, 100);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      move(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1));
    };
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      const y = event.touches[0]?.clientY ?? touchY;
      move((touchY - y) * 1.6);
      touchY = y;
    };
    const onKey = (event: KeyboardEvent) => {
      const steps: Record<string, number> = { ArrowDown: 80, ArrowUp: -80, PageDown: 600, PageUp: -600, " ": 600 };
      if (event.key in steps) {
        event.preventDefault();
        move(steps[event.key]);
        power();
      } else if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        enter();
      }
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);

    const onVisibility = () => {
      const ctx = s.synth?.context;
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let snapTimer = 0;
    const resized = new ResizeObserver(() => {
      window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => {
        takeSnapshot();
        layout();
        requestDraw();
      }, 200);
    });
    resized.observe(main);
    const onResize = () => {
      layout();
      requestDraw();
    };
    window.addEventListener("resize", onResize);

    layout();
    takeSnapshot();
    void document.fonts?.ready.then(() => {
      takeSnapshot();
      requestDraw();
    });

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(meter);
      window.clearTimeout(snapTimer);
      resized.disconnect();
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      document.body.style.overflow = previousOverflow;
      s.synth?.stop(0.3);
      s.synth = null;
    };
  }, [open, enter, power]);

  // Scanned to the end: the scan completes and opens onto the page.
  useEffect(() => {
    if (!readout.complete || leaving) return;
    const timer = window.setTimeout(enter, 2200);
    return () => window.clearTimeout(timer);
  }, [readout.complete, readout.y, leaving, enter]);

  if (!open) return null;
  const percent = Math.min(100, Math.round((readout.y / Math.max(1, readout.height)) * 100));

  return (
    <div
      ref={rootRef}
      className={`scan-intro${leaving ? " is-leaving" : ""}${started ? " is-started" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Alex Projects scanner. Scroll to read the site, click for sound, Enter to go in."
      tabIndex={-1}
      onClick={power}
    >
      <canvas ref={canvasRef} className="scan-intro__canvas" aria-hidden />

      <div className="scan-intro__hud" aria-hidden>
        <b>ALEX PROJECTS</b>
        <span>{readout.complete ? "SCAN COMPLETE" : started ? "SCANNING" : "STANDBY"}</span>
        <span>y {readout.y.toString().padStart(5, "0")} / {readout.height}</span>
        <span>{percent}%</span>
        <span>§{readout.section.toUpperCase()}</span>
        <span>{BPM} BPM</span>
        <span className={powered ? "is-on" : ""}>{powered ? "● SOUND" : "○ CLICK FOR SOUND"}</span>
      </div>

      {!started && (
        <div className="scan-intro__title">
          <h1>SCAN</h1>
          <p>scroll to read this site line by line · click for sound · enter anywhere</p>
        </div>
      )}

      <div className="scan-intro__exits">
        <button type="button" onClick={(event) => { event.stopPropagation(); enter(); }}>
          {powered ? "ENTER HERE ↵" : "ENTER SILENTLY ↵"}
        </button>
      </div>
    </div>
  );
}
