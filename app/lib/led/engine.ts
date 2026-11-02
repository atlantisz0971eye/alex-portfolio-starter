/**
 * An LED panel as a program: a grid of bulbs, each with a brightness and a colour, that something else drives.
 * Painters write into the grid (dot-matrix text, halftone pictures, ASCII art, bars); `render` shows it with bloom
 * and a little persistence so changes fade and flip like real diodes. Nothing here knows what is being shown.
 */
export const PALETTE = {
  amber: [255, 168, 0], red: [255, 62, 50], green: [70, 255, 130], cyan: [64, 218, 255], white: [255, 240, 220], magenta: [255, 70, 170], blue: [96, 130, 255],
} as const;
export type Colour = keyof typeof PALETTE;
const NAMES = Object.keys(PALETTE) as Colour[];
const LEVELS = 9;
/** How bright each colour looks as a grey, so a monochrome panel keeps the differences between colours as differences in brightness. */
const WEIGHT = NAMES.map((name) => { const [r, g, b] = PALETTE[name]; return 0.4 + 0.6 * ((0.299 * r + 0.587 * g + 0.114 * b) / 255 / 0.96); });

export type Bitmap = { w: number; h: number; on: Uint8Array };
export type TextOpts = { font?: "px" | "cjk" | "mono"; size?: number; scale?: number; colour?: Colour; lum?: number; align?: "left" | "center" | "right"; erase?: boolean; clip?: [number, number] };
export type Hit = { id: string; x: number; y: number; w: number; h: number };

const FONTS = { px: '"Silkscreen", "Press Start 2P", monospace', cjk: '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif', mono: 'ui-monospace, "SF Mono", Menlo, monospace' };
/** The classic 5×7 dot-matrix face, 0x20 to 0x5F: five columns per glyph, bit 0 is the top row. */
const GLYPHS = [
  "0000000000", "00005F0000", "0007000700", "147F147F14", "242A7F2A12", "2313086462", "3649552250", "0005030000", "001C224100", "0041221C00", "14083E0814", "08083E0808", "0050300000", "0808080808", "0060600000", "2010080402", "3E5149453E", "00427F4000", "4261514946", "2141454B31", "1814127F10", "2745454539", "3C4A494930", "0171090503", "3649494936", "064949291E", "0036360000", "0056360000", "0814224100", "1414141414", "0041221408", "0201510906", "324979413E", "7E1111117E", "7F49494936", "3E41414122", "7F4141221C", "7F49494941", "7F09090901", "3E4149497A", "7F0808087F", "00417F4100", "2040413F01", "7F08142241", "7F40404040", "7F020C027F", "7F0408107F", "3E4141413E", "7F09090906", "3E4151215E", "7F09192946", "4649494931", "01017F0101", "3F4040403F", "1F2040201F", "3F4038403F", "6314081463", "0708700807", "6151494543", "007F414100", "0204081020", "0041417F00", "0402010204", "4040404040",
];
const bitmaps = new Map<string, Bitmap>();

/** Text as a bitmap of on/off cells, found by drawing it small and keeping what is dark enough. Cached. */
export function raster(str: string, font: keyof typeof FONTS, size: number): Bitmap {
  const key = `${font}|${size}|${str}`;
  const found = bitmaps.get(key);
  if (found) return found;
  if (font === "px") {
    const w = Math.max(1, str.length * 6 - 1), on = new Uint8Array(w * 8);
    [...str].forEach((ch, n) => {
      const glyph = GLYPHS[ch.charCodeAt(0) - 32]; if (!glyph) return;
      for (let col = 0; col < 5; col += 1) { const bits = parseInt(glyph.slice(col * 2, col * 2 + 2), 16); for (let row = 0; row < 7; row += 1) if (bits & (1 << row)) on[row * w + n * 6 + col] = 1; }
    });
    const bitmap = { w, h: 8, on }; bitmaps.set(key, bitmap); return bitmap;
  }
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  const spec = `${font === "cjk" ? 400 : 700} ${size}px ${FONTS[font]}`;
  g.font = spec;
  const w = Math.max(1, Math.ceil(g.measureText(str).width) + 1);
  const h = Math.ceil(size * 1.3);
  canvas.width = w; canvas.height = h;
  g.font = spec; g.textBaseline = "top"; g.fillStyle = "#fff";
  g.fillText(str, 0, font === "cjk" ? 0 : 1);
  const data = g.getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i += 1) on[i] = data[i * 4 + 3] > (font === "cjk" ? 140 : 128) ? 1 : 0;
  const bitmap = { w, h, on };
  if (bitmaps.size > 800) bitmaps.clear();
  bitmaps.set(key, bitmap);
  return bitmap;
}

export class LedPanel {
  cols = 0; rows = 0; pitch = 6; dpr = 1;
  target = new Float32Array(0); colour = new Uint8Array(0); cur = new Float32Array(0);
  hits: Hit[] = [];
  /** When set, every bulb shows in this one colour and the original colour only decides how bright. */
  mono: Colour | null = null;
  private off: HTMLCanvasElement | null = null;
  private sprites: HTMLCanvasElement[][] = [];
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext("2d")!; }

  /** Sizes the grid to the window: about `cols` bulbs across. */
  resize(width: number, height: number, pitch: number, dpr: number) {
    this.pitch = pitch; this.dpr = dpr;
    this.cols = Math.floor(width / pitch); this.rows = Math.floor(height / pitch);
    this.canvas.width = Math.floor(width * dpr); this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    const n = this.cols * this.rows;
    this.target = new Float32Array(n); this.colour = new Uint8Array(n); this.cur = new Float32Array(n);
    this.buildSprites(); this.buildOff();
  }

  private buildSprites() {
    const P = this.pitch * this.dpr;
    const S = Math.ceil(P * 3.6);
    this.sprites = NAMES.map((name) => {
      const [r, g, b] = PALETTE[name];
      return Array.from({ length: LEVELS }, (_, level) => {
        const c = document.createElement("canvas"); c.width = c.height = S;
        const x = c.getContext("2d")!;
        const v = level / (LEVELS - 1);
        if (level === 0) return c;
        // Halftone: the lit dot itself grows with brightness, so a picture is dots of different sizes.
        const core = P * (0.13 + 0.33 * v);
        const halo = P * (0.55 + 1.15 * v);
        const glow = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, halo);
        glow.addColorStop(0, `rgba(${r},${g},${b},${0.5 * v})`); glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        x.fillStyle = glow; x.fillRect(0, 0, S, S);
        const dot = x.createRadialGradient(S / 2 - core * 0.2, S / 2 - core * 0.2, 0, S / 2, S / 2, core);
        dot.addColorStop(0, `rgba(255,255,255,${0.55 + 0.4 * v})`); dot.addColorStop(0.35, `rgba(${r},${g},${b},1)`); dot.addColorStop(1, `rgba(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(b * 0.7)},1)`);
        x.fillStyle = dot; x.beginPath(); x.arc(S / 2, S / 2, core, 0, Math.PI * 2); x.fill();
        return c;
      });
    });
  }

  /** The unlit panel, drawn once: a dark housing, a dark bulb in every cell, seams between 32-cell cabinets. */
  private buildOff() {
    const P = this.pitch * this.dpr;
    const c = document.createElement("canvas"); c.width = this.canvas.width; c.height = this.canvas.height;
    const x = c.getContext("2d")!;
    x.fillStyle = "#050507"; x.fillRect(0, 0, c.width, c.height);
    const bulb = document.createElement("canvas"); bulb.width = bulb.height = Math.ceil(P);
    const b = bulb.getContext("2d")!;
    const grad = b.createRadialGradient(P * 0.42, P * 0.38, 0, P / 2, P / 2, P * 0.42);
    grad.addColorStop(0, "#26272d"); grad.addColorStop(0.7, "#121318"); grad.addColorStop(1, "#0a0b0e");
    b.fillStyle = grad; b.beginPath(); b.arc(P / 2, P / 2, P * 0.4, 0, Math.PI * 2); b.fill();
    for (let j = 0; j < this.rows; j += 1) for (let i = 0; i < this.cols; i += 1) x.drawImage(bulb, i * P, j * P);
    x.fillStyle = "rgba(0,0,0,.55)";
    for (let i = 32; i < this.cols; i += 32) x.fillRect(i * P - 1, 0, 2, c.height);
    for (let j = 32; j < this.rows; j += 32) x.fillRect(0, j * P - 1, c.width, 2);
    this.off = c;
  }

  // ---- writing into the grid ---------------------------------------------------------------------------------
  clear() { this.target.fill(0); this.hits = []; }
  idx(x: number, y: number) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows ? y * this.cols + x : -1; }
  set(x: number, y: number, lum: number, colour: Colour) {
    x = Math.round(x); y = Math.round(y);
    const i = this.idx(x, y); if (i < 0) return;
    this.target[i] = Math.max(0, Math.min(1, lum)); this.colour[i] = NAMES.indexOf(colour);
  }
  /** Lights only where it is brighter than what is there, so overlapping light adds up the way light does. */
  add(x: number, y: number, lum: number, colour: Colour) {
    const i = this.idx(Math.round(x), Math.round(y)); if (i < 0) return;
    if (lum > this.target[i]) { this.target[i] = Math.min(1, lum); this.colour[i] = NAMES.indexOf(colour); }
  }
  rect(x: number, y: number, w: number, h: number, lum = 1, colour: Colour = "amber") { for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) this.set(x + i, y + j, lum, colour); }
  frame(x: number, y: number, w: number, h: number, lum = 0.8, colour: Colour = "amber") { for (let i = 0; i < w; i += 1) { this.set(x + i, y, lum, colour); this.set(x + i, y + h - 1, lum, colour); } for (let j = 0; j < h; j += 1) { this.set(x, y + j, lum, colour); this.set(x + w - 1, y + j, lum, colour); } }
  hit(id: string, x: number, y: number, w: number, h: number) { this.hits.push({ id, x, y, w, h }); }

  /** Dot-matrix text. `size` is the pixel height of the face (8 for the pixel font, 12 for Chinese); `scale` multiplies every dot. */
  text(str: string, x: number, y: number, o: TextOpts = {}): number {
    const font = o.font ?? "px", size = o.size ?? (font === "cjk" ? 12 : 8), scale = o.scale ?? 1, lum = o.lum ?? 1, colour = o.colour ?? "amber";
    const bm = raster(font === "px" ? str.toUpperCase() : str, font, size);
    const width = bm.w * scale;
    const left = o.align === "center" ? x - Math.floor(width / 2) : o.align === "right" ? x - width : x;
    for (let j = 0; j < bm.h; j += 1) for (let i = 0; i < bm.w; i += 1) {
      if (!bm.on[j * bm.w + i]) continue;
      for (let sy = 0; sy < scale; sy += 1) for (let sx = 0; sx < scale; sx += 1) {
        const cx = left + i * scale + sx; if (o.clip && (cx < o.clip[0] || cx >= o.clip[1])) continue;
        if (o.erase) this.set(cx, y + j * scale + sy, 0, colour); else this.set(cx, y + j * scale + sy, lum, colour);
      }
    }
    return width;
  }
  measure(str: string, o: TextOpts = {}) { const font = o.font ?? "px"; return raster(font === "px" ? str.toUpperCase() : str, font, o.size ?? (font === "cjk" ? 12 : 8)).w * (o.scale ?? 1); }
  /** Wraps text to a width in cells and writes it; returns the rows used. */
  paragraph(str: string, x: number, y: number, width: number, lineHeight: number, o: TextOpts = {}) {
    const lines: string[] = [];
    for (const block of str.split("\n")) {
      let line = "";
      for (const piece of block.match(/[一-鿿]|[^\s一-鿿]+\s*|\s+/g) ?? []) {
        if (line && this.measure(line + piece, o) > width) { lines.push(line.trimEnd()); line = piece.trimStart(); } else line += piece;
      }
      lines.push(line.trimEnd());
    }
    lines.forEach((line, n) => this.text(line, x, y + n * lineHeight, o));
    return lines.length * lineHeight;
  }
  /** ASCII art: every character is a glyph made of bulbs. */
  ascii(lines: string[], x: number, y: number, o: TextOpts = {}) { lines.forEach((line, n) => this.text(line, x, y + n * 9, { ...o, font: "px" })); }
  /** A picture as halftone dots: each bulb's size and brightness follow the tone of the picture at that spot. */
  halftone(x: number, y: number, w: number, h: number, tone: (u: number, v: number) => number, colour: Colour = "amber", gamma = 1) {
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) { const t = Math.max(0, Math.min(1, tone(i / (w - 1), j / (h - 1)))); if (t > 0.04) this.set(x + i, y + j, Math.pow(t, gamma), colour); }
  }
  /** The same picture as ASCII: a character per 3×2 block, picked from a ramp by tone. */
  asciiPicture(x: number, y: number, w: number, h: number, tone: (u: number, v: number) => number, colour: Colour = "green") {
    const ramp = " .:-=+*#%@"; const cw = 6, ch = 9;
    for (let j = 0; j < Math.floor(h / ch); j += 1) for (let i = 0; i < Math.floor(w / cw); i += 1) {
      const t = Math.max(0, Math.min(1, tone((i + 0.5) / (w / cw), (j + 0.5) / (h / ch)) || 0));
      const c = ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
      if (c !== " ") this.text(c, x + i * cw, y + j * ch, { font: "px", colour, lum: 0.55 + t * 0.45 });
    }
  }
  bar(x: number, y: number, w: number, h: number, value: number, colour: Colour = "green") {
    this.frame(x, y, w, h, 0.35, colour);
    const filled = Math.round((w - 2) * Math.max(0, Math.min(1, value)));
    for (let i = 0; i < filled; i += 1) for (let j = 1; j < h - 1; j += 1) if (i % 3 !== 2) this.set(x + 1 + i, y + j, 0.95, colour);
  }
  /** Brightens the bulbs around a point, the way a finger or a cursor lights a touch panel. */
  glow(cx: number, cy: number, radius: number, colour: Colour = "white", strength = 0.5) {
    for (let j = -radius; j <= radius; j += 1) for (let i = -radius; i <= radius; i += 1) {
      const d = Math.hypot(i, j); if (d > radius) continue;
      const f = (1 - d / radius) * strength; const k = this.idx(Math.round(cx) + i, Math.round(cy) + j); if (k < 0) continue;
      if (this.target[k] > 0.05) this.target[k] = Math.min(1, this.target[k] + f * 0.5); else { this.target[k] = Math.max(this.target[k], f * 0.4); this.colour[k] = NAMES.indexOf(colour); }
    }
  }

  // ---- showing it ---------------------------------------------------------------------------------------------
  /** One frame: bulbs ease toward their targets (a lit one rises fast, a dark one fades slower), then everything is drawn. */
  render() {
    const { ctx, cols, rows } = this; const P = this.pitch * this.dpr; const S = Math.ceil(P * 3.6);
    if (this.off) ctx.drawImage(this.off, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    for (let j = 0; j < rows; j += 1) for (let i = 0; i < cols; i += 1) {
      const k = j * cols + i; const t = this.target[k]; let v = this.cur[k];
      v += (t - v) * (t > v ? 0.55 : 0.22); if (Math.abs(t - v) < 0.01) v = t; this.cur[k] = v;
      const own = this.colour[k]; const shown = this.mono ? NAMES.indexOf(this.mono) : own;
      const level = Math.round((this.mono ? v * WEIGHT[own] : v) * (LEVELS - 1)); if (level <= 0) continue;
      ctx.drawImage(this.sprites[shown][level], i * P + P / 2 - S / 2, j * P + P / 2 - S / 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }
}

/** Small deterministic noise, so a scene looks the same each time it is drawn. */
export const hash = (x: number, y = 0) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
