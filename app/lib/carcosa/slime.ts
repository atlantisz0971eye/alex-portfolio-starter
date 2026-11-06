/**
 * A slime mould on a small grid, after Physarum: many agents that follow and leave a trail, so that tubes grow
 * toward food and thicken where they are used. Food is a rectangle of the page. The agents never enter a solid
 * rectangle (readable content), only the gaps between, and they eat the food slowly.
 * No DOM here: the caller gives rectangles in grid cells and reads pixels back, so the same code can run in a worker.
 */
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Food = Rect & { id: string; left: number };
/** Where on a food the mould attaches: a small patch beside its left edge (or its right, near the screen edge). */
const attach = (f: Rect) => ({ x: f.x0 < 5 ? f.x1 + 3 : f.x0 - 3, y: Math.floor((f.y0 + f.y1) / 2) });
export type Target = { x: number; y: number; rgb: [number, number, number] };

const TAU = Math.PI * 2;
const YELLOW: [number, number, number] = [230, 194, 41];
const PALE: [number, number, number] = [255, 238, 160];

export class Slime {
  readonly gw: number;
  readonly gh: number;
  readonly n: number;
  ax: Float32Array; ay: Float32Array; ang: Float32Array;
  trail: Float32Array;
  private tmp: Float32Array;
  /** Cells agents may not enter (readable content). */
  solid: Uint8Array;
  /** Cell -> food index + 1, for the ring just outside a food rectangle. */
  private ring: Int16Array;
  foods: Food[] = [];
  home = { x: 0, y: 0 };
  /** 0 to 1: how fed she is. */
  energy = 0.5;
  /** Targets the agents are drawn toward while forming a body, and how far along that is (0 free, 1 formed). */
  targets: Target[] | null = null;
  form = 0;
  private rnd = Math.random;

  constructor(gw: number, gh: number, n: number) {
    this.gw = gw; this.gh = gh; this.n = n;
    this.ax = new Float32Array(n); this.ay = new Float32Array(n); this.ang = new Float32Array(n);
    this.trail = new Float32Array(gw * gh); this.tmp = new Float32Array(gw * gh);
    this.solid = new Uint8Array(gw * gh); this.ring = new Int16Array(gw * gh);
    this.home = { x: Math.floor(gw * 0.82), y: Math.floor(gh * 0.78) };
    for (let i = 0; i < n; i += 1) {
      const a = this.rnd() * TAU; const r = this.rnd() * 6;
      this.ax[i] = this.home.x + Math.cos(a) * r; this.ay[i] = this.home.y + Math.sin(a) * r; this.ang[i] = this.rnd() * TAU;
    }
  }

  /** Readable blocks agents stay out of. Food rectangles are solid too. */
  setSolids(rects: Rect[]) {
    this.solid.fill(0);
    for (const r of rects) for (let y = Math.max(0, r.y0); y <= Math.min(this.gh - 1, r.y1); y += 1) for (let x = Math.max(0, r.x0); x <= Math.min(this.gw - 1, r.x1); x += 1) this.solid[y * this.gw + x] = 1;
    this.settleHome();
  }

  /** Home must be on open ground, and no agent may be left inside content (it could never get out). */
  private settleHome() {
    const open = (x: number, y: number) => x >= 2 && y >= 2 && x < this.gw - 2 && y < this.gh - 2 && !this.solid[y * this.gw + x];
    if (!open(this.home.x, this.home.y)) {
      search: for (let r = 1; r < Math.max(this.gw, this.gh); r += 1) {
        for (let k = 0; k < 24; k += 1) {
          const a = (k / 24) * TAU;
          const x = Math.round(this.home.x + Math.cos(a) * r); const y = Math.round(this.home.y + Math.sin(a) * r);
          if (open(x, y)) { this.home = { x, y }; break search; }
        }
      }
    }
    for (let i = 0; i < this.n; i += 1) {
      const x = Math.round(this.ax[i]); const y = Math.round(this.ay[i]);
      if (x < 0 || y < 0 || x >= this.gw || y >= this.gh || this.solid[y * this.gw + x]) {
        const a = this.rnd() * TAU; const r = this.rnd() * 5;
        this.ax[i] = this.home.x + Math.cos(a) * r; this.ay[i] = this.home.y + Math.sin(a) * r;
      }
    }
  }

  setFoods(foods: Food[]) {
    this.foods = foods;
    this.ring.fill(0);
    foods.forEach((f, i) => {
      const a = attach(f);
      for (let y = Math.max(0, a.y - 4); y <= Math.min(this.gh - 1, a.y + 4); y += 1) for (let x = Math.max(0, a.x - 4); x <= Math.min(this.gw - 1, a.x + 4); x += 1) {
        if ((x - a.x) ** 2 + (y - a.y) ** 2 <= 20) this.ring[y * this.gw + x] = i + 1;
      }
    });
  }

  /** Draw the agents toward a body (pass null to let them go again). */
  setBody(targets: Target[] | null) {
    this.targets = targets;
    if (targets) for (let i = targets.length; i < this.n; i += 1) this.ang[i] = this.rnd() * TAU;
  }

  private sense(x: number, y: number, a: number, d: number) {
    const sx = Math.min(this.gw - 1, Math.max(0, Math.round(x + Math.cos(a) * d)));
    const sy = Math.min(this.gh - 1, Math.max(0, Math.round(y + Math.sin(a) * d)));
    const i = sy * this.gw + sx;
    return this.solid[i] ? -1 : this.trail[i];
  }

  step(formRate = 0) {
    const { gw, gh, n, trail } = this;
    if (this.targets) this.form = Math.min(1, Math.max(0, this.form + formRate));
    else this.form = Math.max(0, this.form - Math.abs(formRate || 0.02));

    // food gives off a scent at one small patch beside it; home a faint one
    for (const f of this.foods) {
      if (f.left <= 0) continue;
      const a = attach(f);
      const v = 1.8 * Math.min(1, f.left + 0.25);
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) this.put(a.x + dx, a.y + dy, v);
    }
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) this.put(this.home.x + dx, this.home.y + dy, 0.5);

    const body = this.targets;
    const ease = this.form * this.form * (3 - 2 * this.form);
    for (let i = 0; i < n; i += 1) {
      let x = this.ax[i]; let y = this.ay[i]; let a = this.ang[i];
      if (body && i < body.length && this.form > 0) {
        const t = body[i];
        const pull = 0.04 + ease * 0.22;
        x += (t.x - x) * pull + (this.rnd() - 0.5) * (1 - ease) * 1.2;
        y += (t.y - y) * pull + (this.rnd() - 0.5) * (1 - ease) * 1.2;
        this.ax[i] = x; this.ay[i] = y;
        continue;
      }
      const l = this.sense(x, y, a - 0.6, 7); const f = this.sense(x, y, a, 7); const r = this.sense(x, y, a + 0.6, 7);
      if (f > l && f > r) { /* straight on */ } else if (f < l && f < r) a += (this.rnd() - 0.5) * 0.9;
      else if (l > r) a -= 0.35; else if (r > l) a += 0.35;
      let nx = x + Math.cos(a) * 1.0; let ny = y + Math.sin(a) * 1.0;
      const ix = Math.round(nx); const iy = Math.round(ny);
      if (ix < 0 || iy < 0 || ix >= gw || iy >= gh || this.solid[iy * gw + ix]) { a = this.rnd() * TAU; nx = x; ny = y; }
      x = nx; y = ny;
      const idx = Math.round(y) * gw + Math.round(x);
      if (idx >= 0 && idx < trail.length) {
        trail[idx] = Math.min(3, trail[idx] + 0.24);
        const fi = this.ring[idx];
        if (fi) { const food = this.foods[fi - 1]; if (food && food.left > 0) { const bite = Math.min(food.left, 0.0000012); food.left -= bite; this.energy = Math.min(1, this.energy + bite * 0.12); } }
      }
      this.ax[i] = x; this.ay[i] = y; this.ang[i] = a;
    }

    // diffuse and fade
    const tmp = this.tmp;
    for (let y = 1; y < gh - 1; y += 1) {
      for (let x = 1; x < gw - 1; x += 1) {
        const i = y * gw + x;
        tmp[i] = (trail[i - gw - 1] + trail[i - gw] + trail[i - gw + 1] + trail[i - 1] + trail[i] + trail[i + 1] + trail[i + gw - 1] + trail[i + gw] + trail[i + gw + 1]) * (0.91 / 9);
      }
    }
    this.trail = tmp; this.tmp = trail;
    this.energy = Math.max(0, this.energy - 0.00001);
  }

  private put(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return;
    const i = y * this.gw + x;
    if (this.trail[i] < v) this.trail[i] = v;
  }

  /** The slime as RGBA pixels. While a body forms, the trail fades and the agents take the body's colours. */
  render(buf: Uint8ClampedArray, alpha = 1) {
    const { gw, gh, n } = this;
    buf.fill(0);
    const fade = (1 - this.form) * alpha;
    if (fade > 0.01) {
      for (let i = 0; i < gw * gh; i += 1) {
        const v = this.trail[i];
        if (v < 0.04 || this.solid[i]) continue; // never drawn over readable content
        const k = Math.ceil(Math.min(1, v * 0.8) * 4) / 4; // a few steps of brightness, so it reads as pixels
        const o = i * 4;
        const hot = Math.min(1, Math.max(0, (v - 0.6) / 1.6));
        buf[o] = YELLOW[0] + (PALE[0] - YELLOW[0]) * hot; buf[o + 1] = YELLOW[1] + (PALE[1] - YELLOW[1]) * hot; buf[o + 2] = YELLOW[2] + (PALE[2] - YELLOW[2]) * hot;
        buf[o + 3] = 255 * k * fade * 0.8;
      }
    }
    const body = this.targets;
    for (let i = 0; i < n; i += 1) {
      const x = Math.round(this.ax[i]); const y = Math.round(this.ay[i]);
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      const o = (y * gw + x) * 4;
      if (body && i < body.length && this.form > 0 && this.form < 0.97) {
        const t = body[i]; const m = this.form;
        buf[o] = YELLOW[0] + (t.rgb[0] - YELLOW[0]) * m; buf[o + 1] = YELLOW[1] + (t.rgb[1] - YELLOW[1]) * m; buf[o + 2] = YELLOW[2] + (t.rgb[2] - YELLOW[2]) * m;
        buf[o + 3] = 255 * alpha;
      } else if (this.form < 0.98) {
        buf[o] = PALE[0]; buf[o + 1] = PALE[1]; buf[o + 2] = PALE[2]; buf[o + 3] = 255 * (1 - this.form) * alpha;
      }
    }
  }
}
