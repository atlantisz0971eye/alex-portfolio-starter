/**
 * The scan intro's techno machine, synthesised in Web Audio with no samples: a kick, closed and open hats, a clap,
 * an acid bass through a resonant filter, and chord stabs, into a master low-pass and a limiter.
 * A look-ahead scheduler asks for each sixteenth step just before it is due, so timing does not depend on frames.
 */

export const BPM = 128;
const STEP = 60 / BPM / 4;
const LOOKAHEAD = 0.12;

export type Step = {
  kick: boolean;
  hat: boolean;
  openHat: boolean;
  clap: boolean;
  /** Bass note as a frequency, with a 303-style accent and slide. */
  bass: { freq: number; accent: boolean; slide: boolean } | null;
  stab: number[] | null;
};

export class ScanSynth {
  readonly context: AudioContext;
  private bus: GainNode;
  private filter: BiquadFilterNode;
  private output: GainNode;
  /** A tap on the final mix, for drawing the live waveform. */
  readonly analyser: AnalyserNode;
  private noise: AudioBuffer;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private lastBass = 0;

  constructor(private readStep: (step: number) => Step) {
    this.context = new AudioContext({ latencyHint: "interactive" });
    const ctx = this.context;
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 900;
    this.filter.Q.value = 2;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.8;
    this.bus.connect(this.filter).connect(limiter).connect(this.output).connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.output.connect(this.analyser);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  start() {
    const ctx = this.context;
    void ctx.resume();
    this.output.gain.cancelScheduledValues(ctx.currentTime);
    this.output.gain.setTargetAtTime(0.9, ctx.currentTime, 0.4);
    this.nextTime = ctx.currentTime + 0.08;
    const pump = () => {
      while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
        this.play(this.readStep(this.step), this.nextTime);
        this.nextTime += STEP;
        this.step = (this.step + 1) % 16;
      }
    };
    pump();
    this.timer = window.setInterval(pump, 25);
  }

  /** The master filter: the faster the page is scanned, the brighter it gets. */
  setBrightness(amount: number) {
    const a = Math.max(0, Math.min(1, amount));
    this.filter.frequency.setTargetAtTime(380 + Math.pow(a, 0.7) * 9200, this.context.currentTime, 0.08);
    this.filter.Q.setTargetAtTime(2 + a * 5, this.context.currentTime, 0.2);
  }

  /** Fade out, then shut the audio down completely. */
  stop(fade = 0.8) {
    const ctx = this.context;
    window.clearInterval(this.timer);
    this.output.gain.cancelScheduledValues(ctx.currentTime);
    this.output.gain.setTargetAtTime(0, ctx.currentTime, fade / 4);
    window.setTimeout(() => void ctx.close(), fade * 1000 + 200);
  }

  private play(step: Step, t: number) {
    if (step.kick) this.kick(t);
    if (step.hat) this.hat(t, false);
    if (step.openHat) this.hat(t, true);
    if (step.clap) this.clap(t);
    if (step.bass) this.bass(t, step.bass.freq, step.bass.accent, step.bass.slide);
    if (step.stab) this.stab(t, step.stab);
  }

  private kick(t: number) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    gain.gain.setValueAtTime(1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  private hat(t: number, open: boolean) {
    const ctx = this.context;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = open ? 6500 : 8200;
    const gain = ctx.createGain();
    const length = open ? 0.22 : 0.035;
    gain.gain.setValueAtTime(open ? 0.16 : 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(hp).connect(gain).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + length + 0.02);
  }

  private clap(t: number) {
    const ctx = this.context;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 1.2;
    const gain = ctx.createGain();
    // Three quick bursts and a tail, the shape of hands that do not quite clap together.
    [0, 0.011, 0.023].forEach((offset) => {
      gain.gain.setValueAtTime(0.5, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.05, t + offset + 0.009);
    });
    gain.gain.setValueAtTime(0.32, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.connect(bp).connect(gain).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.22);
  }

  private bass(t: number, freq: number, accent: boolean, slide: boolean) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const from = slide && this.lastBass ? this.lastBass : freq;
    osc.frequency.setValueAtTime(from, t);
    if (from !== freq) osc.frequency.exponentialRampToValueAtTime(freq, t + STEP * 0.7);
    this.lastBass = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = accent ? 16 : 11;
    const peak = accent ? 3600 : 1700;
    lp.frequency.setValueAtTime(peak, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + (accent ? 0.22 : 0.14));
    const gain = ctx.createGain();
    const length = slide ? STEP * 1.05 : STEP * 0.85;
    gain.gain.setValueAtTime(accent ? 0.34 : 0.24, t);
    gain.gain.setTargetAtTime(0.0001, t + length * 0.6, 0.03);
    osc.connect(lp).connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + length + 0.15);
  }

  private stab(t: number, freqs: number[]) {
    const ctx = this.context;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    lp.connect(gain).connect(this.bus);
    for (const f of freqs) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(lp);
        osc.start(t);
        osc.stop(t + 0.45);
      }
    }
  }
}
