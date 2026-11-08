"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ink, ROW_PX, readRow, snapshotPage, type ScanRow, type ScanSnapshot } from "../lib/scanPage";
import { BPM, ScanSynth, type Step } from "../lib/scanSynth";
import { prefersReducedMotion } from "../utils/environment";

type SonicLabProps = { open: boolean; onClose: () => void };

/**
 * alexsonicLAb: an opaque instrument over the real portfolio. The read head is a fixed axis across the middle of
 * the screen; scrolling moves the page under it. Rows above the axis have been read, rows below are what comes next.
 * On the axis: the row being read as a strip of pixels, the live waveform of the music it makes, and the readout.
 * Sound lives only here: it fades out and the audio shuts down on entering the portfolio.
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
const inkColour = (ink: number, accent: [number, number, number], alpha: number) => {
  const [r, g, b] = accent;
  if (ink === Ink.Heading) return `rgba(255,255,255,${alpha})`;
  if (ink === Ink.Edge || ink === Ink.Media) return `rgba(210,214,222,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
};

export function SonicLab({ open, onClose }: SonicLabProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLCanvasElement | null>(null);
  const axisRef = useRef<HTMLCanvasElement | null>(null);
  const [powered, setPowered] = useState(false);
  const [started, setStarted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [readout, setReadout] = useState({ y: 0, height: 1, section: "top", complete: false });

  const state = useRef({
    snapshot: null as ScanSnapshot | null,
    cache: new Map<number, ScanRow>(),
    readY: 0,
    row: -1,
    bar: [] as ScanRow[],
    cols: 120,
    cell: { w: 8, h: 16 },
    size: { w: 0, h: 0 },
    fieldDirty: true,
    speed: 0,
    moved: 0,
    synth: null as ScanSynth | null,
    wave: new Uint8Array(2048),
    leaving: false,
  });

  const enter = useCallback(() => {
    const s = state.current;
    if (s.leaving) return;
    s.leaving = true;
    setLeaving(true);
    s.synth?.stop(0.7);
    s.synth = null;
    // Land with the read line where it was on screen: 40% from the top.
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
    const field = fieldRef.current;
    const axis = axisRef.current;
    const fieldCtx = field?.getContext("2d");
    const axisCtx = axis?.getContext("2d");
    const main = document.querySelector("main");
    if (!root || !field || !axis || !fieldCtx || !axisCtx || !main) return;
    const s = state.current;
    s.leaving = false;
    // Start reading where the visitor is: the line 40% down the screen they were looking at.
    s.readY = window.scrollY + window.innerHeight * 0.4;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.focus({ preventScroll: true });

    const rowAt = (index: number) => {
      let row = s.cache.get(index);
      if (!row && s.snapshot) {
        row = readRow(s.snapshot, index, s.cols);
        s.cache.set(index, row);
      }
      return row;
    };
    const maxRow = () => Math.floor(((s.snapshot?.height ?? 1) - 1) / ROW_PX);

    const takeSnapshot = () => {
      s.snapshot = snapshotPage(main);
      s.cache.clear();
      s.fieldDirty = true;
      s.row = Math.floor(s.readY / ROW_PX);
      const section = s.snapshot.sections.find((x) => s.readY >= x.top && s.readY < x.bottom)?.id ?? "top";
      setReadout((r) => ({ ...r, y: Math.round(s.readY), height: s.snapshot?.height ?? 1, section }));
    };

    const layout = () => {
      const box = root.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const [canvas, ctx] of [[field, fieldCtx], [axis, axisCtx]] as const) {
        canvas.width = Math.round(box.width * dpr);
        canvas.height = Math.round(box.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const size = box.width < 640 ? 10 : 13;
      fieldCtx.font = `${size}px ui-monospace, "SF Mono", Menlo, "JetBrains Mono", monospace`;
      fieldCtx.textBaseline = "top";
      s.cell = { w: fieldCtx.measureText("M").width, h: Math.round(size * 1.3) };
      s.cols = Math.max(20, Math.floor(box.width / s.cell.w));
      s.size = { w: box.width, h: box.height };
      s.cache.clear();
      s.fieldDirty = true;
    };

    /** The ASCII field, centred on the read head. Redrawn only when the row under the head changes. */
    const drawField = () => {
      const { w: width, h: height } = s.size;
      const { w, h } = s.cell;
      fieldCtx.clearRect(0, 0, width, height);
      const center = Math.floor(height / 2 / h);
      const lines = Math.ceil(height / h);
      const top = height / 2 - center * h - h / 2;
      for (let k = 0; k < lines; k += 1) {
        const offset = k - center;
        if (offset === 0) continue; // the axis draws the row being read
        const row = rowAt(s.row + offset);
        if (!row || s.row + offset < 0 || s.row + offset > maxRow()) continue;
        // Read rows above the axis at full strength, the rows still to come below it as ghosts; both fade with distance.
        const distance = Math.abs(offset) / center;
        const fade = (offset < 0 ? 1 : 0.22) * (1 - distance * distance * 0.75);
        const accent = ACCENT[row.section] ?? ACCENT.top;
        const y = top + k * h;
        let start = 0;
        for (let c = 1; c <= row.chars.length; c += 1) {
          if (c === row.chars.length || row.inks[c] !== row.inks[start]) {
            const ink = row.inks[start];
            if (ink !== Ink.Blank) {
              fieldCtx.fillStyle = inkColour(ink, accent, (INK_ALPHA[ink] ?? 0.5) * fade);
              fieldCtx.fillText(row.chars.slice(start, c), start * w, y);
            }
            start = c;
          }
        }
      }
    };

    /** The axis: the pixels of the row being read, the live waveform along it, and the readout. Every frame. */
    const drawAxis = () => {
      const { w: width, h: height } = s.size;
      axisCtx.clearRect(0, 0, width, height);
      const mid = Math.round(height / 2);
      const row = rowAt(s.row);
      const accent = ACCENT[row?.section ?? "top"] ?? ACCENT.top;
      const [r, g, b] = accent;

      // A dark band so the axis reads as an instrument over the field.
      axisCtx.fillStyle = "rgba(11,11,12,0.86)";
      axisCtx.fillRect(0, mid - 34, width, 68);

      // The traversed pixels: one block per column of the row under the head.
      if (row) {
        const cw = width / row.chars.length;
        for (let c = 0; c < row.chars.length; c += 1) {
          const ink = row.inks[c];
          if (ink === Ink.Blank) continue;
          axisCtx.fillStyle = inkColour(ink, accent, Math.min(1, (INK_ALPHA[ink] ?? 0.5) + 0.25));
          axisCtx.fillRect(c * cw, mid - 30, Math.max(1, cw - 1), 6);
        }
      }

      // The live waveform of the mix, drawn across the full width.
      const analyser = s.synth?.analyser;
      axisCtx.beginPath();
      if (analyser) {
        analyser.getByteTimeDomainData(s.wave);
        const n = s.wave.length;
        for (let i = 0; i < n; i += 2) {
          const x = (i / (n - 1)) * width;
          // Gain up so quiet passages still read, clamped inside the band.
          const y = mid + Math.max(-28, Math.min(28, ((s.wave[i] - 128) / 128) * 60));
          if (i === 0) axisCtx.moveTo(x, y);
          else axisCtx.lineTo(x, y);
        }
      } else {
        axisCtx.moveTo(0, mid);
        axisCtx.lineTo(width, mid);
      }
      axisCtx.strokeStyle = `rgba(${r},${g},${b},0.25)`;
      axisCtx.lineWidth = 4;
      axisCtx.stroke();
      axisCtx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
      axisCtx.lineWidth = 1.2;
      axisCtx.stroke();

      // The edges of the band.
      axisCtx.fillStyle = `rgba(${r},${g},${b},0.5)`;
      axisCtx.fillRect(0, mid - 34, width, 1);
      axisCtx.fillRect(0, mid + 33, width, 1);
    };

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = 0;
      if (document.hidden || s.leaving) return;
      if (now - last >= 33) {
        last = now;
        if (s.fieldDirty) {
          s.fieldDirty = false;
          drawField();
        }
        drawAxis();
      }
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
    };

    /** Move the page under the read head and feed every row it passes to the music. */
    const move = (delta: number) => {
      if (!s.snapshot || s.leaving) return;
      setStarted(true);
      const max = s.snapshot.height - 1;
      s.readY = Math.max(0, Math.min(max, s.readY + delta));
      s.moved += Math.abs(delta);
      const row = Math.floor(s.readY / ROW_PX);
      if (row === s.row) return;
      const direction = row > s.row ? 1 : -1;
      const from = Math.abs(row - s.row) > 16 ? row - direction * 15 : s.row + direction;
      for (let i = from; direction > 0 ? i <= row : i >= row; i += direction) {
        const scanned = rowAt(i);
        if (scanned) s.bar.push(scanned);
      }
      if (s.bar.length > 16) s.bar.splice(0, s.bar.length - 16);
      s.row = row;
      s.fieldDirty = true;
      const complete = s.readY >= max - window.innerHeight * 0.2;
      setReadout({ y: Math.round(s.readY), height: s.snapshot.height, section: rowAt(row)?.section ?? "top", complete });
    };

    // Speed of scanning drives the master filter; measured ten times a second.
    const meter = window.setInterval(() => {
      s.speed = s.speed * 0.6 + s.moved * 10 * 0.4;
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
      if (ctx) void (document.hidden ? ctx.suspend() : ctx.resume());
      run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let snapTimer = 0;
    const resized = new ResizeObserver(() => {
      window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(takeSnapshot, 200);
    });
    resized.observe(main);
    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    layout();
    takeSnapshot();
    void document.fonts?.ready.then(takeSnapshot);
    run();

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
      s.bar = [];
    };
  }, [open, enter, power]);

  // Reset for the next time the Lab is opened from the header.
  useEffect(() => {
    if (open) return;
    setLeaving(false);
    setStarted(false);
    setPowered(false);
  }, [open]);

  // Scanned to the end: the scan completes and opens onto the page.
  useEffect(() => {
    if (!open || !readout.complete || leaving) return;
    const timer = window.setTimeout(enter, 2200);
    return () => window.clearTimeout(timer);
  }, [open, readout.complete, readout.y, leaving, enter]);

  if (!open) return null;
  const percent = Math.min(100, Math.round((readout.y / Math.max(1, readout.height)) * 100));

  return (
    <div
      ref={rootRef}
      className={`sonic-lab${leaving ? " is-leaving" : ""}${started ? " is-started" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="alexsonicLAb. Scroll to read the site, click for sound, Enter to go to the portfolio."
      tabIndex={-1}
      onClick={power}
    >
      <canvas ref={fieldRef} className="sonic-lab__canvas" aria-hidden />
      <canvas ref={axisRef} className="sonic-lab__canvas" aria-hidden />

      <div className="sonic-lab__name">
        <b>alexsonicLAb</b>
        <span>an instrument that reads this site</span>
      </div>

      {/* The readout rides on the axis, above and below the band. */}
      <div className="sonic-lab__readout sonic-lab__readout--top" aria-hidden>
        <span>{readout.complete ? "SCAN COMPLETE" : started ? "SCANNING" : "STANDBY"}</span>
        <span>y {readout.y.toString().padStart(5, "0")} / {readout.height}</span>
        <span>{percent}%</span>
        <span>§{readout.section.toUpperCase()}</span>
      </div>
      <div className="sonic-lab__readout sonic-lab__readout--bottom" aria-hidden>
        <span>{BPM} BPM</span>
        <span className={powered ? "is-on" : ""}>{powered ? "● SOUND" : "○ CLICK FOR SOUND"}</span>
        <span>{started ? "SCROLL ↑↓ TO READ" : "SCROLL TO READ · CLICK FOR SOUND"}</span>
      </div>

      <div className="sonic-lab__exits">
        <button type="button" onClick={(event) => { event.stopPropagation(); enter(); }}>
          {powered ? "ENTER HERE ↵" : "ENTER SILENTLY ↵"}
        </button>
      </div>
    </div>
  );
}
