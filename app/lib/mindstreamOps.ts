import { layoutOrganized, type Organized } from "./boardLayout";
import { BoardError, createBoard, listBoards, readBoard, updateBoard, type BoardContent } from "./boardStore";
import { appendToNote, createNote, listNotes, readNote, updateNote, validNoteId } from "./notesStore";
import { jsonToText, markdownToDoc } from "./notesText";
import { outlineOfBoard } from "./mindstream";

/** A mindstream is a board and the one note paired with it. */
export async function ensureNote(boardId: string) {
  const found = await readBoard(boardId);
  if (!found) throw new BoardError("That mindstream no longer exists.");
  const existing = found.board.noteId ? await readNote(found.board.noteId) : null;
  if (existing && !existing.note.deletedAt) return { found, noteId: existing.note.id };
  const note = await createNote({ title: found.board.title, icon: "🧠", kind: "mindstream" });
  await updateBoard(boardId, { noteId: note.id });
  return { found, noteId: note.id };
}

/** The board of a note: found by its pairing, or made empty the first time the page is opened. */
export async function ensureBoardForNote(noteId: string) {
  const note = validNoteId(noteId) ? await readNote(noteId) : null;
  if (!note || note.note.deletedAt) throw new BoardError("That page no longer exists.");
  const existing = (await listBoards()).find((board) => board.noteId === noteId);
  if (existing) return existing.id;
  const board = await createBoard(note.note.title || "Untitled", noteId);
  await updateBoard(board.id, { noteId });
  return board.id;
}

/** Accepts either id: the assistant and the client may hold the note id or the board id of the same mindstream. */
export async function resolveBoardId(id: string) {
  if (await readBoard(id)) return id;
  return ensureBoardForNote(id);
}

/** Boards created before notes and boards were merged have no page in the tree; give each one. */
export async function adoptOrphanBoards() {
  const boards = await listBoards();
  let adopted = 0;
  for (const board of boards) {
    const note = board.noteId ? await readNote(board.noteId) : null;
    if (note && !note.note.deletedAt) continue;
    const created = await createNote({ title: board.title, icon: "🧠", kind: "mindstream" });
    await updateBoard(board.id, { noteId: created.id });
    adopted += 1;
  }
  return adopted;
}

export async function listStreams() {
  const notes = (await listNotes()).filter((note) => !note.deletedAt && note.kind !== "vocabulary");
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type BoardOp =
  | { op: "add"; text: string; parentId?: string | null }
  | { op: "update"; cardId: string; text: string }
  | { op: "delete"; cardId: string }
  | { op: "link"; from: string; to: string };

type Card = { id: string; type?: string; position: { x: number; y: number }; width?: number; height?: number; data: { text?: string; tone?: string } & Record<string, unknown> };
type Link = { id: string; source: string; target: string };

const MAX_OPS = 40;
const heightFor = (text: string) => Math.max(76, 52 + Math.ceil(text.length / 16) * 22);

/** Everything a reader (or the assistant) needs to review a mindstream: the note text and the board as an outline with card ids. */
export async function readMindstream(boardId: string) {
  const { found, noteId } = await ensureNote(boardId);
  const note = await readNote(noteId);
  const nodes = found.content.nodes as Card[];
  const { outline } = outlineOfBoard(found.content.nodes, found.content.edges);
  const withIds = outlineWithIds(nodes, found.content.edges as Link[]);
  return {
    title: found.board.title,
    noteId,
    noteText: note ? jsonToText(note.content) : "",
    outline,
    withIds,
    photos: nodes.filter((node) => node.type === "image").length,
  };
}

function outlineWithIds(nodes: Card[], edges: Link[]) {
  const cards = new Map(nodes.filter((node) => node.type === "text" && node.data?.text?.trim()).map((node) => [node.id, node.data.text!.trim().replace(/\s*\n\s*/g, " / ")]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const edge of edges) {
    if (cards.has(edge.source) && cards.has(edge.target)) { children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]); hasParent.add(edge.target); }
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id) || depth > 6) return;
    seen.add(id);
    lines.push(`${"  ".repeat(depth)}- [${id}] ${cards.get(id)}`);
    (children.get(id) ?? []).forEach((child) => walk(child, depth + 1));
  };
  [...cards.keys()].filter((id) => !hasParent.has(id)).forEach((id) => walk(id, 0));
  return lines.join("\n");
}

export async function applyNoteEdit(boardId: string, mode: "replace" | "append", markdown: string) {
  const { noteId } = await ensureNote(boardId);
  const body = markdown.slice(0, 40_000);
  if (!body.trim()) throw new BoardError("There is nothing to write.");
  if (mode === "append") await appendToNote(noteId, body);
  else await updateNote(noteId, { content: markdownToDoc(body) });
  return { noteId };
}

async function save(boardId: string, content: BoardContent) {
  await updateBoard(boardId, { content });
}

export async function applyBoardOps(boardId: string, ops: BoardOp[]) {
  const found = await readBoard(boardId);
  if (!found) throw new BoardError("That mindstream no longer exists.");
  const nodes = [...found.content.nodes] as Card[];
  let edges = [...found.content.edges] as Link[];
  const byId = (id: string) => nodes.find((node) => node.id === id && node.type === "text");
  let changed = 0;
  for (const op of ops.slice(0, MAX_OPS)) {
    if (op.op === "add" && typeof op.text === "string" && op.text.trim()) {
      const text = op.text.trim().slice(0, 240);
      const parent = op.parentId ? byId(op.parentId) : undefined;
      const siblings = parent ? edges.filter((edge) => edge.source === parent.id).length : 0;
      const maxY = nodes.reduce((max, node) => Math.max(max, node.position.y + (node.height ?? 100)), 0);
      const card: Card = { id: crypto.randomUUID(), type: "text", position: parent ? { x: parent.position.x + (parent.width ?? 260) + 60, y: parent.position.y + siblings * 110 } : { x: 0, y: nodes.length ? maxY + 60 : 0 }, width: 260, height: heightFor(text), data: { text, tone: "paper" } };
      nodes.push(card);
      if (parent) edges.push({ id: crypto.randomUUID(), source: parent.id, target: card.id });
      changed += 1;
    } else if (op.op === "update" && typeof op.text === "string" && op.text.trim()) {
      const card = byId(op.cardId);
      if (card) { card.data = { ...card.data, text: op.text.trim().slice(0, 240) }; card.height = Math.max(card.height ?? 0, heightFor(card.data.text!)); changed += 1; }
    } else if (op.op === "delete") {
      const index = nodes.findIndex((node) => node.id === op.cardId && node.type === "text");
      if (index !== -1) { nodes.splice(index, 1); edges = edges.filter((edge) => edge.source !== op.cardId && edge.target !== op.cardId); changed += 1; }
    } else if (op.op === "link") {
      if (byId(op.from) && byId(op.to) && op.from !== op.to && !edges.some((edge) => edge.source === op.from && edge.target === op.to)) { edges.push({ id: crypto.randomUUID(), source: op.from, target: op.to }); changed += 1; }
    }
  }
  if (!changed) throw new BoardError("None of those changes could be applied. The cards may have changed.");
  await save(boardId, { nodes, edges });
  return { changed, noteId: found.board.noteId };
}

/** Adds an organized card tree beside what is already on the board, or replaces the text cards (photos stay). */
export async function applyTree(boardId: string, mode: "add" | "replace", tree: Organized) {
  const found = await readBoard(boardId);
  if (!found) throw new BoardError("That mindstream no longer exists.");
  let nodes = [...found.content.nodes] as Card[];
  let edges = [...found.content.edges] as Link[];
  if (mode === "replace") {
    const gone = new Set(nodes.filter((node) => node.type === "text").map((node) => node.id));
    nodes = nodes.filter((node) => !gone.has(node.id));
    edges = edges.filter((edge) => !gone.has(edge.source) && !gone.has(edge.target));
  }
  const right = nodes.reduce((max, node) => Math.max(max, node.position.x + (node.width ?? 260)), -140);
  const top = nodes.length ? nodes.reduce((min, node) => Math.min(min, node.position.y), Infinity) : 0;
  const { root, children, edges: tree_ } = layoutOrganized(tree, right + 140, top);
  await save(boardId, { nodes: [...nodes, root, ...children], edges: [...edges, ...tree_] });
  return { added: children.length + 1, noteId: found.board.noteId };
}
