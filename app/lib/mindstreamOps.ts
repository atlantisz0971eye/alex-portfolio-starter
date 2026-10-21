import { BLOCK_SIZE, DEFAULT_LINK, EDGE_COLORS, layoutGraph, MARKERS, portsFor, SHAPES, type LinkData, type Marker, type Shape } from "./boardDiagram";
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

/**
 * Changes to a board. Cards are sticky notes; blocks are diagram shapes with an optional stereotype and details;
 * `ref` names something created in the same batch so later operations can connect to it before it has an id.
 */
export type BoardOp =
  | { op: "add"; text: string; parentId?: string | null; ref?: string; shape?: string; kicker?: string; body?: string }
  | { op: "group"; text: string; contains: string[]; ref?: string }
  | { op: "update"; cardId: string; text?: string; shape?: string; kicker?: string; body?: string }
  | { op: "delete"; cardId: string }
  | { op: "link"; from: string; to: string; label?: string; color?: string; line?: string; start?: string; end?: string };

type Card = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; width?: number; height?: number; data: { text?: string; tone?: string; kicker?: string; body?: string; shape?: string } & Record<string, unknown> };
type Link = { id: string; source: string; target: string; type?: string; sourceHandle?: string | null; targetHandle?: string | null; data?: Partial<LinkData> };

const MAX_OPS = 60;
const heightFor = (text: string) => Math.max(76, 52 + Math.ceil(text.length / 16) * 22);
const isCard = (node: Card) => node.type === "text" || node.type === "block";
const blockHeight = (kicker?: string, body?: string) => Math.max(BLOCK_SIZE.height, 52 + (kicker ? 16 : 0) + (body ? 14 + body.split("\n").length * 17 : 0));
const shapeOf = (value: unknown): Shape => SHAPES.some((item) => item.id === value) ? value as Shape : "rect";
const markerOf = (value: unknown, fallback: Marker): Marker => MARKERS.some((item) => item.id === value) ? value as Marker : fallback;
const labelOfCard = (node: Card) => [node.data.kicker ? `«${node.data.kicker}»` : "", node.data.text ?? "", node.data.body ? `— ${node.data.body.replace(/\s*\n\s*/g, "; ")}` : ""].filter(Boolean).join(" ").trim();

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
  const cards = new Map(nodes.filter((node) => isCard(node) && (node.data?.text?.trim() || node.data?.body?.trim())).map((node) => [node.id, labelOfCard(node).replace(/\s*\n\s*/g, " / ")]));
  const children = new Map<string, string[]>();
  const labels = new Map<string, string>();
  const hasParent = new Set<string>();
  for (const edge of edges) {
    if (cards.has(edge.source) && cards.has(edge.target)) {
      children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
      hasParent.add(edge.target);
      if (edge.data?.label) labels.set(`${edge.source}>${edge.target}`, edge.data.label);
    }
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number, via?: string) => {
    if (seen.has(id) || depth > 8) return;
    seen.add(id);
    lines.push(`${"  ".repeat(depth)}- [${id}] ${via ? `(${via}) ` : ""}${cards.get(id)}`);
    (children.get(id) ?? []).forEach((child) => walk(child, depth + 1, labels.get(`${id}>${child}`)));
  };
  [...cards.keys()].filter((id) => !hasParent.has(id)).forEach((id) => walk(id, 0));
  // Items in a cycle have a parent but are never reached from a root; list them so nothing is hidden.
  [...cards.keys()].filter((id) => !seen.has(id)).forEach((id) => walk(id, 0));
  const containers = nodes.filter((node) => node.type === "group").map((group) => {
    const inside = nodes.filter((node) => node.parentId === group.id && cards.has(node.id)).map((node) => `[${node.id}]`);
    return `- [${group.id}] ${group.data?.text?.trim() || "(unnamed container)"} contains ${inside.join(", ") || "nothing"}`;
  });
  return containers.length ? `${lines.join("\n")}\n\nContainers:\n${containers.join("\n")}` : lines.join("\n");
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
  const refs = new Map<string, string>();
  const resolve = (id: string | null | undefined) => (id ? refs.get(id) ?? id : "");
  const byId = (id: string) => nodes.find((node) => node.id === resolve(id) && isCard(node));
  const created = new Set<string>();
  const groups: { id: string; contains: string[] }[] = [];
  let changed = 0;
  for (const op of ops.slice(0, MAX_OPS)) {
    if (op.op === "add" && typeof op.text === "string" && op.text.trim()) {
      const text = op.text.trim().slice(0, 240);
      const parent = op.parentId ? byId(op.parentId) : undefined;
      const siblings = parent ? edges.filter((edge) => edge.source === parent.id).length : 0;
      const maxY = nodes.reduce((max, node) => Math.max(max, node.position.y + (node.height ?? 100)), 0);
      const at = parent ? { x: parent.position.x + (parent.width ?? 260) + 60, y: parent.position.y + siblings * 110 } : { x: 0, y: nodes.length ? maxY + 60 : 0 };
      const isBlock = !!(op.shape || op.kicker || op.body);
      const kicker = typeof op.kicker === "string" ? op.kicker.trim().slice(0, 60) : "";
      const body = typeof op.body === "string" ? op.body.trim().slice(0, 600) : "";
      const card: Card = isBlock
        ? { id: crypto.randomUUID(), type: "block", position: at, width: 200, height: blockHeight(kicker, body), data: { text, kicker, body, shape: shapeOf(op.shape), tone: "paper" } }
        : { id: crypto.randomUUID(), type: "text", position: at, width: 260, height: heightFor(text), data: { text, tone: "paper" } };
      nodes.push(card);
      created.add(card.id);
      if (typeof op.ref === "string" && op.ref) refs.set(op.ref, card.id);
      if (parent) edges.push({ id: crypto.randomUUID(), source: parent.id, target: card.id, ...(isBlock || parent.type === "block" ? { type: "link", data: { ...DEFAULT_LINK } } : {}) });
      changed += 1;
    } else if (op.op === "group" && typeof op.text === "string" && Array.isArray(op.contains)) {
      const id = crypto.randomUUID();
      if (typeof op.ref === "string" && op.ref) refs.set(op.ref, id);
      groups.push({ id, contains: op.contains.map(String) });
      nodes.unshift({ id, type: "group", position: { x: 0, y: 0 }, width: 400, height: 240, data: { text: op.text.trim().slice(0, 80), tone: "paper", dashed: true } });
      (nodes[0] as Card & { zIndex?: number }).zIndex = -1;
      created.add(id);
      changed += 1;
    } else if (op.op === "update") {
      const card = byId(op.cardId);
      if (!card) continue;
      const next = { ...card.data };
      if (typeof op.text === "string" && op.text.trim()) next.text = op.text.trim().slice(0, 240);
      if (card.type === "block") {
        if (typeof op.kicker === "string") next.kicker = op.kicker.trim().slice(0, 60);
        if (typeof op.body === "string") next.body = op.body.trim().slice(0, 600);
        if (op.shape) next.shape = shapeOf(op.shape);
        card.height = Math.max(card.height ?? 0, blockHeight(next.kicker, next.body));
      } else if (next.text) card.height = Math.max(card.height ?? 0, heightFor(next.text));
      card.data = next;
      changed += 1;
    } else if (op.op === "delete") {
      const index = nodes.findIndex((node) => node.id === op.cardId && isCard(node));
      if (index !== -1) { nodes.splice(index, 1); edges = edges.filter((edge) => edge.source !== op.cardId && edge.target !== op.cardId); changed += 1; }
    } else if (op.op === "link") {
      const from = byId(op.from);
      const to = byId(op.to);
      if (from && to && from.id !== to.id && !edges.some((edge) => edge.source === from.id && edge.target === to.id)) {
        const rich = from.type === "block" || to.type === "block" || op.label || op.color || op.line || op.start || op.end;
        const color = EDGE_COLORS.some((item) => item.id === op.color) ? String(op.color) : DEFAULT_LINK.color;
        const line = op.line === "dashed" || op.line === "dotted" ? op.line : "solid";
        edges.push({ id: crypto.randomUUID(), source: from.id, target: to.id, ...(rich ? { type: "link", data: { ...DEFAULT_LINK, color, line, start: markerOf(op.start, "none"), end: markerOf(op.end, "arrow"), ...(typeof op.label === "string" && op.label.trim() ? { label: op.label.trim().slice(0, 80) } : {}) } } : {}) });
        changed += 1;
      }
    }
  }
  if (!changed) throw new BoardError("None of those changes could be applied. The cards may have changed.");

  // A batch that makes a diagram is laid out as one: layered left to right, to the right of whatever is already there.
  const makers = nodes.filter((node) => node.type === "block" && created.has(node.id));
  if (makers.length >= 2 || groups.length) {
    const before = nodes.filter((node) => !created.has(node.id));
    const originX = before.length ? before.reduce((max, node) => Math.max(max, node.position.x + (node.width ?? 260)), -Infinity) + 160 : 0;
    const originY = before.length ? before.reduce((min, node) => Math.min(min, node.position.y), Infinity) : 0;
    const placed = layoutGraph(makers.map((node) => ({ id: node.id, width: node.width ?? BLOCK_SIZE.width, height: node.height ?? BLOCK_SIZE.height })), edges.filter((edge) => created.has(edge.source) && created.has(edge.target)), "LR");
    for (const node of makers) { const to = placed.get(node.id); if (to) node.position = { x: originX + to.x, y: originY + to.y }; }
    // Containers wrap what they hold; children are positioned inside them.
    for (const group of groups) {
      const inside = group.contains.map((id) => nodes.find((node) => node.id === resolve(id) && created.has(node.id) && node.type === "block")).filter((node): node is Card => !!node);
      const target = nodes.find((node) => node.id === group.id)!;
      if (!inside.length) continue;
      const left = Math.min(...inside.map((node) => node.position.x)) - 40;
      const top = Math.min(...inside.map((node) => node.position.y)) - 56;
      const right = Math.max(...inside.map((node) => node.position.x + (node.width ?? BLOCK_SIZE.width))) + 40;
      const bottom = Math.max(...inside.map((node) => node.position.y + (node.height ?? BLOCK_SIZE.height))) + 40;
      target.position = { x: left, y: top };
      target.width = right - left;
      target.height = bottom - top;
      for (const node of inside) { node.parentId = group.id; node.position = { x: node.position.x - left, y: node.position.y - top }; }
    }
    const absolute = (node: Card) => { const parent = node.parentId ? nodes.find((item) => item.id === node.parentId) : undefined; return { x: node.position.x + (parent?.position.x ?? 0), y: node.position.y + (parent?.position.y ?? 0) }; };
    for (const edge of edges) {
      const from = nodes.find((node) => node.id === edge.source);
      const to = nodes.find((node) => node.id === edge.target);
      if (edge.type !== "link" || edge.sourceHandle || edge.targetHandle || !from || !to || from.type !== "block" || to.type !== "block" || !created.has(from.id) || !created.has(to.id)) continue;
      const ports = portsFor({ ...absolute(from), width: from.width ?? BLOCK_SIZE.width, height: from.height ?? BLOCK_SIZE.height }, { ...absolute(to), width: to.width ?? BLOCK_SIZE.width, height: to.height ?? BLOCK_SIZE.height });
      edge.sourceHandle = ports.source;
      edge.targetHandle = ports.target;
    }
    // Containers first, then the rest, so a child always follows its container.
    nodes.sort((a, b) => Number(b.type === "group") - Number(a.type === "group"));
  }
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
