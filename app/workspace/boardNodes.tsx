"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, Handle, NodeResizer, Position, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { useContext, useEffect, useRef, useState } from "react";
import { BLOCK_SIZE, colorOf, DEFAULT_LINK, handleId, portCount, SIDES, type BlockData, type GroupData, type LinkData, type Marker, type Shape, type Side } from "../lib/boardDiagram";
import { BoardContext } from "./boardContext";

const POSITION: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };

/** Connection ports around a node: one in the middle of each side, or three per side for the boxier shapes. */
function Ports({ count }: { count: 1 | 3 }) {
  const stops: (1 | 2 | 3)[] = count === 1 ? [2] : [1, 2, 3];
  return <>
    {SIDES.flatMap((side) => stops.map((index) => <Handle key={`${side}${index}`} id={handleId(side, index)} type="source" position={POSITION[side]} style={side === "t" || side === "b" ? { left: `${index * 25}%` } : { top: `${index * 25}%` }} />))}
  </>;
}

/** The outline of a shape, drawn to the exact pixel size of the node so corners and caps never stretch. */
function ShapeSvg({ shape, width, height }: { shape: Shape; width: number; height: number }) {
  const w = Math.max(40, width);
  const h = Math.max(30, height);
  const a = 0.75;
  // Painted inline from variables the node sets, so a picture exported from the board keeps the colours.
  const paint: React.CSSProperties = { fill: "var(--shape-fill)", stroke: "var(--shape-stroke)", strokeWidth: "var(--shape-sw)", strokeDasharray: "var(--shape-dash)" };
  const rim: React.CSSProperties = { fill: "none", stroke: "var(--shape-stroke)", strokeWidth: "var(--shape-sw)" };
  let drawing: React.ReactNode;
  if (shape === "round") drawing = <rect className="bshape__body" style={paint} x={a} y={a} width={w - 2 * a} height={h - 2 * a} rx={Math.min(18, h / 2)} />;
  else if (shape === "ellipse") drawing = <ellipse className="bshape__body" style={paint} cx={w / 2} cy={h / 2} rx={w / 2 - a} ry={h / 2 - a} />;
  else if (shape === "diamond") drawing = <polygon className="bshape__body" style={paint} points={`${w / 2},${a} ${w - a},${h / 2} ${w / 2},${h - a} ${a},${h / 2}`} />;
  else if (shape === "hex") {
    const inset = Math.min(26, h * 0.34);
    drawing = <polygon className="bshape__body" style={paint} points={`${inset},${a} ${w - inset},${a} ${w - a},${h / 2} ${w - inset},${h - a} ${inset},${h - a} ${a},${h / 2}`} />;
  } else if (shape === "slant") {
    const lean = Math.min(26, h * 0.34);
    drawing = <polygon className="bshape__body" style={paint} points={`${lean},${a} ${w - a},${a} ${w - lean},${h - a} ${a},${h - a}`} />;
  } else if (shape === "cylinder") {
    const rx = (w - 2 * a) / 2;
    const ry = Math.min(11, h / 4);
    drawing = <>
      <path className="bshape__body" style={paint} d={`M ${a} ${ry + a} A ${rx} ${ry} 0 0 1 ${w - a} ${ry + a} L ${w - a} ${h - ry - a} A ${rx} ${ry} 0 0 1 ${a} ${h - ry - a} Z`} />
      <path className="bshape__rim" style={rim} d={`M ${a} ${ry + a} A ${rx} ${ry} 0 0 0 ${w - a} ${ry + a}`} />
    </>;
  } else drawing = <rect className="bshape__body" style={paint} x={a} y={a} width={w - 2 * a} height={h - 2 * a} rx={4} />;
  return <svg className="bshape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">{drawing}</svg>;
}

/** Text that turns into an input on double-click, so a block can be named without leaving the diagram. */
function Title({ id, value, field, placeholder, className }: { id: string; value: string; field: "text"; placeholder: string; className: string }) {
  const { patch } = useContext(BoardContext);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);
  if (editing) {
    return <input ref={input} className={`${className} bnode__title-input nodrag nopan nowheel`} defaultValue={value} autoFocus
      onBlur={(event) => { patch(id, { [field]: event.target.value }); setEditing(false); }}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.currentTarget.value = value; event.currentTarget.blur(); } event.stopPropagation(); }} />;
  }
  return <div className={className} onDoubleClick={() => setEditing(true)}>{value || <span className="bnode__placeholder">{placeholder}</span>}</div>;
}

export type BlockNodeType = Node<BlockData, "block">;
export type GroupNodeType = Node<GroupData, "group">;

export function BlockNode({ id, data, selected, width, height }: NodeProps<BlockNodeType>) {
  const w = width ?? BLOCK_SIZE.width;
  const h = height ?? BLOCK_SIZE.height;
  const roomy = data.shape === "diamond" ? "bnode--tight" : data.shape === "ellipse" || data.shape === "hex" || data.shape === "slant" || data.shape === "round" ? "bnode--snug" : "";
  return <div className={`bnode bnode--block bnode--${data.tone}${data.dashed ? " is-dashed" : ""}${selected ? " is-selected" : ""} ${roomy}`}>
    <NodeResizer isVisible={selected} minWidth={96} minHeight={48} />
    <ShapeSvg shape={data.shape} width={w} height={h} />
    <Ports count={portCount(data.shape)} />
    <div className="bblock">
      {data.kicker?.trim() && <div className="bblock__kicker">«{data.kicker.trim()}»</div>}
      <Title id={id} value={data.text} field="text" placeholder="Name" className="bblock__title" />
      {data.body?.trim() && data.shape !== "diamond" && <div className="bblock__body">{data.body}</div>}
    </div>
  </div>;
}

export function GroupNode({ id, data, selected }: NodeProps<GroupNodeType>) {
  return <div className={`bnode bnode--group bnode--${data.tone}${data.dashed === false ? "" : " is-dashed"}${selected ? " is-selected" : ""}`}>
    <NodeResizer isVisible={selected} minWidth={160} minHeight={110} />
    <Ports count={1} />
    <Title id={id} value={data.text} field="text" placeholder="Subsystem" className="bgroup__title" />
  </div>;
}

// ---- connectors ---------------------------------------------------------------------------------------------

const DASH: Record<LinkData["line"], string | undefined> = { solid: undefined, dashed: "8 5", dotted: "2 5" };

/** A marker drawn in the connector's own colour, with its tip on the end of the line. */
function MarkerDef({ id, kind, color }: { id: string; kind: Marker; color: string }) {
  if (kind === "none") return null;
  let drawing: React.ReactNode;
  let ref = 11;
  if (kind === "arrow") drawing = <path d="M1,1 L11,6 L1,11 z" fill={color} stroke={color} strokeLinejoin="round" />;
  else if (kind === "open") drawing = <path d="M1,1 L11,6 L1,11" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />;
  else if (kind === "diamondFill") { ref = 12; drawing = <path d="M0.5,6 L6.5,1 L12,6 L6.5,11 z" fill={color} stroke={color} strokeLinejoin="round" />; }
  else if (kind === "diamond") { ref = 12; drawing = <path d="M0.5,6 L6.5,1 L12,6 L6.5,11 z" fill="var(--bg)" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />; }
  else if (kind === "dot") { ref = 10; drawing = <circle cx="6" cy="6" r="3.6" fill={color} />; }
  else drawing = <path d="M10,0.5 L10,11.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />;
  return <marker id={id} viewBox="0 0 12 12" refX={ref} refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">{drawing}</marker>;
}

export type LinkEdgeType = Edge<LinkData, "link">;

export function LinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<LinkEdgeType>) {
  const link = { ...DEFAULT_LINK, ...data };
  const geometry = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] = link.route === "straight" ? getStraightPath(geometry) : link.route === "curve" ? getBezierPath(geometry) : getSmoothStepPath({ ...geometry, borderRadius: 6, offset: 24 });
  const color = selected ? "var(--accent)" : colorOf(link.color);
  const start = `bm-${id}-s`;
  const end = `bm-${id}-e`;
  return <>
    <defs><MarkerDef id={start} kind={link.start} color={color} /><MarkerDef id={end} kind={link.end} color={color} /></defs>
    <BaseEdge id={id} path={path} interactionWidth={22}
      markerStart={link.start === "none" ? undefined : `url(#${start})`} markerEnd={link.end === "none" ? undefined : `url(#${end})`}
      style={{ stroke: color, strokeWidth: link.width * 1.4, strokeDasharray: DASH[link.line] }} />
    {link.label?.trim() && <EdgeLabelRenderer>
      <div className={`blabel nodrag nopan${selected ? " is-selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{link.label}</div>
    </EdgeLabelRenderer>}
  </>;
}
