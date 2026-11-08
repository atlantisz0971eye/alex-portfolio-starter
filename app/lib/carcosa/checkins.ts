import { get, put } from "@vercel/blob";
import { scopeRoot } from "../workspaceScope";

/**
 * What the owner tells Carcosa about a day: mood and energy (1 to 5), hours slept, one word, and whether the day is a
 * declared rest day. One record per work day (05:00 to 05:00 London), written over when changed. Private to the person.
 */
export type DayNote = { mood?: number; energy?: number; sleep?: number; word?: string; rest?: boolean; at: string };
export type Notes = Record<string, DayNote>;

const path = async () => `${await scopeRoot()}carcosa/checkins.json`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function readNotes(): Promise<Notes> {
  try {
    const result = await get(await path(), { access: "private", useCache: false });
    if (result && result.statusCode === 200) return JSON.parse(await new Response(result.stream).text()) as Notes;
  } catch { /* none yet */ }
  return {};
}
const writeNotes = async (notes: Notes) => put(await path(), JSON.stringify(notes), { access: "private", allowOverwrite: true, contentType: "application/json" });

const scale = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined);

/** Saves a check-in; unknown or out-of-range fields are dropped rather than refused. */
export async function saveCheckin(day: string, input: { mood?: unknown; energy?: unknown; sleep?: unknown; word?: unknown }) {
  if (!DAY.test(day)) throw new Error("bad day");
  const notes = await readNotes();
  const sleep = typeof input.sleep === "number" && input.sleep >= 0 && input.sleep <= 16 ? Math.round(input.sleep * 2) / 2 : undefined;
  const word = typeof input.word === "string" ? [...input.word.replace(/\s+/g, " ").trim()].slice(0, 24).join("") : undefined;
  notes[day] = { ...notes[day], mood: scale(input.mood) ?? notes[day]?.mood, energy: scale(input.energy) ?? notes[day]?.energy, sleep: sleep ?? notes[day]?.sleep, word: word || notes[day]?.word, at: new Date().toISOString() };
  await writeNotes(prune(notes));
  return notes[day];
}

export async function setRest(day: string, rest: boolean) {
  if (!DAY.test(day)) throw new Error("bad day");
  const notes = await readNotes();
  notes[day] = { ...notes[day], rest, at: new Date().toISOString() };
  await writeNotes(prune(notes));
  return notes[day];
}

/** A year is plenty for learning a routine. */
function prune(notes: Notes) {
  const keys = Object.keys(notes).sort().slice(-370);
  return Object.fromEntries(keys.map((k) => [k, notes[k]]));
}

/** Wipes every check-in; the owner can do this from the page. */
export const wipeNotes = () => writeNotes({});
