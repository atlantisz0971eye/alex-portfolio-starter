import { del, get, list, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

export type BoardMeta = { id: string; title: string; createdAt: string; updatedAt: string; nodeCount: number };
export type BoardContent = { nodes: unknown[]; edges: unknown[] };

const INDEX = "workspace/boards/index.json";
const contentPath = (id: string) => `workspace/boards/${id}/board.json`;
const assetPrefix = (id: string) => `workspace/boards/${id}/assets/`;
const MAX_CONTENT = 900_000;
const MAX_BOARDS = 200;
const MAX_NODES = 600;

export class BoardError extends Error {}
export const validBoardId = (id: string) => /^[0-9a-f-]{36}$/.test(id);
export const validAssetName = (name: string) => /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name);

async function readText(path: string) {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).text();
}
async function readIndex(): Promise<BoardMeta[]> {
  const raw = await readText(INDEX);
  return raw ? (JSON.parse(raw) as { boards: BoardMeta[] }).boards : [];
}
const writeIndex = (boards: BoardMeta[]) => put(INDEX, JSON.stringify({ boards }), { access: "private", allowOverwrite: true, contentType: "application/json" });

export const listBoards = async () => (await readIndex()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export async function readBoard(id: string): Promise<{ board: BoardMeta; content: BoardContent } | null> {
  if (!validBoardId(id)) return null;
  const board = (await readIndex()).find((item) => item.id === id);
  if (!board) return null;
  const raw = await readText(contentPath(id));
  return { board, content: raw ? JSON.parse(raw) as BoardContent : { nodes: [], edges: [] } };
}

export async function createBoard(title: string) {
  const boards = await readIndex();
  if (boards.length >= MAX_BOARDS) throw new BoardError("There are too many boards.");
  const now = new Date().toISOString();
  const board: BoardMeta = { id: randomUUID(), title: title.trim().slice(0, 120) || "Untitled board", createdAt: now, updatedAt: now, nodeCount: 0 };
  await put(contentPath(board.id), JSON.stringify({ nodes: [], edges: [] }), { access: "private", allowOverwrite: true, contentType: "application/json" });
  await writeIndex([board, ...boards]);
  return board;
}

function check(content: unknown): BoardContent {
  const value = content as BoardContent;
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new BoardError("The board is not valid.");
  if (value.nodes.length > MAX_NODES) throw new BoardError("This board has too many items.");
  if (JSON.stringify(value).length > MAX_CONTENT) throw new BoardError("This board is too large.");
  return { nodes: value.nodes, edges: value.edges };
}

export async function updateBoard(id: string, patch: { title?: unknown; content?: unknown }) {
  const boards = await readIndex();
  const board = boards.find((item) => item.id === id);
  if (!board) return null;
  if (typeof patch.title === "string") board.title = patch.title.trim().slice(0, 120) || "Untitled board";
  if (patch.content !== undefined) {
    const content = check(patch.content);
    await put(contentPath(id), JSON.stringify(content), { access: "private", allowOverwrite: true, contentType: "application/json" });
    board.nodeCount = content.nodes.length;
  }
  board.updatedAt = new Date().toISOString();
  await writeIndex(boards);
  return board;
}

export async function deleteBoard(id: string) {
  const boards = await readIndex();
  if (!boards.some((item) => item.id === id)) return false;
  const files = await list({ prefix: `workspace/boards/${id}/` });
  if (files.blobs.length) await del(files.blobs.map((blob) => blob.url));
  await writeIndex(boards.filter((item) => item.id !== id));
  return true;
}

export async function saveAsset(id: string, bytes: Uint8Array, type: "image/jpeg" | "image/png" | "image/webp") {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const name = `${randomUUID()}.${ext}`;
  await put(assetPrefix(id) + name, Buffer.from(bytes), { access: "private", contentType: type });
  return name;
}

export const readAsset = (id: string, name: string) => get(assetPrefix(id) + name, { access: "private", useCache: false });
