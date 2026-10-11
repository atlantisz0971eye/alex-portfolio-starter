type OrbitPosition = { x: number; y: number };

export type EntanglementSound = {
  context: AudioContext;
  voice: OscillatorNode;
  halo: OscillatorNode;
  drift: OscillatorNode;
  pan: StereoPannerNode;
  gain: GainNode;
};

function connectEcho(context: AudioContext, input: AudioNode, output: AudioNode, time: number, level: number) {
  const delay = context.createDelay(1);
  const filter = context.createBiquadFilter();
  const feedback = context.createGain();
  const wet = context.createGain();
  delay.delayTime.value = time;
  filter.type = "lowpass";
  filter.frequency.value = 950;
  feedback.gain.value = 0.2;
  wet.gain.value = level;
  input.connect(delay);
  delay.connect(filter);
  filter.connect(wet).connect(output);
  filter.connect(feedback).connect(delay);
}

// A fixed, airy glass-like voice. Selection changes its movement, never its timbre.
export function createEntanglementSound(): EntanglementSound {
  const context = new AudioContext();
  const voice = context.createOscillator();
  const halo = context.createOscillator();
  const drift = context.createOscillator();
  const driftDepth = context.createGain();
  const haloLevel = context.createGain();
  const tone = context.createBiquadFilter();
  const pan = context.createStereoPanner();
  const gain = context.createGain();
  const dry = context.createGain();
  const real = new Float32Array(5);
  const imag = new Float32Array([0, 1, 0.07, 0.018, 0.004]);

  voice.setPeriodicWave(context.createPeriodicWave(real, imag));
  voice.frequency.value = 220;
  halo.type = "sine";
  halo.frequency.value = 440;
  halo.detune.value = 6;
  haloLevel.gain.value = 0.13;
  drift.type = "sine";
  drift.frequency.value = 0.11;
  driftDepth.gain.value = 2;
  tone.type = "lowpass";
  tone.frequency.value = 1400;
  dry.gain.value = 0.76;
  gain.gain.value = 0;
  voice.connect(tone);
  halo.connect(haloLevel).connect(tone);
  drift.connect(driftDepth).connect(halo.detune);
  tone.connect(pan);
  pan.connect(dry).connect(gain);
  connectEcho(context, pan, gain, 0.23, 0.16);
  connectEcho(context, pan, gain, 0.37, 0.1);
  gain.connect(context.destination);
  voice.start();
  halo.start();
  drift.start();

  return { context, voice, halo, drift, pan, gain };
}

export function updateEntanglementSound(sound: EntanglementSound, position: OrbitPosition | null, audible: boolean) {
  const now = sound.context.currentTime;
  sound.gain.gain.setTargetAtTime(audible ? 0.065 : 0, now, audible ? 0.3 : 0.15);
  if (!position) return;

  const height = Math.max(-1, Math.min(1, (116 - position.y) / 120));
  const horizontal = Math.max(-1, Math.min(1, (position.x - 250) / 158));
  const frequency = 220 * 2 ** ((height * 4) / 12);
  sound.voice.frequency.setTargetAtTime(frequency, now, 0.1);
  sound.halo.frequency.setTargetAtTime(frequency * 2, now, 0.1);
  sound.pan.pan.setTargetAtTime(horizontal * 0.55, now, 0.07);
}

export function closeEntanglementSound(sound: EntanglementSound) {
  sound.voice.stop();
  sound.halo.stop();
  sound.drift.stop();
  void sound.context.close();
}
