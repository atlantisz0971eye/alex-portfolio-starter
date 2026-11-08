"use client";

import { useEffect, useId, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  WORKBENCH_AS_OF,
  WORKBENCH_CONTENT,
  WORKBENCH_PROJECTS,
  projectViews,
  type WorkbenchDiagram,
  type WorkbenchGroup,
  type WorkbenchNode,
  type WorkbenchNodeKind,
  type WorkbenchProject,
} from "../data/workbench";
import type { Language } from "../types/project";

const CELL_W = 156;
const CELL_H = 68;
const NODE_W = 128;
const NODE_H = 40;
const PAD = 10;

// Every plate shares one frame, so all diagrams are drawn at the same scale; narrower ones sit centred in it.
const spanW = (cols: number) => cols * CELL_W + NODE_W;
const spanH = (rows: number) => rows * CELL_H + NODE_H;
const ALL_NODES = WORKBENCH_PROJECTS.flatMap((project) => projectViews(project).flatMap((view) => view.diagram.nodes));
const FRAME_W = PAD * 2 + spanW(Math.max(...ALL_NODES.map((node) => node.col)));
const FRAME_H = PAD * 2 + spanH(Math.max(...ALL_NODES.map((node) => node.row)));

const nodeX = (node: WorkbenchNode) => PAD + node.col * CELL_W;
const nodeY = (node: WorkbenchNode) => PAD + node.row * CELL_H;

/** A gentle curve from the side of one block to the facing side of the other; blocks in one column join top to bottom. */
function edgePath(from: WorkbenchNode, to: WorkbenchNode) {
  const fy = nodeY(from) + NODE_H / 2;
  const ty = nodeY(to) + NODE_H / 2;
  if (from.col === to.col) {
    const x = nodeX(from) + NODE_W / 2;
    const down = to.row > from.row;
    const y1 = down ? nodeY(from) + NODE_H : nodeY(from);
    const y2 = down ? nodeY(to) : nodeY(to) + NODE_H;
    return `M${x},${y1} L${x},${y2}`;
  }
  const forward = to.col > from.col;
  const x1 = forward ? nodeX(from) + NODE_W : nodeX(from);
  const x2 = forward ? nodeX(to) : nodeX(to) + NODE_W;
  const bend = (x2 - x1) / 2;
  return `M${x1},${fy} C${x1 + bend},${fy} ${x2 - bend},${ty} ${x2},${ty}`;
}

function NodeShape({ kind }: { kind: WorkbenchNodeKind }) {
  if (kind === "store") {
    const r = 5;
    return (
      <>
        <path d={`M0,${r} A${NODE_W / 2},${r} 0 0 0 ${NODE_W},${r} V${NODE_H - r} A${NODE_W / 2},${r} 0 0 1 0,${NODE_H - r} Z`} />
        <path d={`M0,${r} A${NODE_W / 2},${r} 0 0 1 ${NODE_W},${r}`} fill="none" />
      </>
    );
  }
  return <rect width={NODE_W} height={NODE_H} rx={kind === "actor" ? NODE_H / 2 : 3} strokeDasharray={kind === "external" ? "3 3" : undefined} />;
}

/** The architecture drawn as lines etched into the plate. Hovering a block lights it and every line that touches it. */
function Etching({ diagram, title }: { diagram: WorkbenchDiagram; title: string }) {
  const markerId = useId().replace(/:/g, "");
  const [focus, setFocus] = useState<string | null>(null);
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  const cols = Math.max(...diagram.nodes.map((node) => node.col));
  const rows = Math.max(...diagram.nodes.map((node) => node.row));
  const offsetX = (FRAME_W - PAD * 2 - spanW(cols)) / 2;
  const offsetY = (FRAME_H - PAD * 2 - spanH(rows)) / 2;
  const touches = (edge: { from: string; to: string }) => focus !== null && (edge.from === focus || edge.to === focus);
  const linked = new Set(diagram.edges.filter(touches).flatMap((edge) => [edge.from, edge.to]));

  return (
    <svg
      className={`workbench-etching ${focus ? "has-focus" : ""}`}
      viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
      role="img"
      aria-label={`${title}: ${diagram.nodes.map((node) => node.label).join(", ")}`}
      onMouseLeave={() => setFocus(null)}
    >
      <defs>
        <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1,1 L7,4 L1,7" fill="none" stroke="rgba(205,210,220,.6)" strokeWidth="1.2" />
        </marker>
      </defs>
      <g transform={`translate(${offsetX},${offsetY})`}>
      <g className="workbench-etching__edges">
        {diagram.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={edgePath(from, to)}
              className={touches(edge) ? "is-lit" : undefined}
              strokeDasharray={edge.dashed ? "2 3" : undefined}
              markerEnd={`url(#${markerId})`}
            />
          );
        })}
      </g>
      <g className="workbench-etching__nodes">
        {diagram.nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${nodeX(node)},${nodeY(node)})`}
            className={`workbench-node workbench-node--${node.kind} ${focus === node.id ? "is-focus" : linked.has(node.id) ? "is-linked" : ""}`}
            onMouseEnter={() => setFocus(node.id)}
          >
            <NodeShape kind={node.kind} />
            <text x={NODE_W / 2} y={node.sub ? 17 : 24} className="workbench-node__label">{node.label}</text>
            {node.sub && <text x={NODE_W / 2} y={30} className="workbench-node__sub">{node.sub}</text>}
          </g>
        ))}
      </g>
      </g>
    </svg>
  );
}

type RowProps = { project: WorkbenchProject; lang: Language; isOpen: boolean; onToggle: () => void };

/** One line cut into the plate. Closed it is a single row; opened, the architecture and notes slide out beneath it. */
function Row({ project, lang, isOpen, onToggle }: RowProps) {
  const content = WORKBENCH_CONTENT[lang];
  const copy = project.copy[lang];
  const views = projectViews(project);
  const [viewIndex, setViewIndex] = useState(0);
  const view = views[Math.min(viewIndex, views.length - 1)];
  const bodyId = `workbench-body-${project.slug}`;
  const moveLight = (event: ReactMouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--lx", `${((event.clientX - box.left) / box.width) * 100}%`);
  };
  const seeWork = () => {
    if (!project.workSlug) return;
    window.dispatchEvent(new CustomEvent("portfolio:open", { detail: { slug: project.workSlug } }));
    document.getElementById(`proj-${project.workSlug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <article id={`workbench-${project.slug}`} className={`workbench-row ${isOpen ? "is-open" : ""}`} onMouseMove={moveLight}>
      <button type="button" className="workbench-row__bar" aria-expanded={isOpen} aria-controls={bodyId} onClick={onToggle}>
        <span className="workbench-row__index">{project.index}</span>
        <span className="workbench-row__title">{project.title}</span>
        <span className="workbench-row__repo">{project.repo}</span>
        <span className="workbench-row__status">{copy.status}</span>
        <span className="workbench-row__mark" aria-hidden>{isOpen ? "−" : "+"}</span>
        <span className="sr-only">{isOpen ? content.close : content.open}</span>
      </button>

      <div id={bodyId} className="workbench-row__body" aria-hidden={!isOpen}>
        <div className="workbench-row__body-inner">
          {views.length > 1 && (
            <div className="workbench-row__views" role="tablist" aria-label={project.title}>
              {views.map((item, index) => (
                <button
                  key={item.label.en}
                  type="button"
                  role="tab"
                  aria-selected={item === view}
                  tabIndex={isOpen ? 0 : -1}
                  className={item === view ? "is-active" : undefined}
                  onClick={() => setViewIndex(index)}
                >
                  {item.label[lang]}
                </button>
              ))}
            </div>
          )}
          <div className="workbench-row__floor">
            <Etching key={view.label.en} diagram={view.diagram} title={`${project.title} · ${view.label.en}`} />
          </div>
          <p className="workbench-row__summary">{copy.summary}</p>
          <div className="workbench-row__stack">
            {project.stack.map((item) => <span key={item}>{item}</span>)}
          </div>
          <div className="workbench-row__foot">
            {project.workSlug && (
              <button type="button" onClick={seeWork} tabIndex={isOpen ? 0 : -1}>{content.seeWork}</button>
            )}
            {project.href && (
              <a href={project.href} target="_blank" rel="noopener noreferrer" tabIndex={isOpen ? 0 : -1}>
                {project.hrefKind === "watch" ? content.watch : content.visit}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

const LEGEND_KINDS: WorkbenchNodeKind[] = ["actor", "app", "store", "external"];
const GROUPS: WorkbenchGroup[] = ["bench", "studio"];

/** Projects as architecture etched into a plate pressed into the page. Every row starts closed; one opens at a time. */
export function WorkbenchSection({ lang }: { lang: Language }) {
  const content = WORKBENCH_CONTENT[lang];
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    const closeForOtherContent = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind && kind !== "workbench") setOpenSlug(null);
    };
    window.addEventListener("glass:open", closeForOtherContent);
    return () => window.removeEventListener("glass:open", closeForOtherContent);
  }, []);

  const toggle = (slug: string) => {
    const next = openSlug === slug ? null : slug;
    setOpenSlug(next);
    if (next) window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "workbench" } }));
  };

  return (
    <section id="workbench" className="section-wrap workbench-section relative snap-child min-h-[100svh] w-full">
      <div className="theme-noise section-noise" aria-hidden />
      <div className="section-content content-grid py-16 md:py-24">
        <div className="section-head mb-8">
          <p className="gallery-kicker">{content.kicker}</p>
          <h1 className="section-title text-4xl md:text-5xl font-semibold tracking-tight">{content.title}</h1>
          <p className="section-subtitle text-white/85 leading-relaxed">{content.intro}</p>
        </div>

        <div className="cards-col">
          <div className="workbench-cut">
            <div className="workbench-plate">
              {GROUPS.map((group) => (
                <div key={group} className="workbench-group">
                  <h2 className="workbench-group__head">
                    <span>{content.groups[group].title}</span>
                    <small>{content.groups[group].note}</small>
                  </h2>
                  {WORKBENCH_PROJECTS.filter((project) => project.group === group).map((project) => (
                    <Row key={project.slug} project={project} lang={lang} isOpen={openSlug === project.slug} onToggle={() => toggle(project.slug)} />
                  ))}
                </div>
              ))}
              <footer className="workbench-plate__foot">
                <ul className="workbench-legend">
                  {LEGEND_KINDS.map((kind) => (
                    <li key={kind} className={`workbench-legend__item workbench-legend__item--${kind}`}>
                      <i aria-hidden />
                      {content.legend[kind]}
                    </li>
                  ))}
                </ul>
                <span>{content.asOf} {WORKBENCH_AS_OF}</span>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
