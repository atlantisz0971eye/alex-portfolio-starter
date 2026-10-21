import { graphlib, layout } from "@dagrejs/dagre";

/**
 * Systems-engineering diagram vocabulary shared by the board editor and the assistant: block shapes, containers,
 * typed connectors, ports and automatic layout. Everything here is plain data, so it also runs on the server.
 */

export type Shape = "rect" | "round" | "diamond" | "cylinder" | "ellipse" | "hex" | "slant";
export type BlockData = { text: string; kicker?: string; body?: string; shape: Shape; tone: string; dashed?: boolean };
export type GroupData = { text: string; tone: string; dashed?: boolean };
export type Marker = "none" | "arrow" | "open" | "diamond" | "diamondFill" | "dot" | "bar";
export type Route = "step" | "straight" | "curve";
export type LineStyle = "solid" | "dashed" | "dotted";
export type LinkData = { label?: string; route: Route; line: LineStyle; start: Marker; end: Marker; color: string; width: 1 | 2 | 3 };

export const SHAPES: { id: Shape; label: string; hint: string }[] = [
  { id: "rect", label: "Block", hint: "Component, subsystem or function" },
  { id: "round", label: "Process", hint: "Activity or software task" },
  { id: "diamond", label: "Decision", hint: "Choice or condition" },
  { id: "cylinder", label: "Data store", hint: "Database or buffer" },
  { id: "ellipse", label: "Terminator", hint: "Actor, start or end" },
  { id: "hex", label: "Hardware", hint: "Unit, ECU or device" },
  { id: "slant", label: "Input / output", hint: "Data in or out" },
];
export const MARKERS: { id: Marker; label: string }[] = [
  { id: "none", label: "None" }, { id: "arrow", label: "Arrow" }, { id: "open", label: "Open arrow" },
  { id: "diamondFill", label: "Composition" }, { id: "diamond", label: "Aggregation" }, { id: "dot", label: "Dot" }, { id: "bar", label: "Bar" },
];
export const EDGE_COLORS: { id: string; label: string; value: string }[] = [
  { id: "ink", label: "Ink", value: "var(--text-2)" },
  { id: "blue", label: "Data", value: "#3b82f6" },
  { id: "green", label: "Control", value: "#22a06b" },
  { id: "amber", label: "Material", value: "#d99a1c" },
  { id: "red", label: "Power", value: "#e5484d" },
  { id: "violet", label: "Signal", value: "#8b5cf6" },
];
export const TONES = ["paper", "sun", "sky", "leaf", "rose"];
export const DEFAULT_LINK: LinkData = { route: "step", line: "solid", start: "none", end: "arrow", color: "ink", width: 1 };
export const BLOCK_SIZE = { width: 180, height: 84 };
export const GRID = 8;

export const colorOf = (id: string | undefined) => EDGE_COLORS.find((item) => item.id === id)?.value ?? EDGE_COLORS[0].value;

/** Diamonds and ellipses only meet a connector at the middle of each side; the other shapes have three ports per side. */
export const portCount = (shape: Shape | "group") => (shape === "diamond" || shape === "ellipse" || shape === "round" || shape === "group" ? 1 : 3);
export type Side = "t" | "r" | "b" | "l";
export const SIDES: Side[] = ["t", "r", "b", "l"];
export const handleId = (side: Side, index: 1 | 2 | 3) => `${side}${index}`;

export type Box = { x: number; y: number; width: number; height: number };

/** The ports to use between two boxes: facing sides, middle port. */
export function portsFor(from: Box, to: Box): { source: string; target: string } {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const horizontal = Math.abs(dx) * (from.height + to.height) >= Math.abs(dy) * (from.width + to.width);
  if (horizontal) return dx >= 0 ? { source: handleId("r", 2), target: handleId("l", 2) } : { source: handleId("l", 2), target: handleId("r", 2) };
  return dy >= 0 ? { source: handleId("b", 2), target: handleId("t", 2) } : { source: handleId("t", 2), target: handleId("b", 2) };
}

type LayoutNode = { id: string; width: number; height: number; parentId?: string };
type LayoutEdge = { source: string; target: string };

/**
 * Layered automatic layout (dagre). Containers are laid out as single boxes with their contents moving along, so a
 * subsystem keeps its inner arrangement. Returns the new top-left corner of every top-level node.
 */
export function layoutGraph(nodes: LayoutNode[], edges: LayoutEdge[], direction: "LR" | "TB" = "LR") {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const top = (id: string): string => {
    let current = byId.get(id);
    for (let hops = 0; current?.parentId && byId.has(current.parentId) && hops < 8; hops += 1) current = byId.get(current.parentId);
    return current?.id ?? id;
  };
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: direction, nodesep: 48, ranksep: 96, marginx: 0, marginy: 0 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) if (!node.parentId || !byId.has(node.parentId)) graph.setNode(node.id, { width: node.width, height: node.height });
  const seen = new Set<string>();
  for (const edge of edges) {
    const from = top(edge.source);
    const to = top(edge.target);
    if (from === to || !graph.hasNode(from) || !graph.hasNode(to) || seen.has(`${from}>${to}`)) continue;
    seen.add(`${from}>${to}`);
    graph.setEdge(from, to);
  }
  layout(graph);
  const out = new Map<string, { x: number; y: number }>();
  for (const id of graph.nodes()) {
    const placed = graph.node(id);
    const source = byId.get(id);
    if (placed && source) out.set(id, { x: Math.round(placed.x - source.width / 2), y: Math.round(placed.y - source.height / 2) });
  }
  return out;
}

export type Align = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** New absolute positions that line the boxes up on one edge or axis. */
export function alignBoxes(boxes: (Box & { id: string })[], how: Align) {
  const left = Math.min(...boxes.map((box) => box.x));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.min(...boxes.map((box) => box.y));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return new Map(boxes.map((box) => {
    const next = { x: box.x, y: box.y };
    if (how === "left") next.x = left;
    else if (how === "right") next.x = right - box.width;
    else if (how === "center") next.x = Math.round((left + right) / 2 - box.width / 2);
    else if (how === "top") next.y = top;
    else if (how === "bottom") next.y = bottom - box.height;
    else next.y = Math.round((top + bottom) / 2 - box.height / 2);
    return [box.id, next] as const;
  }));
}

/** Spreads the boxes so the gaps between them are equal, keeping the outer two in place. */
export function distributeBoxes(boxes: (Box & { id: string })[], axis: "x" | "y") {
  const size = axis === "x" ? "width" : "height";
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[axis] + last[size] - first[axis];
  const gap = (span - sorted.reduce((sum, box) => sum + box[size], 0)) / Math.max(1, sorted.length - 1);
  const out = new Map<string, number>();
  let cursor = first[axis];
  for (const box of sorted) {
    out.set(box.id, Math.round(cursor));
    cursor += box[size] + gap;
  }
  return out;
}

export const snap = (value: number, grid = GRID) => Math.round(value / grid) * grid;

type TidyNode = { id: string; width: number; height: number; parentId?: string; x: number; y: number };

/**
 * One-click tidy: connected items are laid out in layers along their connections, loose items are packed into a
 * grid, and everything is snapped to the grid and placed in rows without overlapping. `scope` holds the items to
 * arrange (all with the same parent); items nested inside a scope item travel with it. Returns new positions.
 */
export function tidyGraph(all: LayoutNode[], scope: TidyNode[], edges: LayoutEdge[], direction: "LR" | "TB" = "LR") {
  const byId = new Map(all.map((node) => [node.id, node]));
  const inScope = new Set(scope.map((node) => node.id));
  const owner = (id: string): string | null => {
    let current = byId.get(id);
    for (let hops = 0; current && hops < 12; hops += 1) {
      if (inScope.has(current.id)) return current.id;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return null;
  };
  // Connected groups of items, found by following the connections between them.
  const parent = new Map(scope.map((node) => [node.id, node.id]));
  const find = (id: string): string => { let root = id; while (parent.get(root) !== root) root = parent.get(root)!; parent.set(id, root); return root; };
  const links: LayoutEdge[] = [];
  for (const edge of edges) {
    const from = owner(edge.source);
    const to = owner(edge.target);
    if (!from || !to || from === to) continue;
    links.push({ source: from, target: to });
    parent.set(find(from), find(to));
  }
  const buckets = new Map<string, TidyNode[]>();
  for (const node of scope) buckets.set(find(node.id), [...(buckets.get(find(node.id)) ?? []), node]);

  type Piece = { ids: string[]; width: number; height: number; at: Map<string, { x: number; y: number }>; loose: boolean; order: number };
  const pieces: Piece[] = [];
  for (const members of buckets.values()) {
    if (members.length === 1) {
      const only = members[0];
      pieces.push({ ids: [only.id], width: only.width, height: only.height, at: new Map([[only.id, { x: 0, y: 0 }]]), loose: true, order: only.y });
      continue;
    }
    const ids = new Set(members.map((node) => node.id));
    const placed = layoutGraph(members.map((node) => ({ id: node.id, width: node.width, height: node.height })), links.filter((edge) => ids.has(edge.source) && ids.has(edge.target)), direction);
    const left = Math.min(...members.map((node) => placed.get(node.id)?.x ?? 0));
    const top = Math.min(...members.map((node) => placed.get(node.id)?.y ?? 0));
    const at = new Map(members.map((node) => [node.id, { x: (placed.get(node.id)?.x ?? 0) - left, y: (placed.get(node.id)?.y ?? 0) - top }]));
    pieces.push({
      ids: members.map((node) => node.id), at, loose: false, order: Math.min(...members.map((node) => node.y)),
      width: Math.max(...members.map((node) => (at.get(node.id)!.x) + node.width)), height: Math.max(...members.map((node) => (at.get(node.id)!.y) + node.height)),
    });
  }
  // Connected pieces first (biggest first), then loose items in their rough reading order.
  const connected = pieces.filter((piece) => !piece.loose).sort((a, b) => b.width * b.height - a.width * a.height);
  const loose = pieces.filter((piece) => piece.loose).sort((a, b) => Math.round(a.order / 240) - Math.round(b.order / 240) || (scope.find((n) => n.id === a.ids[0])!.x - scope.find((n) => n.id === b.ids[0])!.x));
  const ordered = [...connected, ...loose];
  const area = ordered.reduce((sum, piece) => sum + (piece.width + 48) * (piece.height + 48), 0);
  const rowWidth = Math.max(Math.max(...ordered.map((piece) => piece.width)), Math.min(2400, Math.max(900, Math.sqrt(area) * 1.5)));

  const originX = Math.min(...scope.map((node) => node.x));
  const originY = Math.min(...scope.map((node) => node.y));
  const out = new Map<string, { x: number; y: number }>();
  const gap = 48;
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let sawLoose = false;
  for (const piece of ordered) {
    // Loose items start on a fresh row, apart from the connected diagrams above them.
    if (piece.loose && !sawLoose) { sawLoose = true; if (cursorX > 0) { cursorY += rowHeight + gap; cursorX = 0; rowHeight = 0; } }
    if (cursorX > 0 && cursorX + piece.width > rowWidth) { cursorY += rowHeight + gap; cursorX = 0; rowHeight = 0; }
    for (const id of piece.ids) {
      const at = piece.at.get(id)!;
      out.set(id, { x: snap(originX + cursorX + at.x), y: snap(originY + cursorY + at.y) });
    }
    cursorX += piece.width + gap;
    rowHeight = Math.max(rowHeight, piece.height);
  }
  return out;
}
