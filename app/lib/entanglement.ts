import type { Language } from "../types/project";
import type { OrbitCategory, OrbitWork } from "../data/orbit";

export type EntanglementSelection = {
  category: OrbitCategory["id"];
  point: number;
  work: OrbitWork;
};

export type EntanglementPoint = Pick<EntanglementSelection, "category" | "point">;
export type EntanglementHarmonic = {
  category: EntanglementPoint["category"];
  point: number;
  fraction: number;
};

const CATEGORY_ORDER: EntanglementPoint["category"][] = ["mine", "others", "outside"];

export function sortEntanglementPoints<T extends EntanglementPoint>(points: T[]): T[] {
  return [...points].sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.point - b.point
  );
}

const TAU = Math.PI * 2;
const SAMPLES = 480;
const X_AMPLITUDES = [78, 48, 32];
const Y_AMPLITUDES = [58, 37, 25];
const FREQUENCIES = [1, -2, 3];
const CATEGORY_PHASE = { mine: 0, others: TAU / 30, outside: TAU / 15 };

function phasesFromHarmonics(harmonics: EntanglementHarmonic[]) {
  return sortEntanglementPoints(harmonics).map(({ category, fraction }) =>
    -Math.PI / 2 + TAU * fraction + CATEGORY_PHASE[category]
  );
}

function positionWithPhases(phases: number[], t: number) {
  return {
    x: 250 + phases.reduce((sum, phase, index) => sum + X_AMPLITUDES[index] * Math.cos(FREQUENCIES[index] * t + phase), 0),
    y: 116 + phases.reduce((sum, phase, index) => sum + Y_AMPLITUDES[index] * Math.sin(FREQUENCIES[index] * t + phase), 0),
  };
}

export function entanglementPosition(harmonics: EntanglementHarmonic[], t: number) {
  return positionWithPhases(phasesFromHarmonics(harmonics), t);
}

export function entanglementPaths(harmonics: EntanglementHarmonic[], progress = 1, startPhase = 0) {
  const phases = phasesFromHarmonics(harmonics);
  const shape: string[] = [];
  const wave: string[] = [];
  const lastSample = Math.floor(SAMPLES * Math.max(0, Math.min(1, progress)));
  let tip: { x: number; y: number } | null = null;
  let waveTip: { x: number; y: number } | null = null;
  if (progress <= 0) return { shape: "", wave: "", tip, waveTip };

  for (let index = 0; index <= lastSample; index += 1) {
    const t = startPhase + TAU * index / SAMPLES;
    const { x, y } = positionWithPhases(phases, t);
    shape.push(`${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);

    // A projection of the same rotating point becomes the waveform below.
    const waveX = 500 * index / SAMPLES;
    const waveY = 36 - (y - 116) * 0.25;
    wave.push(`${index === 0 ? "M" : "L"}${waveX.toFixed(2)} ${waveY.toFixed(2)}`);
    tip = { x, y };
    waveTip = { x: waveX, y: waveY };
  }
  return { shape: shape.join(" "), wave: wave.join(" "), tip, waveTip };
}

// Local fallback when the server-side narrative provider is unavailable.
export function entanglementNarrative(selections: EntanglementSelection[], lang: Language) {
  const titles = selections.map((selection) => selection.work.title);
  const tone = selections.reduce((sum, selection, index) => sum + (index + 1) * selection.point, 0) % 6;
  if (lang === "zh") {
    const relations = ["安静的汇合", "交错的节奏", "悬置的间隔", "回返的脉冲", "松动的轨道", "轻微的失谐"];
    return `${titles.join("、")}，形成一段${relations[tone]}。`;
  }
  const relations = ["a quiet convergence", "a crossing rhythm", "a suspended interval", "a returning pulse", "a loose orbit", "a soft dissonance"];
  return `${titles.slice(0, -1).join(", ")}, and ${titles.at(-1)} settle into ${relations[tone]}.`;
}
