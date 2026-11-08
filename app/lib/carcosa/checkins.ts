import { readJsonSafe, updateJson } from "../blobJson";
import { scopeRoot } from "../workspaceScope";

/**
 * What the owner tells Carcosa about a day: mood and energy (1 to 5), hours slept, one word, and whether the day is a
 * declared rest day. One record per work day (05:00 to 05:00 London), written over when changed. Private to the person.
 */
export type DayNote = { mood?: number; energy?: number; sleep?: number; word?: string; rest?: boolean; at: string };
export type Notes = Record<string, DayNote>;

const path = async () => `${await scopeRoot()}carcosa/checkins.json`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const readNotes = async (): Promise<Notes> => readJsonSafe<Notes>(await path(), {});
const change = async (fn: (notes: Notes) => Notes) => updateJson<Notes>(await path(), {}, (notes) => prune(fn(notes)));

const scale = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined);

/** Saves a check-in; unknown or out-of-range fields are dropped rather than refused. */
export async function saveCheckin(day: string, input: { mood?: unknown; energy?: unknown; sleep?: unknown; word?: unknown }) {
  if (!DAY.test(day)) throw new Error("bad day");
  const sleep = typeof input.sleep === "number" && input.sleep >= 0 && input.sleep <= 16 ? Math.round(input.sleep * 2) / 2 : undefined;
  const word = typeof input.word === "string" ? [...input.word.replace(/\s+/g, " ").trim()].slice(0, 24).join("") : undefined;
  const notes = await change((n) => ({ ...n, [day]: { ...n[day], mood: scale(input.mood) ?? n[day]?.mood, energy: scale(input.energy) ?? n[day]?.energy, sleep: sleep ?? n[day]?.sleep, word: word || n[day]?.word, at: new Date().toISOString() } }));
  return notes[day];
}

export async function setRest(day: string, rest: boolean) {
  if (!DAY.test(day)) throw new Error("bad day");
  const notes = await change((n) => ({ ...n, [day]: { ...n[day], rest, at: new Date().toISOString() } }));
  return notes[day];
}

/** A year is plenty for learning a routine. */
function prune(notes: Notes) {
  const keys = Object.keys(notes).sort().slice(-370);
  return Object.fromEntries(keys.map((k) => [k, notes[k]]));
}

/** Wipes every check-in; the owner can do this from the page. */
export const wipeNotes = () => change(() => ({}));
