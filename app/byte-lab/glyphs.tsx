import type { ReactNode } from "react";

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
/** From the densest glyph to the thinnest, the way the reference picture is shaded. */
const RAMP = ["$", "X", "1", "0", ">", "/", "."];

/** A picture as text: a ridge line with glyphs that thin out below it and a few white and blue squares. Made once, on the server. */
export function GlyphArt({ cols = 56, rows = 18, seed = 1 }: { cols?: number; rows?: number; seed?: number }) {
  const lines: ReactNode[] = [];
  for (let j = 0; j < rows; j += 1) {
    let run = ""; const parts: ReactNode[] = []; let key = 0;
    const flush = () => { if (run) { parts.push(run); run = ""; } };
    for (let i = 0; i < cols; i += 1) {
      const u = i / cols;
      const ridge = rows * (0.34 + 0.2 * Math.sin(u * 7 + seed) + 0.12 * Math.sin(u * 19 + seed * 2) + 0.18 * Math.sin(u * 3.1 + 1.3));
      if (j < ridge) { run += " "; continue; }
      const depth = (j - ridge) / (rows - ridge + 0.001);
      const n = hash(i, j + seed * 7);
      const g = RAMP[Math.min(RAMP.length - 1, Math.floor((depth * 0.9 + n * 0.45) * RAMP.length * 0.8))];
      if (depth < 0.5 && n > 0.93) { flush(); parts.push(<span key={key++} className={n > 0.965 ? "b" : "w"}>■</span>); }
      else if (n < 0.1) run += " ";
      else run += g;
    }
    flush();
    lines.push(<span key={j}>{parts}{"\n"}</span>);
  }
  return <pre className="art" aria-hidden>{lines}</pre>;
}

/** `■■■■□□□□` progress as text. */
export const bars = (value: number, width = 16) => { const n = Math.round(value * width); return <span className="bars">{"■".repeat(n)}<s>{"□".repeat(width - n)}</s></span>; };
