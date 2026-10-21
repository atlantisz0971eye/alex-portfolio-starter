"use client";

import { Background, BackgroundVariant, ConnectionLineType, ConnectionMode, Controls, Handle, MiniMap, NodeResizer, Position, ReactFlow, ReactFlowProvider, reconnectEdge, SelectionMode, useEdgesState, useNodesState, useReactFlow, ViewportPortal, type Connection, type Edge, type Node, type NodeChange, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng, toSvg } from "html-to-image";
import { BoxSelect, Download, FileText, Group as GroupIcon, Image as ImageIcon, LayoutGrid, Loader2, Magnet, Maximize, Redo2, ScanLine, ScanText, Shapes as ShapesIcon, Sparkles, StickyNote, Trash2, Undo2, Workflow } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { alignBoxes, BLOCK_SIZE, DEFAULT_LINK, distributeBoxes, GRID, layoutGraph, portsFor, SHAPES, snap as snapTo, tidyGraph, TONES, type Align, type LinkData, type Shape } from "../lib/boardDiagram";
import { layoutOrganized } from "../lib/boardLayout";
import type { BoardMeta } from "../lib/boardStore";
import { parseResponse } from "./api";
import { BoardInspector } from "./BoardInspector";
import { BoardContext, type TextData } from "./boardContext";
import { BlockNode, GroupNode, LinkEdge, type BlockNodeType, type GroupNodeType } from "./boardNodes";
import { Sheet } from "./Sheet";
import { MINDSTREAM_CHANGED, registerFlush, type ChangedDetail } from "./mindstreamBus";
import { ThemeContext } from "./Shell";

type ImageData = { name: string; ratio: number };
type BoardNode = Node<TextData, "text"> | Node<ImageData, "image"> | BlockNodeType | GroupNodeType;
type Organized = { title: string; items: { text: string; parent: number | null }[] };
type Doc = { id: string; name: string; mimeType: string; pageCount: number | null };

const headers = { "Content-Type": "application/json" };
const endpoint = (id: string) => `/api/workspace/boards/${id}`;

function TextCard({ id, data, selected }: NodeProps<Node<TextData, "text">>) {
  const { update, touch, edit } = useContext(BoardContext);
  return <div className={`bnode bnode--text bnode--${data.tone}${selected ? " is-selected" : ""}`}>
    <NodeResizer isVisible={selected} minWidth={120} minHeight={64} />
    <Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} />
    <div className="bnode__grip" aria-hidden="true"><i /></div>
    {touch
      ? <div className="bnode__text nodrag" role="button" tabIndex={0} onClick={() => edit(id)}>{data.text || <span>Tap to write</span>}</div>
      : <textarea className="nodrag nowheel" value={data.text} placeholder="Write something" onChange={(event) => update(id, { text: event.target.value })} />}
    {!touch && selected && <div className="bnode__tones nodrag">{TONES.map((tone) => <button key={tone} type="button" aria-label={`${tone} card`} className={`bnode__tone bnode--${tone}${tone === data.tone ? " is-on" : ""}`} onClick={() => update(id, { tone })} />)}</div>}
  </div>;
}

function ImageCard({ id, data, selected }: NodeProps<Node<ImageData, "image">>) {
  const { boardId, read } = useContext(BoardContext);
  return <div className={`bnode bnode--image${selected ? " is-selected" : ""}`}>
    <NodeResizer isVisible={selected} minWidth={80} keepAspectRatio />
    <Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`${endpoint(boardId)}/assets/${data.name}`} alt="" draggable={false} />
    {selected && <div className="bnode__tones bnode__actions nodrag"><button type="button" onClick={() => read(id)}><ScanText size={15} /> Read notes</button></div>}
  </div>;
}

const nodeTypes = { text: TextCard, image: ImageCard, block: BlockNode, group: GroupNode };
const edgeTypes = { link: LinkEdge };

/** Shrinks a photo so it stays well under the request size limit, keeping handwriting legible. */
/**
 * Evens out the lighting on a photographed page: each pixel is divided by the local paper brightness (a heavily
 * blurred copy of the photo), which removes shadows and turns the paper white while keeping the ink colour.
 */
function cleanPage(canvas: HTMLCanvasElement) {
  const { width, height } = canvas;
  const context = canvas.getContext("2d");
  if (!context) return;
  const small = document.createElement("canvas");
  small.width = Math.max(8, Math.round(width / 24));
  small.height = Math.max(8, Math.round(height / 24));
  const smallContext = small.getContext("2d");
  const paper = document.createElement("canvas");
  paper.width = width;
  paper.height = height;
  const paperContext = paper.getContext("2d");
  if (!smallContext || !paperContext) return;
  smallContext.imageSmoothingQuality = "high";
  smallContext.drawImage(canvas, 0, 0, small.width, small.height);
  paperContext.imageSmoothingQuality = "high";
  paperContext.drawImage(small, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  const background = paperContext.getImageData(0, 0, width, height).data;
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const ratio = data[index + channel] / Math.max(40, background[index + channel]);
      data[index + channel] = Math.max(0, Math.min(255, ((ratio - 0.55) / 0.4) * 255));
    }
  }
  context.putImageData(image, 0, 0);
}

export async function shrink(file: File, clean = false) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read that image.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  if (clean) cleanPage(canvas);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Could not read that image.");
  return { blob, width, height };
}

const persist = (nodes: BoardNode[]) => nodes.map(({ id, type, position, data, width, height, style, parentId, extent, zIndex }) => ({ id, type, position, data, width, height, style, parentId, extent, zIndex }));
const persistEdges = (edges: Edge[]) => edges.map(({ id, source, target, sourceHandle, targetHandle, type, data }) => ({ id, source, target, sourceHandle, targetHandle, type, data }));

const SHAPE_SIZE: Record<Shape, { width: number; height: number }> = {
  rect: { width: 184, height: 88 }, round: { width: 176, height: 72 }, diamond: { width: 152, height: 104 }, cylinder: { width: 144, height: 96 },
  ellipse: { width: 152, height: 72 }, hex: { width: 176, height: 88 }, slant: { width: 176, height: 72 },
};
const sizeOf = (node: Node) => ({ width: node.width ?? node.measured?.width ?? BLOCK_SIZE.width, height: node.height ?? node.measured?.height ?? BLOCK_SIZE.height });

const absoluteIn = (list: Node[], node: Node) => {
  let x = node.position.x;
  let y = node.position.y;
  for (let parent = node.parentId, hops = 0; parent && hops < 12; hops += 1) {
    const holder = list.find((item) => item.id === parent);
    if (!holder) break;
    x += holder.position.x;
    y += holder.position.y;
    parent = holder.parentId;
  }
  return { x, y };
};

/** After items move, connectors between blocks leave from the sides that now face each other. */
function retarget(list: Node[], links: Edge[], moved: Set<string>) {
  const portable = (node?: Node) => node?.type === "block" || node?.type === "group";
  return links.map((edge) => {
    if (edge.type !== "link") return edge;
    const from = list.find((node) => node.id === edge.source);
    const to = list.find((node) => node.id === edge.target);
    if (!portable(from) || !portable(to) || (!moved.has(edge.source) && !moved.has(edge.target))) return edge;
    const ports = portsFor({ ...absoluteIn(list, from!), ...sizeOf(from!) }, { ...absoluteIn(list, to!), ...sizeOf(to!) });
    return { ...edge, sourceHandle: ports.source, targetHandle: ports.target };
  });
}

/** Containers must come before what they hold, or the editor cannot place the children. */
function ordered<T extends Node>(list: T[]): T[] {
  const byId = new Map(list.map((node) => [node.id, node]));
  const out: T[] = [];
  const seen = new Set<string>();
  const visit = (node: T) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) visit(parent);
    out.push(node);
  };
  list.forEach(visit);
  return out;
}

/** The ids and everything nested inside them. */
function withDescendants(list: Node[], ids: Iterable<string>) {
  const all = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of list) if (node.parentId && all.has(node.parentId) && !all.has(node.id)) { all.add(node.id); grew = true; }
  }
  return all;
}

type History = { stack: string[]; index: number; at: number; restoring: boolean; last: string };
const SNAP_KEY = "ws-board-snap";
const MARQUEE_KEY = "ws-board-marquee";
/**
 * The exporter copies computed styles, but not the CSS variables the shapes and connectors are painted with. Pins the
 * resolved colours onto every drawn SVG element for the duration of an export and returns the way back.
 */
function freezePaint(root: Element) {
  const saved: [Element, string | null][] = [];
  root.querySelectorAll("path, rect, ellipse, polygon, circle, line, polyline").forEach((el) => {
    const computed = getComputedStyle(el);
    saved.push([el, el.getAttribute("style")]);
    const style = (el as SVGElement).style;
    style.fill = computed.fill;
    style.stroke = computed.stroke;
    style.strokeWidth = computed.strokeWidth;
    style.strokeDasharray = computed.strokeDasharray;
  });
  return () => saved.forEach(([el, css]) => { if (css === null) el.removeAttribute("style"); else el.setAttribute("style", css); });
}
const download = (url: string, name: string) => { const link = document.createElement("a"); link.download = name; link.href = url; link.click(); };

type CanvasProps = { boardId: string; title: string; onTitle: (title: string) => void; onSaveState: (state: "saved" | "saving" | "error") => void; onBack: () => void; onError: (message: string) => void; onChanged: () => void };

function Inner({ boardId, title, onTitle, onSaveState, onBack, onError, onChanged }: CanvasProps) {
  const { theme } = useContext(ThemeContext);
  const flow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [meta, setMeta] = useState<BoardMeta | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [busy, setBusy] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [readId, setReadId] = useState<string | null>(null);
  // Phones get a text sheet instead of typing on the canvas, where the keyboard fights the zoomed viewport.
  const [touch, setTouch] = useState(false);
  const [marquee, setMarquee] = useState(false);
  // With a mouse, dragging on empty canvas selects; with a finger it pans. Either can be switched from the toolbar.
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setTouch(coarse);
    let saved: string | null = null;
    try { saved = localStorage.getItem(MARQUEE_KEY); } catch { /* ignore */ }
    setMarquee(saved ? saved === "on" : !coarse);
  }, []);
  const [snap, setSnap] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(SNAP_KEY) === "off") setSnap(false); } catch { /* ignore */ } }, []);
  const [menu, setMenu] = useState<"shapes" | "layout" | "export" | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [connecting, setConnecting] = useState(false);
  const [dismissed, setDismissed] = useState("");
  const [focusName, setFocusName] = useState(false);
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const loaded = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ nodes, edges, title });
  const callbacks = useRef({ onError, onChanged });
  const dirty = useRef(false);
  const lastSaved = useRef<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const scan = useRef<HTMLInputElement>(null);
  const history = useRef<History>({ stack: [], index: -1, at: 0, restoring: false, last: "" });
  const clipboard = useRef<{ nodes: BoardNode[]; edges: Edge[]; pasted: number } | null>(null);
  latest.current = { nodes, edges, title };
  callbacks.current = { onError, onChanged };

  const flagHistory = () => setHistoryState({ undo: history.current.index > 0, redo: history.current.index < history.current.stack.length - 1 });
  const snapshot = (list: BoardNode[], links: Edge[]) => JSON.stringify([persist(list), persistEdges(links)]);

  /** Loads the board from the server. A reload (after the assistant changed it) keeps the current view. */
  const load = useCallback(async (first: boolean) => {
    try {
      const data = await parseResponse<{ board: BoardMeta; content: { nodes: BoardNode[]; edges: Edge[] } }>(await fetch(endpoint(boardId), { cache: "no-store" }));
      setMeta(data.board);
      onTitle(data.board.title);
      const loadedNodes = ordered(data.content.nodes);
      setNodes(loadedNodes);
      setEdges(data.content.edges);
      history.current = { stack: [snapshot(loadedNodes, data.content.edges)], index: 0, at: 0, restoring: false, last: snapshot(loadedNodes, data.content.edges) };
      flagHistory();
      dirty.current = false;
      lastSaved.current = null;
      if (first) window.setTimeout(() => { loaded.current = true; void flow.fitView({ padding: 0.3, maxZoom: 1 }); }, 50);
    } catch (cause) {
      if (!first) return callbacks.current.onError(cause instanceof Error ? cause.message : "Could not refresh the board.");
      callbacks.current.onError(cause instanceof Error ? cause.message : "Could not open the board.");
      onBack();
    }
  }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const onChange = (event: Event) => { if ((event as CustomEvent<ChangedDetail>).detail?.boardId === boardId) void load(false); };
    window.addEventListener(MINDSTREAM_CHANGED, onChange);
    return () => window.removeEventListener(MINDSTREAM_CHANGED, onChange);
  }, [boardId, load]);

  // Saves only when something changed. The callbacks live in a ref so a parent re-render never retriggers a save.
  const save = useCallback(async () => {
    if (!dirty.current) return;
    const { nodes: n, edges: e, title: t } = latest.current;
    dirty.current = false;
    setSaveState("saving");
    try {
      await parseResponse(await fetch(endpoint(boardId), { method: "PATCH", headers, body: JSON.stringify({ title: t, content: { nodes: persist(n), edges: persistEdges(e) } }) }));
      setSaveState(dirty.current ? "saving" : "saved");
      callbacks.current.onChanged();
    } catch (cause) {
      dirty.current = true;
      setSaveState("error");
      callbacks.current.onError(cause instanceof Error ? cause.message : "Could not save the board.");
    }
  }, [boardId]);

  // Autosave after a pause. Selection and measuring also change the node list, so only meaningful edits count.
  const graphSignature = useMemo(() => snapshot(nodes, edges), [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps
  const signature = useMemo(() => `${graphSignature}${JSON.stringify(title)}`, [graphSignature, title]);
  useEffect(() => {
    if (!loaded.current) return;
    if (lastSaved.current === null) { lastSaved.current = signature; return; }
    if (signature === lastSaved.current) return;
    lastSaved.current = signature;
    dirty.current = true;
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 1000);
  }, [signature, save]);
  useEffect(() => () => { window.clearTimeout(timer.current); void save(); }, [save]);
  useEffect(() => registerFlush(async () => { window.clearTimeout(timer.current); await save(); }), [save]);
  useEffect(() => { onSaveState(saveState); }, [saveState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo history: every change settles into a snapshot; a burst of edits (typing, dragging) counts as one step.
  useEffect(() => {
    const h = history.current;
    if (!loaded.current || !h.stack.length || graphSignature === h.last) return;
    h.last = graphSignature;
    if (h.restoring) { h.restoring = false; return; }
    const now = Date.now();
    h.stack = h.stack.slice(0, h.index + 1);
    if (now - h.at < 700 && h.index > 0) h.stack[h.index] = graphSignature;
    else { h.stack.push(graphSignature); h.index = h.stack.length - 1; }
    if (h.stack.length > 120) { h.stack.shift(); h.index -= 1; }
    h.at = now;
    flagHistory();
  }, [graphSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (index: number) => {
    const h = history.current;
    if (index < 0 || index >= h.stack.length) return;
    const [savedNodes, savedEdges] = JSON.parse(h.stack[index]) as [BoardNode[], Edge[]];
    h.index = index;
    h.at = 0;
    h.restoring = h.stack[index] !== h.last;
    setNodes(ordered(savedNodes));
    setEdges(savedEdges);
    flagHistory();
  };
  const undo = () => goTo(history.current.index - 1);
  const redo = () => goTo(history.current.index + 1);

  const center = () => {
    const box = document.querySelector(".board__canvas")?.getBoundingClientRect();
    return flow.screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 600) / 2, y: (box?.top ?? 0) + (box?.height ?? 400) / 2 });
  };
  const spread = (index: number) => ({ x: (index % 4) * 24, y: (index % 4) * 24 });
  const deselect = (list: BoardNode[]) => list.map((node) => ({ ...node, selected: false }));
  const absOf = (id: string) => flow.getInternalNode(id)?.internals.positionAbsolute ?? { x: 0, y: 0 };
  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  const selectionKey = [...selectedNodes.map((node) => node.id), ...selectedEdges.map((edge) => edge.id)].join(",");

  const addText = () => {
    const at = center();
    const id = crypto.randomUUID();
    setNodes((current) => [...deselect(current), { id, type: "text", position: { x: at.x - 110 + spread(current.length).x, y: at.y - 60 + spread(current.length).y }, width: 220, height: 130, data: { text: "", tone: "paper" }, selected: true }]);
    if (touch) setEditId(id);
    setMenu(null);
  };

  const addBlock = (shape: Shape) => {
    const at = center();
    const size = SHAPE_SIZE[shape];
    const id = crypto.randomUUID();
    setNodes((current) => [...deselect(current), { id, type: "block", position: { x: snapTo(at.x - size.width / 2 + spread(current.length).x), y: snapTo(at.y - size.height / 2 + spread(current.length).y) }, ...size, data: { text: "", kicker: "", body: "", shape, tone: "paper" }, selected: true } as BoardNode]);
    setFocusName(true);
    setMenu(null);
  };

  /** Wraps the selected items in a subsystem container; with nothing selected, adds an empty one. */
  const addGroup = () => {
    const picked = latest.current.nodes.filter((node) => node.selected);
    const parentId = picked[0]?.parentId;
    const wrapped = picked.filter((node) => node.parentId === parentId);
    const id = crypto.randomUUID();
    const parentAbs = parentId ? absOf(parentId) : { x: 0, y: 0 };
    if (!wrapped.length) {
      const at = center();
      setNodes((current) => ordered([...deselect(current), { id, type: "group", position: { x: snapTo(at.x - 200), y: snapTo(at.y - 130) }, width: 400, height: 260, zIndex: -1, data: { text: "", tone: "paper", dashed: true }, selected: true } as BoardNode]));
      setFocusName(true);
      setMenu(null);
      return;
    }
    const boxes = wrapped.map((node) => ({ ...absOf(node.id), ...sizeOf(node) }));
    const left = Math.min(...boxes.map((box) => box.x)) - 40;
    const top = Math.min(...boxes.map((box) => box.y)) - 56;
    const right = Math.max(...boxes.map((box) => box.x + box.width)) + 40;
    const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + 40;
    const ids = new Set(wrapped.map((node) => node.id));
    setNodes((current) => ordered([
      ...current.map((node) => ids.has(node.id) ? { ...node, parentId: id, selected: false, position: { x: absOf(node.id).x - left, y: absOf(node.id).y - top } } : { ...node, selected: false }),
      { id, type: "group", position: { x: snapTo(left) - parentAbs.x, y: snapTo(top) - parentAbs.y }, width: snapTo(right - left), height: snapTo(bottom - top), zIndex: -1, ...(parentId ? { parentId } : {}), data: { text: "", tone: "paper", dashed: true }, selected: true } as BoardNode,
    ]));
    setFocusName(true);
  };

  const ungroup = (id: string) => {
    setNodes((current) => {
      const group = current.find((node) => node.id === id);
      if (!group) return current;
      return ordered(current.filter((node) => node.id !== id).map((node) => node.parentId === id
        ? { ...node, parentId: group.parentId, position: { x: node.position.x + group.position.x, y: node.position.y + group.position.y }, selected: true }
        : { ...node, selected: false }));
    });
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
  };

  const addImages = (items: { name: string; width: number; height: number }[]) => {
    const at = center();
    setNodes((current) => [...deselect(current), ...items.map((item, index) => {
      const width = Math.min(360, item.width);
      return { id: crypto.randomUUID(), type: "image" as const, position: { x: at.x - width / 2 + index * 28, y: at.y - 120 + index * 28 }, width, height: Math.round(width * item.height / item.width), data: { name: item.name, ratio: item.height / item.width } };
    })]);
  };

  async function onFiles(files: FileList | null, clean = false) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: { name: string; width: number; height: number }[] = [];
      for (const item of [...files].slice(0, 8)) {
        const { blob, width, height } = await shrink(item, clean);
        const result = await parseResponse<{ name: string }>(await fetch(`${endpoint(boardId)}/assets`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob }));
        added.push({ name: result.name, width, height });
      }
      addImages(added);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not add the image.");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
      if (scan.current) scan.current.value = "";
    }
  }

  /** Lays the organized notes out as a tree to the right of the photo and links them to it. */
  const addOrganized = (source: BoardNode, result: Organized) => {
    const { root, children, edges: tree } = layoutOrganized(result, source.position.x + (source.width ?? 300) + 120, source.position.y);
    setNodes((current) => [...deselect(current), root, ...children]);
    setEdges((current) => [...current, { id: crypto.randomUUID(), source: source.id, target: root.id }, ...tree]);
    window.setTimeout(() => void flow.fitView({ nodes: [source, root, ...children].map((item) => ({ id: item.id })), padding: 0.2, maxZoom: 1, duration: 400 }), 80);
  };

  const update = useCallback((id: string, data: Partial<TextData>) => setNodes((current) => current.map((node) => node.id === id && node.type === "text" ? { ...node, data: { ...node.data, ...data } } : node)), [setNodes]);
  const patch = useCallback((id: string, data: Record<string, unknown>) => setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, ...data } } as BoardNode : node)), [setNodes]);
  const patchEdge = (id: string, data: Partial<LinkData>) => setEdges((current) => current.map((edge) => edge.id === id ? { ...edge, data: { ...DEFAULT_LINK, ...(edge.data as Partial<LinkData> | undefined), ...data } } : edge));
  const resize = (id: string, size: { width?: number; height?: number }) => setNodes((current) => current.map((node) => node.id === id ? { ...node, ...size } : node));
  const reverse = (id: string) => setEdges((current) => current.map((edge) => edge.id === id ? { ...edge, source: edge.target, target: edge.source, sourceHandle: edge.targetHandle, targetHandle: edge.sourceHandle } : edge));

  const onConnect = useCallback((connection: Connection) => setEdges((current) => [
    ...current.map((edge) => ({ ...edge, selected: false })),
    { id: crypto.randomUUID(), source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle, type: "link", data: { ...DEFAULT_LINK }, selected: true },
  ]), [setEdges]);
  const onReconnect = useCallback((previous: Edge, connection: Connection) => setEdges((current) => reconnectEdge(previous, connection, current, { shouldReplaceId: false })), [setEdges]);

  const removeSelected = () => {
    const gone = withDescendants(latest.current.nodes, latest.current.nodes.filter((node) => node.selected).map((node) => node.id));
    setNodes((current) => current.filter((node) => !gone.has(node.id)));
    setEdges((current) => current.filter((edge) => !edge.selected && !gone.has(edge.source) && !gone.has(edge.target)));
  };

  // ---- precision: alignment guides, snapping and dragging into containers -------------------------------------
  const onNodesChangeWithGuides = (changes: NodeChange<BoardNode>[]) => {
    const moving = changes.filter((change) => change.type === "position" && change.dragging && change.position);
    if (moving.length === 1 && snap) {
      const change = moving[0] as Extract<NodeChange<BoardNode>, { type: "position" }>;
      const node = latest.current.nodes.find((item) => item.id === change.id);
      if (node && change.position) {
        const offset = node.parentId ? absOf(node.parentId) : { x: 0, y: 0 };
        const { width, height } = sizeOf(node);
        let x = change.position.x + offset.x;
        let y = change.position.y + offset.y;
        const skip = withDescendants(latest.current.nodes, [node.id]);
        const xs: number[] = [];
        const ys: number[] = [];
        for (const other of latest.current.nodes) {
          if (skip.has(other.id) || other.type === "group") continue;
          const at = absOf(other.id);
          const box = sizeOf(other);
          xs.push(at.x, at.x + box.width / 2, at.x + box.width);
          ys.push(at.y, at.y + box.height / 2, at.y + box.height);
        }
        const reach = 6 / Math.max(0.2, flow.getViewport().zoom);
        const guide = { x: [] as number[], y: [] as number[] };
        const fit = (value: number, size: number, targets: number[], line: number[]) => {
          let best: { move: number; at: number } | null = null;
          for (const own of [0, size / 2, size]) for (const target of targets) {
            const move = target - (value + own);
            if (Math.abs(move) <= reach && (!best || Math.abs(move) < Math.abs(best.move))) best = { move, at: target };
          }
          if (best) { line.push(best.at); return value + best.move; }
          return value;
        };
        x = fit(x, width, xs, guide.x);
        y = fit(y, height, ys, guide.y);
        change.position = { x: x - offset.x, y: y - offset.y };
        setGuides((current) => current.x.join() === guide.x.join() && current.y.join() === guide.y.join() ? current : guide);
      }
    } else if (guides.x.length || guides.y.length) {
      setGuides({ x: [], y: [] });
    }
    onNodesChange(changes);
  };

  /** After a drag, a block lands in the smallest container it sits in, or leaves one it no longer sits in. */
  const onNodeDragStop = (_event: unknown, _node: unknown, dragged: BoardNode[]) => {
    setGuides({ x: [], y: [] });
    setNodes((current) => {
      const moved = new Set(dragged.map((node) => node.id));
      let next = current;
      for (const item of dragged) {
        const node = next.find((candidate) => candidate.id === item.id);
        if (!node || (node.parentId && moved.has(node.parentId))) continue;
        const at = absOf(node.id);
        const box = sizeOf(node);
        const middle = { x: at.x + box.width / 2, y: at.y + box.height / 2 };
        const inside = withDescendants(next, [node.id]);
        let best: BoardNode | null = null;
        let bestArea = Infinity;
        for (const group of next) {
          if (group.type !== "group" || inside.has(group.id)) continue;
          const gAt = absOf(group.id);
          const gBox = sizeOf(group);
          if (middle.x >= gAt.x && middle.x <= gAt.x + gBox.width && middle.y >= gAt.y && middle.y <= gAt.y + gBox.height && gBox.width * gBox.height < bestArea) { best = group; bestArea = gBox.width * gBox.height; }
        }
        if ((best?.id ?? undefined) === node.parentId) continue;
        const base = best ? absOf(best.id) : { x: 0, y: 0 };
        next = next.map((candidate) => candidate.id === node.id ? { ...candidate, parentId: best?.id, position: { x: at.x - base.x, y: at.y - base.y } } as BoardNode : candidate);
      }
      return next === current ? current : ordered(next);
    });
  };

  // ---- arranging ----------------------------------------------------------------------------------------------
  /** Selected items that are not already moving with a selected container. */
  const topSelected = () => {
    const list = latest.current.nodes;
    const ids = new Set(list.filter((node) => node.selected).map((node) => node.id));
    const hasSelectedAncestor = (node: BoardNode) => {
      for (let parent = node.parentId, hops = 0; parent && hops < 12; hops += 1) {
        if (ids.has(parent)) return true;
        parent = list.find((item) => item.id === parent)?.parentId;
      }
      return false;
    };
    return list.filter((node) => ids.has(node.id) && !hasSelectedAncestor(node));
  };
  const moveAbsolute = (positions: Map<string, { x?: number; y?: number }>) => setNodes((current) => current.map((node) => {
    const to = positions.get(node.id);
    if (!to) return node;
    const base = node.parentId ? absOf(node.parentId) : { x: 0, y: 0 };
    const at = absOf(node.id);
    return { ...node, position: { x: (to.x ?? at.x) - base.x, y: (to.y ?? at.y) - base.y } };
  }));
  const boxesOf = () => topSelected().map((node) => ({ id: node.id, ...absOf(node.id), ...sizeOf(node) }));
  const align = (how: Align) => { const boxes = boxesOf(); if (boxes.length > 1) moveAbsolute(alignBoxes(boxes, how)); };
  const distribute = (axis: "x" | "y") => { const boxes = boxesOf(); if (boxes.length > 2) moveAbsolute(new Map([...distributeBoxes(boxes, axis)].map(([id, value]) => [id, { [axis]: value }]))); };
  const match = (dimension: "width" | "height") => {
    const picked = topSelected();
    const first = picked[0];
    if (!first) return;
    const value = sizeOf(first)[dimension];
    const ids = new Set(picked.map((node) => node.id));
    setNodes((current) => current.map((node) => ids.has(node.id) ? { ...node, [dimension]: value } : node));
  };

  const nudge = (dx: number, dy: number) => {
    const ids = new Set(topSelected().map((node) => node.id));
    if (!ids.size) return;
    setNodes((current) => current.map((node) => ids.has(node.id) ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } } : node));
  };

  const autoLayout = (direction: "LR" | "TB") => {
    setMenu(null);
    const list = latest.current.nodes;
    const placed = layoutGraph(list.map((node) => ({ id: node.id, parentId: node.parentId, ...sizeOf(node) })), latest.current.edges, direction);
    const moved = list.map((node) => placed.has(node.id) ? { ...node, position: placed.get(node.id)! } : node);
    setNodes(moved);
    setEdges(retarget(moved, latest.current.edges, withDescendants(list, placed.keys())));
    window.setTimeout(() => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 400 }), 80);
  };

  /** One click: lines connected items up along their connections and packs the rest into neat rows. */
  const tidy = () => {
    setMenu(null);
    const list = latest.current.nodes;
    const picked = list.filter((node) => node.selected);
    const parentId = picked.length > 1 ? picked[0].parentId : undefined;
    const scope = picked.length > 1 ? picked.filter((node) => node.parentId === parentId) : list.filter((node) => !node.parentId);
    if (scope.length < 2) return;
    const placed = tidyGraph(
      list.map((node) => ({ id: node.id, parentId: node.parentId, ...sizeOf(node) })),
      scope.map((node) => ({ id: node.id, ...sizeOf(node), x: node.position.x, y: node.position.y })),
      latest.current.edges, "LR",
    );
    let moved = list.map((node) => placed.has(node.id) ? { ...node, position: placed.get(node.id)! } : node);
    if (parentId) {
      // A container grows to hold what was tidied inside it.
      const inside = moved.filter((node) => placed.has(node.id));
      const need = { width: Math.max(...inside.map((node) => node.position.x + sizeOf(node).width)) + 40, height: Math.max(...inside.map((node) => node.position.y + sizeOf(node).height)) + 40 };
      moved = moved.map((node) => node.id === parentId ? { ...node, width: Math.max(sizeOf(node).width, need.width), height: Math.max(sizeOf(node).height, need.height) } : node);
    }
    setNodes(moved);
    setEdges(retarget(moved, latest.current.edges, withDescendants(list, placed.keys())));
    if (!parentId && picked.length < 2) window.setTimeout(() => void flow.fitView({ padding: 0.15, maxZoom: 1, duration: 400 }), 80);
  };

  // ---- copy, paste, duplicate -----------------------------------------------------------------------------------
  const cloneOf = (source: BoardNode[], links: Edge[], offset: number) => {
    const ids = withDescendants(source, source.filter((node) => node.selected).map((node) => node.id));
    const picked = source.filter((node) => ids.has(node.id));
    const map = new Map(picked.map((node) => [node.id, crypto.randomUUID()]));
    const copies = picked.map((node) => {
      const inside = !!node.parentId && map.has(node.parentId);
      return { ...node, id: map.get(node.id)!, selected: true, parentId: inside ? map.get(node.parentId!) : node.parentId, position: inside ? node.position : { x: node.position.x + offset, y: node.position.y + offset } } as BoardNode;
    });
    const edgeCopies = links.filter((edge) => map.has(edge.source) && map.has(edge.target)).map((edge) => ({ ...edge, id: crypto.randomUUID(), source: map.get(edge.source)!, target: map.get(edge.target)!, selected: false }));
    return { copies, edgeCopies };
  };
  const duplicate = () => {
    const { copies, edgeCopies } = cloneOf(latest.current.nodes, latest.current.edges, 24);
    if (!copies.length) return;
    setNodes((current) => ordered([...deselect(current), ...copies]));
    setEdges((current) => [...current, ...edgeCopies]);
  };
  const copy = () => {
    const picked = latest.current.nodes.filter((node) => node.selected);
    if (picked.length) clipboard.current = { nodes: latest.current.nodes, edges: latest.current.edges, pasted: 0 };
  };
  const paste = () => {
    const held = clipboard.current;
    if (!held) return;
    held.pasted += 1;
    const { copies, edgeCopies } = cloneOf(held.nodes, held.edges, 24 * held.pasted);
    setNodes((current) => ordered([...deselect(current), ...copies]));
    setEdges((current) => [...current, ...edgeCopies]);
  };

  // ---- picture of the diagram -----------------------------------------------------------------------------------
  const exportImage = async (kind: "png" | "svg") => {
    setMenu(null);
    const bounds = flow.getNodesBounds(latest.current.nodes);
    const element = document.querySelector<HTMLElement>(".board__canvas .react-flow__viewport");
    if (!element || !latest.current.nodes.length) return onError("There is nothing to export yet.");
    const pad = 48;
    const width = Math.min(4000, Math.ceil(bounds.width + pad * 2));
    const height = Math.min(4000, Math.ceil(bounds.height + pad * 2));
    const options = {
      width, height, pixelRatio: kind === "png" ? 2 : 1,
      backgroundColor: getComputedStyle(document.querySelector(".board") ?? document.body).getPropertyValue("--bg").trim() || "#ffffff",
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${pad - bounds.x}px, ${pad - bounds.y}px) scale(1)` },
      filter: (node: HTMLElement) => !node.classList?.contains("board__guide"),
    };
    const thaw = freezePaint(element);
    try {
      const make = kind === "png" ? toPng : toSvg;
      // Web fonts live in cross-origin stylesheets that cannot be read back, so embedding them only stalls the export.
      const url = await make(element, { ...options, skipFonts: true });
      download(url, `${(latest.current.title || "diagram").replace(/[^\w一-龥-]+/g, "-").slice(0, 60)}.${kind}`);
    } catch {
      onError("Could not make the picture. Try again.");
    } finally {
      thaw();
    }
  };

  // ---- keyboard ---------------------------------------------------------------------------------------------------
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keys.current = (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable='true']") || editId !== null || readId !== null || pdfOpen) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    else if (mod && key === "y") { event.preventDefault(); redo(); }
    else if (mod && key === "d") { event.preventDefault(); duplicate(); }
    else if (mod && key === "c") copy();
    else if (mod && key === "v") { if (clipboard.current) { event.preventDefault(); paste(); } }
    else if (mod && key === "a") { event.preventDefault(); setNodes((current) => current.map((node) => ({ ...node, selected: true }))); }
    else if (mod && key === "g") { event.preventDefault(); if (event.shiftKey) { const group = latest.current.nodes.find((node) => node.selected && node.type === "group"); if (group) ungroup(group.id); } else addGroup(); }
    else if (key.startsWith("arrow") && !mod && latest.current.nodes.some((node) => node.selected)) {
      event.preventDefault();
      const step = event.shiftKey ? GRID * 4 : GRID;
      nudge(key === "arrowleft" ? -step : key === "arrowright" ? step : 0, key === "arrowup" ? -step : key === "arrowdown" ? step : 0);
    } else if (key === "escape") { setNodes((current) => deselect(current)); setEdges((current) => current.map((edge) => ({ ...edge, selected: false }))); setMenu(null); }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setFocusName(false); }, [selectionKey]);

  const selectedCount = selectedNodes.length + selectedEdges.length;
  const panelOpen = selectedCount > 0 && dismissed !== selectionKey;
  const toggleSnap = () => setSnap((value) => { try { localStorage.setItem(SNAP_KEY, value ? "off" : "on"); } catch { /* ignore */ } return !value; });

  return <BoardContext.Provider value={{ boardId, touch, update, patch, edit: setEditId, read: setReadId }}>
    <div className={`board${connecting ? " is-connecting" : ""}`} onFocus={(event) => setEditing(event.target instanceof HTMLTextAreaElement)} onBlur={() => setEditing(false)}>
      <div className="board__canvas">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChangeWithGuides} onEdgesChange={onEdgesChange} onConnect={onConnect} onReconnect={onReconnect}
          onNodeDragStop={onNodeDragStop} onConnectStart={() => setConnecting(true)} onConnectEnd={() => setConnecting(false)}
          connectionMode={ConnectionMode.Loose} connectionLineType={ConnectionLineType.SmoothStep} snapToGrid={snap} snapGrid={[GRID, GRID]} elevateNodesOnSelect={false}
          selectionOnDrag={marquee} selectionMode={SelectionMode.Partial} panOnDrag={marquee ? [1, 2] : true} panOnScroll={marquee && !touch} multiSelectionKeyCode={["Meta", "Control", "Shift"]}
          colorMode={theme} minZoom={0.1} maxZoom={2.5} zoomOnDoubleClick={false} connectionRadius={32} deleteKeyCode={["Backspace", "Delete"]} proOptions={{ hideAttribution: true }}>
          <Background variant={BackgroundVariant.Dots} gap={snap ? GRID * 3 : 22} size={1.4} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap pannable zoomable position="bottom-right" className="board__minimap" />
          <ViewportPortal>
            {guides.x.map((x) => <div key={`x${x}`} className="board__guide board__guide--x" style={{ transform: `translate(${x}px, -50000px)` }} />)}
            {guides.y.map((y) => <div key={`y${y}`} className="board__guide board__guide--y" style={{ transform: `translate(-50000px, ${y}px)` }} />)}
          </ViewportPortal>
        </ReactFlow>
        {meta && nodes.length === 0 && <p className="board__empty">An empty board. Add a block to start a diagram, or a card for notes. Scan notes photographs a notebook page.</p>}
        <div className="board__bar2" role="toolbar" aria-label="Diagram tools">
          <button type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={!historyState.undo} onClick={undo}><Undo2 size={17} /></button>
          <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!historyState.redo} onClick={redo}><Redo2 size={17} /></button>
          <i />
          <button type="button" className="board__tidy" aria-label="Tidy up" title="Tidy up: line up connected items and pack the rest into rows (selected items only, if several are selected)" onClick={tidy}><LayoutGrid size={17} /> <span>Tidy</span></button>
          <button type="button" aria-label="Snap and guides" aria-pressed={snap} title="Snap to grid and alignment guides" className={snap ? "is-on" : ""} onClick={toggleSnap}><Magnet size={17} /></button>
          <button type="button" aria-label="Drag to select" aria-pressed={marquee} title={marquee ? "Dragging on empty canvas selects. Pan with Space + drag, right-drag or scroll. Click to switch to panning." : "Dragging pans. Click to make dragging select several items."} className={marquee ? "is-on" : ""} onClick={() => setMarquee((value) => { try { localStorage.setItem(MARQUEE_KEY, value ? "off" : "on"); } catch { /* ignore */ } return !value; })}><BoxSelect size={17} /></button>
          <button type="button" aria-label="Auto layout" title="Auto layout" aria-expanded={menu === "layout"} onClick={() => setMenu(menu === "layout" ? null : "layout")}><Workflow size={17} /></button>
          <button type="button" aria-label="Fit to screen" title="Fit to screen" onClick={() => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 })}><Maximize size={17} /></button>
          <button type="button" aria-label="Export picture" title="Export picture" aria-expanded={menu === "export"} onClick={() => setMenu(menu === "export" ? null : "export")}><Download size={17} /></button>
          {menu === "layout" && <div className="board__menu" role="menu">
            <button type="button" role="menuitem" onClick={() => autoLayout("LR")}>Left to right</button>
            <button type="button" role="menuitem" onClick={() => autoLayout("TB")}>Top to bottom</button>
          </div>}
          {menu === "export" && <div className="board__menu" role="menu">
            <button type="button" role="menuitem" onClick={() => void exportImage("png")}>PNG image</button>
            <button type="button" role="menuitem" onClick={() => void exportImage("svg")}>SVG vector</button>
          </div>}
        </div>
        {panelOpen && <BoardInspector key={selectionKey} nodes={selectedNodes} edges={selectedEdges} focusName={focusName} onNode={patch} onSize={resize} onEdge={patchEdge} onReverse={reverse}
          onTidy={tidy} onAlign={align} onDistribute={distribute} onMatch={match} onGroup={addGroup} onUngroup={ungroup} onDuplicate={duplicate} onDelete={removeSelected} onClose={() => setDismissed(selectionKey)} />}
      </div>
      {menu === "shapes" && <div className="board__shapes" role="menu" aria-label="Shapes">
        {SHAPES.map((shape) => <button key={shape.id} type="button" role="menuitem" onClick={() => addBlock(shape.id)}><span className={`bglyph bglyph--${shape.id}`} aria-hidden="true" /><strong>{shape.label}</strong><small>{shape.hint}</small></button>)}
        <button type="button" role="menuitem" onClick={() => addGroup()}><span className="bglyph bglyph--group" aria-hidden="true" /><strong>{selectedNodes.length > 1 ? "Group selection" : "Container"}</strong><small>Subsystem boundary</small></button>
        <button type="button" role="menuitem" onClick={addText}><span className="bglyph bglyph--card" aria-hidden="true" /><strong>Note card</strong><small>Free text</small></button>
      </div>}
      <div className={`board__tools${editing ? " is-hidden" : ""}`} role="toolbar" aria-label="Add to board">
        <button type="button" className="board__shape" aria-expanded={menu === "shapes"} onClick={() => setMenu(menu === "shapes" ? null : "shapes")}><ShapesIcon size={18} /> <span>Shapes</span></button>
        <button type="button" onClick={addText}><StickyNote size={18} /> <span>Card</span></button>
        <button type="button" className="board__scan" onClick={() => scan.current?.click()} disabled={busy}>{busy ? <Loader2 size={18} className="ws-spin" /> : <ScanLine size={18} />} <span>Scan notes</span></button>
        <button type="button" onClick={() => file.current?.click()} disabled={busy}><ImageIcon size={18} /> <span>Photo</span></button>
        <button type="button" onClick={() => setPdfOpen(true)}><FileText size={18} /> <span>PDF</span></button>
        {selectedNodes.length > 1 && <button type="button" onClick={addGroup}><GroupIcon size={18} /> <span>Group</span></button>}
        {selectedCount > 0 && <button type="button" className="board__delete" onClick={removeSelected}><Trash2 size={18} /> <span>Delete</span></button>}
      </div>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(event) => void onFiles(event.target.files)} />
      <input ref={scan} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void onFiles(event.target.files, true)} />
      <Sheet open={editId !== null} onClose={() => setEditId(null)} title="Edit card" size="tall">
        {(() => {
          const node = nodes.find((item) => item.id === editId);
          if (!node || node.type !== "text") return null;
          return <div className="board-edit">
            <textarea autoFocus value={node.data.text} placeholder="Write something" onChange={(event) => update(node.id, { text: event.target.value })} />
            <div className="board-edit__tones">{TONES.map((tone) => <button key={tone} type="button" aria-label={`${tone} card`} className={`bnode__tone bnode--${tone}${tone === node.data.tone ? " is-on" : ""}`} onClick={() => update(node.id, { tone })} />)}</div>
          </div>;
        })()}
      </Sheet>
      <ReadSheet boardId={boardId} node={readId ? nodes.find((item) => item.id === readId && item.type === "image") ?? null : null} onClose={() => setReadId(null)} onError={onError} onAdd={(source, result) => { addOrganized(source, result); setReadId(null); }} />
      <PdfSheet open={pdfOpen} boardId={boardId} onClose={() => setPdfOpen(false)} onError={onError} onAdd={addImages} />
    </div>
  </BoardContext.Provider>;
}

/** Photo of a paper page → recognized text you can correct → proposed cards you confirm. */
function ReadSheet({ boardId, node, onClose, onError, onAdd }: { boardId: string; node: BoardNode | null; onClose: () => void; onError: (message: string) => void; onAdd: (source: BoardNode, result: Organized) => void }) {
  const [step, setStep] = useState<"reading" | "text" | "organizing" | "preview">("reading");
  const [text, setText] = useState("");
  const [result, setResult] = useState<Organized | null>(null);
  // Gemini returns a draft with the transcript; it is reused as long as the text is not edited.
  const [draft, setDraft] = useState<{ text: string; result: Organized } | null>(null);
  const id = node?.id;

  useEffect(() => {
    if (!node || node.type !== "image") return;
    let cancelled = false;
    setStep("reading");
    setText("");
    setResult(null);
    void (async () => {
      try {
        const data = await parseResponse<{ text: string; draft?: Organized | null }>(await fetch(`${endpoint(boardId)}/recognize`, { method: "POST", headers, body: JSON.stringify({ name: node.data.name }) }));
        if (cancelled) return;
        setText(data.text);
        setDraft(data.draft ? { text: data.text, result: data.draft } : null);
        setStep("text");
      } catch (cause) {
        if (cancelled) return;
        onError(cause instanceof Error ? cause.message : "Could not read that image.");
        onClose();
      }
    })();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function organize() {
    if (draft && draft.text === text) { setResult(draft.result); setStep("preview"); return; }
    setStep("organizing");
    try {
      setResult(await parseResponse<Organized>(await fetch(`${endpoint(boardId)}/organize`, { method: "POST", headers, body: JSON.stringify({ text }) })));
      setStep("preview");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not organize the text.");
      setStep("text");
    }
  }

  const depthOf = (items: Organized["items"], index: number): number => items[index].parent === null ? 0 : depthOf(items, items[index].parent as number) + 1;
  const primary = step === "text" ? { label: "Organize", onClick: () => void organize(), disabled: text.trim().length < 3 }
    : step === "preview" && result && node ? { label: "Add to board", onClick: () => onAdd(node, result) } : undefined;

  return <Sheet open={!!node} onClose={onClose} title="Read notes" size="tall" primary={primary}>
    {(step === "reading" || step === "organizing") && <p className="board-read__wait"><Loader2 className="ws-spin" size={16} /> {step === "reading" ? "Reading the photo…" : "Organizing with DeepSeek…"}</p>}
    {step === "text" && <div className="board-read">
      <p className="board-read__hint">Fix any misread words, then organize. Words marked [?] were hard to read.</p>
      <textarea value={text} onChange={(event) => setText(event.target.value)} />
      <p className="board-read__hint"><Sparkles size={13} /> DeepSeek turns this into cards you can review before they are added.</p>
    </div>}
    {step === "preview" && result && <div className="board-read">
      <p className="board-read__hint">Review the proposed cards. Nothing is added until you confirm.</p>
      <ul className="board-read__tree">
        <li className="is-title">{result.title}</li>
        {result.items.map((item, index) => <li key={index} style={{ paddingLeft: 14 + depthOf(result.items, index) * 18 }}>{item.text}</li>)}
      </ul>
      <button type="button" className="ws-text-button" onClick={() => setStep("text")}>Edit the text again</button>
    </div>}
  </Sheet>;
}

function parsePages(value: string, limit: number | null) {
  const pages = new Set<number>();
  for (const part of value.split(",")) {
    const [from, to] = part.split("-").map((item) => parseInt(item.trim(), 10));
    if (!Number.isFinite(from)) continue;
    for (let page = from; page <= (Number.isFinite(to) ? to : from) && pages.size < 12; page += 1) if (page > 0 && (!limit || page <= limit)) pages.add(page);
  }
  return [...pages];
}

function PdfSheet({ open, boardId, onClose, onError, onAdd }: { open: boolean; boardId: string; onClose: () => void; onError: (message: string) => void; onAdd: (items: { name: string; width: number; height: number }[]) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [docId, setDocId] = useState("");
  const [direct, setDirect] = useState<File | null>(null);
  const [range, setRange] = useState("1");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open || docs) return;
    void (async () => {
      try {
        const data = await parseResponse<{ documents: Doc[] }>(await fetch("/api/workspace/documents", { cache: "no-store" }));
        setDocs(data.documents.filter((item) => item.mimeType === "application/pdf"));
      } catch { setDocs([]); }
    })();
  }, [open, docs]);

  const current = docs?.find((item) => item.id === docId);
  const pages = parsePages(range, current?.pageCount ?? null);

  async function run() {
    if (!pages.length || (!current && !direct)) return;
    setWorking(true);
    try {
      const response = direct
        ? await fetch(`${endpoint(boardId)}/pdf?pages=${pages.join(",")}`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: direct })
        : await fetch(`${endpoint(boardId)}/pdf`, { method: "POST", headers, body: JSON.stringify({ documentId: current!.id, pages }) });
      const result = await parseResponse<{ pages: { name: string; width: number; height: number }[] }>(response);
      onAdd(result.pages);
      onClose();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not import the PDF.");
    } finally {
      setWorking(false);
    }
  }

  return <Sheet open={open} onClose={onClose} title="Add PDF pages" primary={{ label: working ? "Importing…" : "Import", onClick: () => void run(), disabled: working || !pages.length || (!current && !direct) }}>
    <div className="board-pdf">
      <label className="board-pdf__field"><span>From your library</span>
        <select value={docId} onChange={(event) => { setDocId(event.target.value); setDirect(null); }}>
          <option value="">{docs === null ? "Loading…" : docs.length ? "Choose a PDF" : "No PDFs in the library"}</option>
          {docs?.map((item) => <option key={item.id} value={item.id}>{item.name}{item.pageCount ? ` · ${item.pageCount} pages` : ""}</option>)}
        </select>
      </label>
      <label className="board-pdf__field"><span>Or a small PDF (up to 4 MB)</span>
        <input type="file" accept="application/pdf" onChange={(event) => { setDirect(event.target.files?.[0] ?? null); setDocId(""); }} />
      </label>
      <label className="board-pdf__field"><span>Pages (up to 12)</span>
        <input value={range} onChange={(event) => setRange(event.target.value)} placeholder="1-3, 7" inputMode="numeric" />
      </label>
    </div>
  </Sheet>;
}

export function BoardCanvas(props: CanvasProps) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
