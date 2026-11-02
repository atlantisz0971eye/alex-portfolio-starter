import { get, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { scopeRoot } from "./workspaceScope";

/**
 * A person's own writing over the years, kept as written. `pieces.json` is the only source of truth; the analysis, the
 * network and the portrait are derived from it in `graph.json` and can be rebuilt or dropped at any time.
 */
export const PIECE_TYPES = ["poem", "essay", "diary", "excerpt", "note"] as const;
export type PieceType = (typeof PIECE_TYPES)[number];
export type Piece = { id: string; /** When it was written, ISO. */ at: string; text: string; title?: string };
export type Analysis = { type: PieceType; themes: string[]; images: string[]; feelings: string[]; people: string[]; places: string[]; author?: string };
export const NODE_KINDS = ["theme", "image", "feeling", "person", "place", "author"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export type SelfNode = { id: string; label: string; kind: NodeKind; /** Pieces it appears in. */ count: number; /** Count weighted by how much a kind of writing says about the person. */ score: number; first: string; last: string; peak: string; pieceIds: string[]; x: number; y: number };
export type SelfEdge = { a: string; b: string; weight: number };
export type Portrait = { generatedAt: string; summary: string; sections: { heading: string; text: string; evidence: string[] }[] };
export type SelfGraph = { updatedAt: string; analysis: Record<string, Analysis>; nodes: SelfNode[]; edges: SelfEdge[]; portrait: Portrait | null; hidden: string[]; from: string; to: string; dropped: number };

const PIECES = "self/pieces.json";
const GRAPH = "self/graph.json";
export const MAX_PIECES = 6000;
export const MAX_PIECE_TEXT = 12_000;
export class SelfError extends Error {}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const result = await get((await scopeRoot()) + path, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return fallback;
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch { return fallback; }
}
const writeJson = async (path: string, value: unknown) => put((await scopeRoot()) + path, JSON.stringify(value), { access: "private", allowOverwrite: true, contentType: "application/json" });

export const readPieces = async () => (await readJson<{ pieces: Piece[] }>(PIECES, { pieces: [] })).pieces;
export const emptySelf = (): SelfGraph => ({ updatedAt: "", analysis: {}, nodes: [], edges: [], portrait: null, hidden: [], from: "", to: "", dropped: 0 });
export const readSelf = () => readJson<SelfGraph>(GRAPH, emptySelf());
export const writeSelf = (graph: SelfGraph) => writeJson(GRAPH, graph);

/** The same text on the same day is the same piece, so importing an export twice adds nothing. */
export const pieceId = (at: string, text: string) => createHash("sha1").update(`${at.slice(0, 10)}\n${text.replace(/\s+/g, " ").trim().slice(0, 400)}`).digest("hex").slice(0, 20);

export async function importPieces(raw: unknown): Promise<{ added: number; skipped: number; total: number }> {
  if (!Array.isArray(raw)) throw new SelfError("Nothing to import.");
  const existing = await readPieces();
  const known = new Set(existing.map((piece) => piece.id));
  const fresh: Piece[] = [];
  let skipped = 0;
  for (const item of raw.slice(0, 400)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.replace(/\r\n/g, "\n").trim().slice(0, MAX_PIECE_TEXT) : "";
    const when = typeof o.at === "string" ? Date.parse(o.at) : NaN;
    if (!text || Number.isNaN(when) || when > Date.now() + 86_400_000 || when < Date.UTC(1970, 0, 1)) { skipped += 1; continue; }
    const at = new Date(when).toISOString();
    const id = pieceId(at, text);
    if (known.has(id)) { skipped += 1; continue; }
    known.add(id);
    fresh.push({ id, at, text, ...(typeof o.title === "string" && o.title.trim() ? { title: o.title.trim().slice(0, 120) } : {}) });
  }
  if (existing.length + fresh.length > MAX_PIECES) throw new SelfError("That is more writing than this can hold.");
  if (fresh.length) await writeJson(PIECES, { pieces: [...existing, ...fresh].sort((a, b) => a.at.localeCompare(b.at)) });
  return { added: fresh.length, skipped, total: existing.length + fresh.length };
}

export async function wipeSelf() {
  await writeJson(PIECES, { pieces: [] });
  await writeSelf(emptySelf());
}
