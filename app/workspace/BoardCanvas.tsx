"use client";

import { addEdge, Background, BackgroundVariant, Controls, Handle, MiniMap, NodeResizer, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeft, FileText, Image as ImageIcon, Loader2, StickyNote, Trash2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BoardMeta } from "../lib/boardStore";
import { parseResponse } from "./api";
import { Sheet } from "./Sheet";
import { ThemeContext } from "./Shell";

type TextData = { text: string; tone: string };
type ImageData = { name: string; ratio: number };
type BoardNode = Node<TextData, "text"> | Node<ImageData, "image">;
type Doc = { id: string; name: string; mimeType: string; pageCount: number | null };

const TONES = ["paper", "sun", "sky", "leaf", "rose"];
const BoardContext = createContext<{ boardId: string; touch: boolean; update: (id: string, data: Partial<TextData>) => void; edit: (id: string) => void }>({ boardId: "", touch: false, update: () => undefined, edit: () => undefined });
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

function ImageCard({ data, selected }: NodeProps<Node<ImageData, "image">>) {
  const { boardId } = useContext(BoardContext);
  return <div className={`bnode bnode--image${selected ? " is-selected" : ""}`}>
    <NodeResizer isVisible={selected} minWidth={80} keepAspectRatio />
    <Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`${endpoint(boardId)}/assets/${data.name}`} alt="" draggable={false} />
  </div>;
}

const nodeTypes = { text: TextCard, image: ImageCard };

/** Shrinks a photo so it stays well under the request size limit, keeping handwriting legible. */
async function shrink(file: File) {
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
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Could not read that image.");
  return { blob, width, height };
}

const persist = (nodes: BoardNode[]) => nodes.map(({ id, type, position, data, width, height, style }) => ({ id, type, position, data, width, height, style }));
const persistEdges = (edges: Edge[]) => edges.map(({ id, source, target }) => ({ id, source, target }));

function Inner({ boardId, onBack, onError, onChanged }: { boardId: string; onBack: () => void; onError: (message: string) => void; onChanged: () => void }) {
  const { theme } = useContext(ThemeContext);
  const flow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [meta, setMeta] = useState<BoardMeta | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [busy, setBusy] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  // Phones get a text sheet instead of typing on the canvas, where the keyboard fights the zoomed viewport.
  const [touch, setTouch] = useState(false);
  useEffect(() => { setTouch(window.matchMedia("(pointer: coarse)").matches); }, []);
  const loaded = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ nodes, edges, title });
  const callbacks = useRef({ onError, onChanged });
  const dirty = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  latest.current = { nodes, edges, title };
  callbacks.current = { onError, onChanged };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await parseResponse<{ board: BoardMeta; content: { nodes: BoardNode[]; edges: Edge[] } }>(await fetch(endpoint(boardId), { cache: "no-store" }));
        if (cancelled) return;
        setMeta(data.board);
        setTitle(data.board.title);
        setNodes(data.content.nodes);
        setEdges(data.content.edges);
        window.setTimeout(() => { loaded.current = true; void flow.fitView({ padding: 0.3, maxZoom: 1 }); }, 50);
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : "Could not open the board.");
        onBack();
      }
    })();
    return () => { cancelled = true; };
  }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const signature = useMemo(() => JSON.stringify([persist(nodes), persistEdges(edges), title]), [nodes, edges, title]);
  const lastSaved = useRef<string | null>(null);
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

  const center = () => {
    const box = document.querySelector(".board__canvas")?.getBoundingClientRect();
    return flow.screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 600) / 2, y: (box?.top ?? 0) + (box?.height ?? 400) / 2 });
  };
  const spread = (index: number) => ({ x: (index % 4) * 24, y: (index % 4) * 24 });
  const deselect = (list: BoardNode[]) => list.map((node) => ({ ...node, selected: false }));

  const addText = () => {
    const at = center();
    const id = crypto.randomUUID();
    setNodes((current) => [...deselect(current), { id, type: "text", position: { x: at.x - 110 + spread(current.length).x, y: at.y - 60 + spread(current.length).y }, width: 220, height: 130, data: { text: "", tone: "paper" }, selected: true }]);
    if (touch) setEditId(id);
  };

  const addImages = (items: { name: string; width: number; height: number }[]) => {
    const at = center();
    setNodes((current) => [...deselect(current), ...items.map((item, index) => {
      const width = Math.min(360, item.width);
      return { id: crypto.randomUUID(), type: "image" as const, position: { x: at.x - width / 2 + index * 28, y: at.y - 120 + index * 28 }, width, height: Math.round(width * item.height / item.width), data: { name: item.name, ratio: item.height / item.width } };
    })]);
  };

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: { name: string; width: number; height: number }[] = [];
      for (const item of [...files].slice(0, 8)) {
        const { blob, width, height } = await shrink(item);
        const result = await parseResponse<{ name: string }>(await fetch(`${endpoint(boardId)}/assets`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob }));
        added.push({ name: result.name, width, height });
      }
      addImages(added);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not add the image.");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  const update = useCallback((id: string, data: Partial<TextData>) => setNodes((current) => current.map((node) => node.id === id && node.type === "text" ? { ...node, data: { ...node.data, ...data } } : node)), [setNodes]);
  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge(connection, current)), [setEdges]);
  const selectedCount = nodes.filter((node) => node.selected).length + edges.filter((edge) => edge.selected).length;
  const removeSelected = () => {
    setNodes((current) => current.filter((node) => !node.selected));
    setEdges((current) => current.filter((edge) => !edge.selected && !nodes.some((node) => node.selected && (node.id === edge.source || node.id === edge.target))));
  };

  return <BoardContext.Provider value={{ boardId, touch, update, edit: setEditId }}>
    <div className="board" onFocus={(event) => setEditing(event.target instanceof HTMLTextAreaElement)} onBlur={() => setEditing(false)}>
      <header className="board__bar">
        <button type="button" className="ws-text-button" onClick={onBack}><ChevronLeft size={18} /> Boards</button>
        <input className="board__title" value={title} placeholder="Untitled board" aria-label="Board title" onChange={(event) => setTitle(event.target.value)} />
        <span className="board__state" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : meta ? "Saved" : ""}</span>
      </header>
      <div className="board__canvas">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} colorMode={theme} minZoom={0.1} maxZoom={2.5} zoomOnDoubleClick={false} connectionRadius={32} deleteKeyCode={["Backspace", "Delete"]} proOptions={{ hideAttribution: true }}>
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
          <Controls showInteractive={false} position="top-right" />
          <MiniMap pannable zoomable position="bottom-right" className="board__minimap" />
        </ReactFlow>
        {meta && nodes.length === 0 && <p className="board__empty">An empty board. Add a card, a photo of your notes, or pages from a PDF.</p>}
      </div>
      <div className={`board__tools${editing ? " is-hidden" : ""}`} role="toolbar" aria-label="Add to board">
        <button type="button" onClick={addText}><StickyNote size={18} /> Card</button>
        <button type="button" onClick={() => file.current?.click()} disabled={busy}>{busy ? <Loader2 size={18} className="ws-spin" /> : <ImageIcon size={18} />} Photo</button>
        <button type="button" onClick={() => setPdfOpen(true)}><FileText size={18} /> PDF</button>
        {selectedCount > 0 && <button type="button" className="board__delete" onClick={removeSelected}><Trash2 size={18} /> Delete</button>}
      </div>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(event) => void onFiles(event.target.files)} />
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
      <PdfSheet open={pdfOpen} boardId={boardId} onClose={() => setPdfOpen(false)} onError={onError} onAdd={addImages} />
    </div>
  </BoardContext.Provider>;
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

export function BoardCanvas(props: { boardId: string; onBack: () => void; onError: (message: string) => void; onChanged: () => void }) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
