import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { scopeRoot } from "./workspaceScope";

/**
 * The notebook. What a person writes is saved exactly as written and never touched again: `entries.json` is the one
 * source of truth. Everything built from it (titles, topics, projects, summaries) lives in `graph.json`, which the
 * background organizer can rewrite or throw away and rebuild at any time.
 */
export type MindEntry = { id: string; at: string; text: string };
export const KINDS = ["idea", "todo", "question", "decision", "log", "note"] as const;
export type MindKind = (typeof KINDS)[number];
export type Derived = { title: string; topic: string; project: string; kind: MindKind };
export type TopicSummary = { name: string; project: string; summary: string };
export type ProjectSummary = { name: string; summary: string };
export type MindGraph = { updatedAt: string; /** Per entry id. Devlog entries use "dl:" plus their own id. */ derived: Record<string, Derived>; topics: TopicSummary[]; projects: ProjectSummary[]; overview: string; summarizedAt?: string };

const ENTRIES = "mind/entries.json";
const GRAPH = "mind/graph.json";
export const MAX_TEXT = 4000;
const MAX_ENTRIES = 5000;

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const result = await get((await scopeRoot()) + path, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return fallback;
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch { return fallback; }
}
const writeJson = async (path: string, value: unknown) => put((await scopeRoot()) + path, JSON.stringify(value), { access: "private", allowOverwrite: true, contentType: "application/json" });

export const readMindEntries = async () => (await readJson<{ entries: MindEntry[] }>(ENTRIES, { entries: [] })).entries;
export const emptyGraph = (): MindGraph => ({ updatedAt: "", derived: {}, topics: [], projects: [], overview: "" });
export const readGraph = () => readJson<MindGraph>(GRAPH, emptyGraph());
export const writeGraph = (graph: MindGraph) => writeJson(GRAPH, graph);

export class MindError extends Error {}

export async function addMindEntry(text: unknown): Promise<MindEntry> {
  const clean = typeof text === "string" ? text.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT) : "";
  if (!clean) throw new MindError("Write something first.");
  const entries = await readMindEntries();
  if (entries.length >= MAX_ENTRIES) throw new MindError("The notebook is full.");
  const entry = { id: randomUUID(), at: new Date().toISOString(), text: clean };
  await writeJson(ENTRIES, { entries: [...entries, entry] });
  return entry;
}

export async function deleteMindEntry(id: string) {
  const entries = await readMindEntries();
  if (!entries.some((entry) => entry.id === id)) return false;
  await writeJson(ENTRIES, { entries: entries.filter((entry) => entry.id !== id) });
  const graph = await readGraph();
  if (graph.derived[id]) { delete graph.derived[id]; await writeGraph(graph); }
  return true;
}
