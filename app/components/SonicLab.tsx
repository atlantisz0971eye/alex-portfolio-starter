"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYERS, STYLES, styleById, type PlayerId, type StyleId } from "../data/sonicStyles";
import { Ink, ROW_PX, readRow, snapshotPage, type ScanRow, type ScanSnapshot } from "../lib/scanPage";
import { compose } from "../lib/sonicPlayers";
import { SonicSynth } from "../lib/sonicSynth";
import { prefersReducedMotion } from "../utils/environment";
import { SonicDeck, type DeckState } from "./SonicDeck";

type SonicLabProps = { open: boolean; onClose: () => void };

/**
 * alexsonicLAb: an opaque instrument over the real portfolio. The read head is a fixed axis across the screen;
 * scrolling moves the page under it. Rows above the axis have been read, rows below are what comes next. On the
 * axis: the row being read as a strip of pixels, the live waveform, and the readout. Below, an ASCII DJ deck picks
 * the style and mixes the five players. Sound lives only here and shuts down on entering the portfolio.
 */

const AXIS = 0.4; // the read head sits 40% down the screen, so the deck fits underneath
const STORAGE_KEY = "alexsonicLAb";

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

const INK_ALPHA: Record<number, number> = { [Ink.Edge]: 0.5, [Ink.Text]: 0.72, [Ink.Heading]: 1, [Ink.Media]: 0.32, [Ink.Rule]: 0.9, [Ink.Link]: 0.6 };
const inkColour = (ink: number, accent: [number, number, number], alpha: number) => {
  const [r, g, b] = accent;
  if (ink === Ink.Heading) return `rgba(255,255,255,${alpha})`;
  if (ink === Ink.Edge || ink === Ink.Media) return `rgba(210,214,222,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
};

const isPlayer = (value: string): value is PlayerId => PLAYERS.some((player) => player.id === value);

/** The visitor's last setup, then anything a shared link asks for. */
function initialDeck(): DeckState {
  let saved: Partial<DeckState> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    // A fresh deck when storage is unavailable.
  }
  const params = new URLSearchParams(window.location.search);
  const style = styleById(params.get("style") ?? saved.style);
  const fromLink = params.has("style");
  const list = (name: string, fallback?: PlayerId[]) => {
    const raw = params.get(name);
    return raw === null ? (fallback ?? []).filter(isPlayer) : raw.split(",").filter(isPlayer);
  };
  return {
    style: style.id,
    pending: null,
    levels: !fromLink && saved.levels && saved.style === style.id ? { ...style.mix, ...saved.levels } : { ...style.mix },
    mutes: list("mute", fromLink ? [] : saved.mutes),
    solos: list("solo", fromLink ? [] : saved.solos),
    delay: typeof saved.delay === "number" && !fromLink ? saved.delay : 0.5,
    reverb: typeof saved.reverb === "number" && !fromLink ? saved.reverb : 0.5,
  };
}

export function SonicLab({ open, onClose }: SonicLabProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLCanvasElement | null>(null);
  const axisRef = useRef<HTMLCanvasElement | null>(null);
  const [powered, setPowered] = useState(false);
  const [started, setStarted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [readout, setReadout] = useState({ y: 0, height: 1, section: "top", complete: false });
  const [deck, setDeck] = useState<DeckState | null>(null);
  const deckRef = useRef<DeckState | null>(null);
  deckRef.current = deck;
  const live = useRef(new Map<string, HTMLSpanElement>());

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
    cutoff: 380,
    synth: null as SonicSynth | null,
    wave: new Uint8Array(2048),
    leaving: false,
  });

  /** Send the deck to the synth: style, the level of each player after mute and solo, and the effect sends. */
  const applyDeck = useCallback((d: DeckState) => {
    const synth = state.current.synth;
    if (!synth) return;
    synth.setStyle(styleById(d.pending ?? d.style));
    for (const player of PLAYERS) {
      const silenced = d.mutes.includes(player.id) || (d.solos.length > 0 && !d.solos.includes(player.id));
      synth.setLevel(player.id, silenced ? 0 : d.levels[player.id]);
    }
    synth.setSends(d.delay, d.reverb);
  }, []);

  const updateDeck = useCallback((change: (d: DeckState) => DeckState) => {
    const current = deckRef.current;
    if (!current) return;
    const next = change(current);
    deckRef.current = next;
    setDeck(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, pending: null, style: next.pending ?? next.style }));
    } catch {
      // The setup is simply not remembered.
    }
    applyDeck(next);
  }, [applyDeck]);

  const chooseStyle = useCallback((id: StyleId) => {
    // A new style brings its own mix; with the sound on it starts at the next bar line.
    const levels = { ...styleById(id).mix };
    updateDeck((d) => (state.current.synth ? { ...d, pending: id === d.style ? null : id, levels } : { ...d, style: id, pending: null, levels }));
  }, [updateDeck]);
  const toggle = useCallback((list: "mutes" | "solos", player: PlayerId) => {
    updateDeck((d) => ({ ...d, [list]: d[list].includes(player) ? d[list].filter((p) => p !== player) : [...d[list], player] }));
  }, [updateDeck]);

  const share = useCallback(async () => {
    const d = deckRef.current;
    if (!d) return false;
    const parts = [`scan`, `style=${d.pending ?? d.style}`];
    if (d.mutes.length) parts.push(`mute=${d.mutes.join(",")}`);
    if (d.solos.length) parts.push(`solo=${d.solos.join(",")}`);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?${parts.join("&")}`);
      return true;
    } catch {
      return false;
    }
  }, []);

  const enter = useCallback(() => {
    const s = state.current;
    if (s.leaving) return;
    s.leaving = true;
    setLeaving(true);
    s.synth?.stop(0.7);
    s.synth = null;
    // Land with the read line where it was on screen.
    const target = Math.max(0, s.readY - window.innerHeight * AXIS);
    window.setTimeout(() => {
      onClose();
      window.setTimeout(() => window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior }), 30);
    }, prefersReducedMotion ? 0 : 720);
  }, [onClose]);

  const power = useCallback(() => {
    const s = state.current;
    setStarted(true);
    const d = deckRef.current;
    if (s.synth || s.leaving || !d) return;
    try {
      const synth = new SonicSynth(styleById(d.style), (style, step) => compose(style, s.bar, step));
      // When a pending style starts on the bar line, the deck shows it as the one playing.
      synth.onBar = (style) => {
        const current = deckRef.current;
        if (current?.pending === style.id) {
          const next = { ...current, style: style.id, pending: null };
          deckRef.current = next;
          setDeck(next);
        }
      };
      s.synth = synth;
      applyDeck(d);
      synth.start();
      setPowered(true);
    } catch {
      setPowered(false); // no Web Audio: the scan still works, silently
    }
  }, [applyDeck]);

  useEffect(() => {
    if (!open) return;
    const initial = initialDeck();
    deckRef.current = initial;
    setDeck(initial);
  }, [open]);

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
    // Start reading where the visitor is: the line at the axis height of the screen they were looking at.
    s.readY = window.scrollY + window.innerHeight * AXIS;
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

    /** The ASCII field around the read head. Redrawn only when the row under the head changes. */
    const drawField = () => {
      const { w: width, h: height } = s.size;
      const { w, h } = s.cell;
      fieldCtx.clearRect(0, 0, width, height);
      const axisY = height * AXIS;
      const center = Math.floor(axisY / h);
      const lines = Math.ceil(height / h);
      const top = axisY - center * h - h / 2;
      for (let k = 0; k < lines; k += 1) {
        const offset = k - center;
        if (offset === 0) continue; // the axis draws the row being read
        const index = s.row + offset;
        if (index < 0 || index > maxRow()) continue;
        const row = rowAt(index);
        if (!row) continue;
        // Read rows above the axis at full strength, rows still to come below it as ghosts; both fade with distance.
        const distance = Math.min(1, Math.abs(offset) / Math.max(center, lines - center));
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

    /** The axis: the pixels of the row being read, the live waveform along it. Every frame. */
    const drawAxis = () => {
      const { w: width, h: height } = s.size;
      axisCtx.clearRect(0, 0, width, height);
      const mid = Math.round(height * AXIS);
      const row = rowAt(s.row);
      const accent = ACCENT[row?.section ?? "top"] ?? ACCENT.top;
      const [r, g, b] = accent;
      axisCtx.fillStyle = "rgba(11,11,12,0.86)";
      axisCtx.fillRect(0, mid - 34, width, 68);
      if (row) {
        const cw = width / row.chars.length;
        for (let c = 0; c < row.chars.length; c += 1) {
          const ink = row.inks[c];
          if (ink === Ink.Blank) continue;
          axisCtx.fillStyle = inkColour(ink, accent, Math.min(1, (INK_ALPHA[ink] ?? 0.5) + 0.25));
          axisCtx.fillRect(c * cw, mid - 30, Math.max(1, cw - 1), 6);
        }
      }
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
      axisCtx.fillStyle = `rgba(${r},${g},${b},0.5)`;
      axisCtx.fillRect(0, mid - 34, width, 1);
      axisCtx.fillRect(0, mid + 33, width, 1);
    };

    /** The deck's meters, filter readout and step lights, written straight into their spans. */
    const drawLive = () => {
      const synth = s.synth;
      for (const [name, element] of live.current) {
        const length = element.textContent?.length ?? 0;
        if (!length) continue;
        if (name.startsWith("meter:")) {
          // A muted (or soloed-out) player's meter stays dark even though it keeps reading.
          const player = name.slice(6) as PlayerId;
          const d = deckRef.current;
          const silenced = !d || d.mutes.includes(player) || (d.solos.length > 0 && !d.solos.includes(player));
          const level = synth && !silenced ? synth.activity(player) : 0;
          const lit = Math.round(level * length);
          element.textContent = "▮".repeat(lit) + "·".repeat(length - lit);
        } else if (name === "filter") {
          const amount = Math.log(s.cutoff / 380) / Math.log(9580 / 380);
          const lit = Math.round(Math.max(0, Math.min(1, amount)) * length);
          element.textContent = "▇".repeat(lit) + "▁".repeat(length - lit);
        } else if (name === "steps") {
          const step = synth ? synth.playhead() : -1;
          element.textContent = Array.from({ length }, (_, i) => (i === step ? "■" : i % 4 === 0 ? "▪" : "·")).join("");
        }
      }
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
        drawLive();
      }
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
    };

    /** Move the page under the read head and feed every row it passes to the players. */
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
      if (s.synth) s.cutoff = s.synth.setBrightness(s.speed / 2600);
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
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const steps: Record<string, number> = { ArrowDown: 80, ArrowUp: -80, PageDown: 600, PageUp: -600, " ": 600 };
      const style = STYLES.find((x) => x.key === event.key);
      const player = PLAYERS.find((x) => `Key${x.key.toUpperCase()}` === event.code);
      if (event.key in steps) {
        event.preventDefault();
        move(steps[event.key]);
        power();
      } else if (style) {
        event.preventDefault();
        power();
        chooseStyle(style.id);
      } else if (player) {
        event.preventDefault();
        power();
        toggle(event.shiftKey ? "solos" : "mutes", player.id);
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
  }, [open, enter, power, chooseStyle, toggle]);

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

  const registerLive = useCallback((name: string, element: HTMLSpanElement | null) => {
    if (element) live.current.set(name, element);
    else live.current.delete(name);
  }, []);

  if (!open) return null;
  const percent = Math.min(100, Math.round((readout.y / Math.max(1, readout.height)) * 100));
  const playing = styleById(deck?.style);

  return (
    <div
      ref={rootRef}
      className={`sonic-lab${leaving ? " is-leaving" : ""}${started ? " is-started" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="alexsonicLAb. Scroll to read the site, click for sound, keys 1 to 6 change style, Enter to go to the portfolio."
      tabIndex={-1}
      onClick={power}
    >
      <canvas ref={fieldRef} className="sonic-lab__canvas" aria-hidden />
      <canvas ref={axisRef} className="sonic-lab__canvas" aria-hidden />

      <div className="sonic-lab__name">
        <b>alexsonicLAb</b>
        <span>an instrument that reads this site</span>
      </div>

      <div className="sonic-lab__readout sonic-lab__readout--top" aria-hidden>
        <span>{readout.complete ? "SCAN COMPLETE" : started ? "SCANNING" : "STANDBY"}</span>
        <span>y {readout.y.toString().padStart(5, "0")} / {readout.height}</span>
        <span>{percent}%</span>
        <span>§{readout.section.toUpperCase()}</span>
      </div>
      <div className="sonic-lab__readout sonic-lab__readout--bottom" aria-hidden>
        <span>{playing.name}</span>
        <span className={powered ? "is-on" : ""}>{powered ? "● SOUND" : "○ CLICK FOR SOUND"}</span>
        <span>{started ? "SCROLL ↑↓ TO READ" : "SCROLL TO READ · CLICK FOR SOUND"}</span>
      </div>

      <div className="sonic-lab__exits">
        <button type="button" onClick={(event) => { event.stopPropagation(); enter(); }}>
          {powered ? "ENTER HERE ↵" : "ENTER SILENTLY ↵"}
        </button>
      </div>

      {deck && (
        <SonicDeck
          state={deck}
          bpm={styleById(deck.pending ?? deck.style).bpm}
          onStyle={chooseStyle}
          onLevel={(player, level) => updateDeck((d) => ({ ...d, levels: { ...d.levels, [player]: level } }))}
          onMute={(player) => toggle("mutes", player)}
          onSolo={(player) => toggle("solos", player)}
          onSends={(delay, reverb) => updateDeck((d) => ({ ...d, delay, reverb }))}
          onShare={share}
          registerLive={registerLive}
        />
      )}
    </div>
  );
}
