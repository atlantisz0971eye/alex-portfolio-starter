/**
 * A crowd of pixels moving from one shape to another: how the mould gathers out of the grey line into the yak, and goes
 * back. Each pixel leaves at its own moment, so the shape assembles rather than slides.
 */
export type Dot = { x: number; y: number; rgb: [number, number, number] };

export class Swarm {
  private from: Dot[];
  private to: Dot[];
  private delay: Float32Array;
  t = 0;

  constructor(from: Dot[], to: Dot[]) {
    const n = to.length;
    // every target gets a starting point; with fewer starts than targets, starts are reused
    this.from = Array.from({ length: n }, (_, i) => from.length ? from[(i * 7919) % from.length] : to[i]);
    this.to = to;
    this.delay = new Float32Array(n);
    for (let i = 0; i < n; i += 1) this.delay[i] = Math.random() * 0.45;
  }

  step(rate: number) { this.t = Math.min(1, this.t + rate); }
  get done() { return this.t >= 1; }

  render(buf: Uint8ClampedArray, gw: number, gh: number) {
    for (let i = 0; i < this.to.length; i += 1) {
      const local = Math.min(1, Math.max(0, (this.t - this.delay[i]) / 0.55));
      const e = local * local * (3 - 2 * local);
      const a = this.from[i]; const b = this.to[i];
      const wob = (1 - e) * e * 6;
      const x = Math.round(a.x + (b.x - a.x) * e + Math.sin(i * 1.7) * wob);
      const y = Math.round(a.y + (b.y - a.y) * e + Math.cos(i * 2.3) * wob);
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      const o = (y * gw + x) * 4;
      buf[o] = a.rgb[0] + (b.rgb[0] - a.rgb[0]) * e; buf[o + 1] = a.rgb[1] + (b.rgb[1] - a.rgb[1]) * e; buf[o + 2] = a.rgb[2] + (b.rgb[2] - a.rgb[2]) * e;
      buf[o + 3] = 255;
    }
  }
}
