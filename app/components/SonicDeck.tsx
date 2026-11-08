"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PLAYERS, STYLES, type PlayerId, type StyleId } from "../data/sonicStyles";

/**
 * The DJ deck of alexsonicLAb, drawn as a real grid of monospace characters with box-drawing borders. The style
 * keys, faders, mute and solo, the effect bars and the share key are characters in that grid that can be pressed.
 * Meters, the filter readout and the step lights are written straight into their spans by the Lab, every frame.
 */

export type DeckState = {
  style: StyleId;
  pending: StyleId | null;
  levels: Record<PlayerId, number>;
  mutes: PlayerId[];
  solos: PlayerId[];
  delay: number;
  reverb: number;
};

type DeckProps = {
  state: DeckState;
  bpm: number;
  onStyle: (id: StyleId) => void;
  onLevel: (player: PlayerId, level: number) => void;
  onMute: (player: PlayerId) => void;
  onSolo: (player: PlayerId) => void;
  onSends: (delay: number, reverb: number) => void;
  onShare: () => Promise<boolean>;
  /** The Lab writes live readouts into these spans: "meter:<player>", "filter", "steps". */
  registerLive: (name: string, element: HTMLSpanElement | null) => void;
};

type Cell = { text: string; className?: string; title?: string; onClick?: () => void; fader?: { player: PlayerId; level: number }; live?: string };

const FADER_ROWS = 5;
const pad = (text: string, width: number) => (text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length));

export function SonicDeck({ state, bpm, onStyle, onLevel, onMute, onSolo, onSends, onShare, registerLive }: DeckProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLSpanElement | null>(null);
  const [cols, setCols] = useState(0);
  const [copied, setCopied] = useState(false);
  const dragging = useRef<PlayerId | null>(null);

  // How many characters fit across: the deck is laid out in whole characters.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const probe = probeRef.current;
    if (!root || !probe) return;
    const measure = () => {
      const charWidth = probe.getBoundingClientRect().width / 10 || 7.8;
      setCols(Math.floor(root.clientWidth / charWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stop = () => { dragging.current = null; };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const share = async () => {
    const ok = await onShare();
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const lines: Cell[][] = [];
  const text = (t: string, className?: string): Cell => ({ text: t, className });
  const styleKeys = (): Cell[] =>
    STYLES.flatMap((style) => [
      {
        text: ` ${style.key} ${style.name} `,
        className: style.id === state.style ? "is-on" : style.id === state.pending ? "is-pending" : "is-key",
        title: `${style.name} · ${style.bpm} BPM`,
        onClick: () => onStyle(style.id),
      },
      text(" "),
    ]);
  const width = (cells: Cell[]) => cells.reduce((sum, cell) => sum + cell.text.length, 0);
  /** One full line between borders: left cells, then right cells pushed to the right edge. */
  const row = (left: Cell[], right: Cell[] = [], border = "│"): Cell[] => {
    const gap = Math.max(1, cols - 2 - width(left) - width(right));
    return [text(border, "is-frame"), ...left, text(" ".repeat(gap)), ...right, text(border, "is-frame")];
  };
  const muted = (player: PlayerId) => state.mutes.includes(player) || (state.solos.length > 0 && !state.solos.includes(player));

  if (cols >= 96) {
    // Six columns: five players and the master.
    const colWidth = Math.floor((cols - 1) / 6);
    const last = cols - 1 - colWidth * 5;
    const inner = (i: number) => (i === 5 ? last : colWidth) - 1;
    const rule = (left: string, mid: string, right: string) => text(left + Array.from({ length: 6 }, (_, i) => "─".repeat(inner(i))).join(mid) + right, "is-frame");
    const columns = (cells: (i: number) => Cell[]): Cell[] => {
      const out: Cell[] = [text("│", "is-frame")];
      for (let i = 0; i < 6; i += 1) {
        const content = cells(i);
        out.push(...content, text(" ".repeat(Math.max(0, inner(i) - width(content)))), text("│", "is-frame"));
      }
      return out;
    };
    const bar = (value: number, cells: number, set: (v: number) => void): Cell[] =>
      Array.from({ length: cells }, (_, k) => ({ text: k < Math.round(value * cells) ? "█" : "░", className: "is-bar", onClick: () => set((k + 1) / cells) }));

    const title = " alexsonicLAb · DECK ";
    lines.push([text("┌─" + title + "─".repeat(Math.max(0, cols - 3 - title.length)) + "┐", "is-frame")]);
    lines.push(row([text(" STYLE ", "is-dim"), ...styleKeys()], [text(`${bpm} BPM `, "is-bright")]));
    lines.push([rule("├", "┬", "┤")]);
    lines.push(columns((i) => (i < 5 ? [text(" " + PLAYERS[i].name, muted(PLAYERS[i].id) ? "is-dim" : "is-bright")] : [text(" MASTER", "is-bright")])));
    lines.push(columns((i) => (i < 5
      ? [text(` ${PLAYERS[i].reads}→${PLAYERS[i].plays}`, "is-dim")]
      : [text(" FILTER ", "is-dim"), { text: pad("", Math.max(4, inner(i) - 9)), live: "filter", className: "is-meter" }])));
    for (let r = 0; r < FADER_ROWS; r += 1) {
      const threshold = (FADER_ROWS - r) / FADER_ROWS;
      lines.push(columns((i) => {
        if (i < 5) {
          const player = PLAYERS[i].id;
          const level = state.levels[player];
          const cells: Cell[] = [text(" "), { text: level >= threshold - 0.001 ? "▐█▌" : " │ ", className: muted(player) ? "is-fader is-dim" : "is-fader", fader: { player, level: threshold } }, text(" ")];
          if (r === 0) cells.push(text(`${Math.round(level * 100)}%`.padStart(4), "is-dim"));
          if (r === 2) cells.push({ text: pad("", Math.max(3, inner(i) - 6)), live: `meter:${player}`, className: "is-meter" });
          return cells;
        }
        if (r === 0) return [text(" DELAY ", "is-dim"), ...bar(state.delay, Math.max(4, inner(i) - 8), (v) => onSends(v, state.reverb))];
        if (r === 1) return [text(" VERB  ", "is-dim"), ...bar(state.reverb, Math.max(4, inner(i) - 8), (v) => onSends(state.delay, v))];
        if (r === 2) return [text(" STEP  ", "is-dim"), { text: pad("", 16), live: "steps", className: "is-meter" }];
        if (r === 3) return [text(" "), { text: copied ? "[COPIED]" : "[SHARE ⧉]", className: "is-key", title: "Copy a link to this setup", onClick: () => void share() }];
        return [text(" KEYS 1–6 · QWERT", "is-dim")];
      }));
    }
    lines.push(columns((i) => {
      if (i === 5) return [text(" ⇧+QWERT SOLO", "is-dim")];
      const player = PLAYERS[i].id;
      return [
        text(" "),
        { text: "[M]", className: state.mutes.includes(player) ? "is-on" : "is-key", title: `Mute ${PLAYERS[i].name}`, onClick: () => onMute(player) },
        text(" "),
        { text: "[S]", className: state.solos.includes(player) ? "is-on" : "is-key", title: `Solo ${PLAYERS[i].name}`, onClick: () => onSolo(player) },
        text(` ${PLAYERS[i].key.toUpperCase()}`, "is-dim"),
      ];
    }));
    lines.push([rule("└", "┴", "┘")]);
  } else if (cols > 0) {
    // Narrow screens: style keys, then one key per player that mutes it.
    lines.push([text("┌─ alexsonicLAb " + "─".repeat(Math.max(0, cols - 17)) + "┐", "is-frame")]);
    let current: Cell[] = [];
    for (const cell of styleKeys()) {
      if (width(current) + cell.text.length > cols - 3) {
        lines.push(row(current));
        current = [];
      }
      current.push(cell);
    }
    if (current.length) lines.push(row(current, [text(`${bpm} `, "is-bright")]));
    let players: Cell[] = [];
    for (const player of PLAYERS) {
      const cell: Cell = { text: `[${player.name.slice(0, 5)}]`, className: muted(player.id) ? "is-dim" : "is-on", onClick: () => onMute(player.id) };
      if (width(players) + cell.text.length + 1 > cols - 3) {
        lines.push(row(players));
        players = [];
      }
      players.push(cell, text(" "));
    }
    if (players.length) lines.push(row(players));
    lines.push([text("└" + "─".repeat(Math.max(0, cols - 2)) + "┘", "is-frame")]);
  }

  const render = (cell: Cell, key: number): ReactNode => {
    if (cell.live) return <span key={key} ref={(el) => registerLive(cell.live!, el)} className={cell.className}>{cell.text}</span>;
    if (cell.fader) {
      const { player, level } = cell.fader;
      return (
        <span
          key={key}
          role="slider"
          aria-label={`${player} level`}
          aria-valuenow={Math.round(state.levels[player] * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className={cell.className}
          onPointerDown={(event) => {
            event.preventDefault();
            dragging.current = player;
            onLevel(player, level);
          }}
          onPointerEnter={() => dragging.current === player && onLevel(player, level)}
        >
          {cell.text}
        </span>
      );
    }
    if (cell.onClick) {
      return (
        <button key={key} type="button" className={cell.className} title={cell.title} onClick={() => cell.onClick!()}>
          {cell.text}
        </button>
      );
    }
    return <span key={key} className={cell.className}>{cell.text}</span>;
  };

  return (
    <div ref={rootRef} className="sonic-deck">
      <span ref={probeRef} className="sonic-deck__probe" aria-hidden>0000000000</span>
      {lines.map((line, index) => (
        <div key={index} className="sonic-deck__line">{line.map(render)}</div>
      ))}
    </div>
  );
}
