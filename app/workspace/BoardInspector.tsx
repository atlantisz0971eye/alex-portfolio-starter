"use client";

import type { Edge, Node } from "@xyflow/react";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, ArrowLeftRight, Copy, Group, Trash2, Ungroup, X } from "lucide-react";
import { colorOf, EDGE_COLORS, MARKERS, SHAPES, TONES, type Align, type LinkData, type Marker, type Route, type Shape, DEFAULT_LINK } from "../lib/boardDiagram";

type Props = {
  nodes: Node[];
  /** A block or container was just added: put the cursor in its name. */
  focusName?: boolean;
  edges: Edge[];
  onNode: (id: string, patch: Record<string, unknown>) => void;
  onSize: (id: string, size: { width?: number; height?: number }) => void;
  onEdge: (id: string, patch: Partial<LinkData>) => void;
  onReverse: (id: string) => void;
  onAlign: (how: Align) => void;
  onDistribute: (axis: "x" | "y") => void;
  onMatch: (dimension: "width" | "height") => void;
  onGroup: () => void;
  onUngroup: (id: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
};

type Choice<T extends string> = { id: T; label: string };

function Segment<T extends string>({ value, options, onPick, label }: { value: T; options: Choice<T>[]; onPick: (value: T) => void; label: string }) {
  return <div className="binsp__seg" role="radiogroup" aria-label={label}>
    {options.map((option) => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={value === option.id ? "is-on" : ""} onClick={() => onPick(option.id)}>{option.label}</button>)}
  </div>;
}

function Tones({ value, onPick }: { value: string; onPick: (tone: string) => void }) {
  return <div className="binsp__tones">{TONES.map((tone) => <button key={tone} type="button" aria-label={`${tone} fill`} className={`bnode__tone bnode--${tone}${tone === value ? " is-on" : ""}`} onClick={() => onPick(tone)} />)}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="binsp__field"><span>{label}</span>{children}</label>;
}

function Size({ node, onSize }: { node: Node; onSize: Props["onSize"] }) {
  const width = Math.round(node.width ?? node.measured?.width ?? 0);
  const height = Math.round(node.height ?? node.measured?.height ?? 0);
  return <div className="binsp__row">
    <Field label="Width"><input type="number" inputMode="numeric" min={40} step={8} value={width} onChange={(event) => { const next = Number(event.target.value); if (next >= 40) onSize(node.id, { width: next }); }} /></Field>
    <Field label="Height"><input type="number" inputMode="numeric" min={30} step={8} value={height} onChange={(event) => { const next = Number(event.target.value); if (next >= 30) onSize(node.id, { height: next }); }} /></Field>
  </div>;
}

const ROUTES: Choice<Route>[] = [{ id: "step", label: "Right angle" }, { id: "straight", label: "Straight" }, { id: "curve", label: "Curve" }];
const LINES: Choice<LinkData["line"]>[] = [{ id: "solid", label: "Solid" }, { id: "dashed", label: "Dashed" }, { id: "dotted", label: "Dotted" }];
const WIDTHS: Choice<"1" | "2" | "3">[] = [{ id: "1", label: "Thin" }, { id: "2", label: "Medium" }, { id: "3", label: "Thick" }];

export function BoardInspector({ nodes, edges, focusName, onNode, onSize, onEdge, onReverse, onAlign, onDistribute, onMatch, onGroup, onUngroup, onDuplicate, onDelete, onClose }: Props) {
  const header = (title: string) => <header className="binsp__head"><strong>{title}</strong><button type="button" aria-label="Close panel" onClick={onClose}><X size={16} /></button></header>;

  if (nodes.length === 0 && edges.length === 1) {
    const edge = edges[0];
    const link: LinkData = { ...DEFAULT_LINK, ...(edge.data as Partial<LinkData> | undefined) };
    const isLink = edge.type === "link";
    return <aside className="binsp" aria-label="Connector">
      {header("Connector")}
      {!isLink && <p className="binsp__note">This is a plain arrow. Draw a new connector from a block&rsquo;s port to use labels, line styles and markers.</p>}
      {isLink && <>
        <Field label="Label"><input value={link.label ?? ""} placeholder="e.g. 28 V power, CAN, request" onChange={(event) => onEdge(edge.id, { label: event.target.value })} /></Field>
        <Field label="Routing"><Segment label="Routing" value={link.route} options={ROUTES} onPick={(route) => onEdge(edge.id, { route })} /></Field>
        <Field label="Line"><Segment label="Line" value={link.line} options={LINES} onPick={(line) => onEdge(edge.id, { line })} /></Field>
        <Field label="Weight"><Segment label="Weight" value={String(link.width) as "1" | "2" | "3"} options={WIDTHS} onPick={(value) => onEdge(edge.id, { width: Number(value) as 1 | 2 | 3 })} /></Field>
        <div className="binsp__row">
          <Field label="Start"><select value={link.start} onChange={(event) => onEdge(edge.id, { start: event.target.value as Marker })}>{MARKERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
          <Field label="End"><select value={link.end} onChange={(event) => onEdge(edge.id, { end: event.target.value as Marker })}>{MARKERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        </div>
        <Field label="Kind"><div className="binsp__colors">{EDGE_COLORS.map((item) => <button key={item.id} type="button" title={item.label} aria-label={item.label} className={link.color === item.id ? "is-on" : ""} style={{ background: colorOf(item.id) }} onClick={() => onEdge(edge.id, { color: item.id })} />)}</div></Field>
      </>}
      <div className="binsp__actions">
        {isLink && <button type="button" onClick={() => onReverse(edge.id)}><ArrowLeftRight size={15} /> Reverse</button>}
        <button type="button" className="is-danger" onClick={onDelete}><Trash2 size={15} /> Delete</button>
      </div>
    </aside>;
  }

  if (nodes.length === 1 && edges.length === 0) {
    const node = nodes[0];
    const data = node.data as Record<string, unknown>;
    const text = typeof data.text === "string" ? data.text : "";
    if (node.type === "block") {
      return <aside className="binsp" aria-label="Block">
        {header("Block")}
        <Field label="Stereotype"><input value={String(data.kicker ?? "")} placeholder="e.g. subsystem, ECU, software" onChange={(event) => onNode(node.id, { kicker: event.target.value })} /></Field>
        <Field label="Name"><input autoFocus={focusName} value={text} placeholder="Name" onChange={(event) => onNode(node.id, { text: event.target.value })} /></Field>
        <Field label="Details"><textarea rows={4} value={String(data.body ?? "")} placeholder={"Properties, interfaces or notes, one per line"} onChange={(event) => onNode(node.id, { body: event.target.value })} /></Field>
        <Field label="Shape"><Segment label="Shape" value={data.shape as Shape} options={SHAPES.map((item) => ({ id: item.id, label: item.label }))} onPick={(shape) => onNode(node.id, { shape })} /></Field>
        <Field label="Fill"><Tones value={String(data.tone ?? "paper")} onPick={(tone) => onNode(node.id, { tone })} /></Field>
        <Field label="Border"><Segment label="Border" value={data.dashed ? "dashed" : "solid"} options={[{ id: "solid", label: "Solid" }, { id: "dashed", label: "Dashed" }]} onPick={(value) => onNode(node.id, { dashed: value === "dashed" })} /></Field>
        <Size node={node} onSize={onSize} />
        <div className="binsp__actions">
          <button type="button" onClick={onDuplicate}><Copy size={15} /> Duplicate</button>
          <button type="button" className="is-danger" onClick={onDelete}><Trash2 size={15} /> Delete</button>
        </div>
      </aside>;
    }
    if (node.type === "group") {
      return <aside className="binsp" aria-label="Container">
        {header("Container")}
        <Field label="Label"><input autoFocus={focusName} value={text} placeholder="Subsystem" onChange={(event) => onNode(node.id, { text })} /></Field>
        <Field label="Fill"><Tones value={String(data.tone ?? "paper")} onPick={(tone) => onNode(node.id, { tone })} /></Field>
        <Field label="Border"><Segment label="Border" value={data.dashed === false ? "solid" : "dashed"} options={[{ id: "dashed", label: "Dashed" }, { id: "solid", label: "Solid" }]} onPick={(value) => onNode(node.id, { dashed: value === "dashed" })} /></Field>
        <Size node={node} onSize={onSize} />
        <div className="binsp__actions">
          <button type="button" onClick={() => onUngroup(node.id)}><Ungroup size={15} /> Ungroup</button>
          <button type="button" onClick={onDuplicate}><Copy size={15} /> Duplicate</button>
          <button type="button" className="is-danger" onClick={onDelete}><Trash2 size={15} /> Delete</button>
        </div>
      </aside>;
    }
    return null;
  }

  if (nodes.length >= 2) {
    return <aside className="binsp" aria-label="Arrange">
      {header(`${nodes.length} selected`)}
      <p className="binsp__label">Align</p>
      <div className="binsp__icons">
        <button type="button" aria-label="Align left" title="Align left" onClick={() => onAlign("left")}><AlignStartVertical size={17} /></button>
        <button type="button" aria-label="Align centre" title="Align centre" onClick={() => onAlign("center")}><AlignCenterVertical size={17} /></button>
        <button type="button" aria-label="Align right" title="Align right" onClick={() => onAlign("right")}><AlignEndVertical size={17} /></button>
        <button type="button" aria-label="Align top" title="Align top" onClick={() => onAlign("top")}><AlignStartHorizontal size={17} /></button>
        <button type="button" aria-label="Align middle" title="Align middle" onClick={() => onAlign("middle")}><AlignCenterHorizontal size={17} /></button>
        <button type="button" aria-label="Align bottom" title="Align bottom" onClick={() => onAlign("bottom")}><AlignEndHorizontal size={17} /></button>
      </div>
      <p className="binsp__label">Distribute and match</p>
      <div className="binsp__icons">
        <button type="button" aria-label="Distribute horizontally" title="Distribute horizontally" disabled={nodes.length < 3} onClick={() => onDistribute("x")}><AlignHorizontalSpaceBetween size={17} /></button>
        <button type="button" aria-label="Distribute vertically" title="Distribute vertically" disabled={nodes.length < 3} onClick={() => onDistribute("y")}><AlignVerticalSpaceBetween size={17} /></button>
        <button type="button" title="Same width" onClick={() => onMatch("width")}>W =</button>
        <button type="button" title="Same height" onClick={() => onMatch("height")}>H =</button>
      </div>
      <div className="binsp__actions">
        <button type="button" onClick={onGroup}><Group size={15} /> Group</button>
        <button type="button" onClick={onDuplicate}><Copy size={15} /> Duplicate</button>
        <button type="button" className="is-danger" onClick={onDelete}><Trash2 size={15} /> Delete</button>
      </div>
    </aside>;
  }
  return null;
}
