"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Project } from "../types/project";
import { getProjectTypeLabel } from "../lib/projectType";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

type TiltElement = HTMLDivElement & {
  _raf?: number;
  _nx?: number;
  _ny?: number;
  _rx?: number;
  _ry?: number;
  _leaving?: boolean;
};

type ProjectCardProps = {
  project: Project;
  lang: "en" | "zh";
  isUpdatesOpen: boolean;
  onToggleUpdates: (slug: string) => void;
  onViewProject: (slug: string) => void;
  updatesTxt: Record<string, string | null>;
  compact?: boolean;
};

export function ProjectCard({
  project,
  lang,
  isUpdatesOpen,
  onToggleUpdates,
  onViewProject,
  updatesTxt,
  compact = false,
}: ProjectCardProps) {
  const cardRef = useRef<TiltElement | null>(null);

  useEffect(() => {
    return () => {
      const el = cardRef.current;
      if (el?._raf) {
        cancelAnimationFrame(el._raf);
        el._raf = undefined;
      }
    };
  }, []);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchDevice || prefersReducedMotion) return;
    const el = event.currentTarget as TiltElement;
    const rect = el.getBoundingClientRect();
    el._nx = (event.clientX - rect.left) / rect.width - 0.5;
    el._ny = (event.clientY - rect.top) / rect.height - 0.5;
    el._leaving = false;
    if (!el._raf) {
      el._rx = el._rx ?? 0;
      el._ry = el._ry ?? 0;
      const step = () => {
        const targetX = (-(el._ny ?? 0)) * 12;
        const targetY = (el._nx ?? 0) * 12;
        el._rx! += (targetX - el._rx!) * 0.18;
        el._ry! += (targetY - el._ry!) * 0.18;
        const tz = 14;
        const persp = 800;
        el.style.transform = `perspective(${persp}px) rotateX(${el._rx!.toFixed(2)}deg) rotateY(${el._ry!.toFixed(2)}deg) translateZ(${tz}px) scale(var(--scale, 1.015))`;
        if (el._leaving) {
          const nearZero = Math.abs(el._rx!) + Math.abs(el._ry!) < 0.06;
          if (nearZero) {
            cancelAnimationFrame(el._raf!);
            el._raf = undefined;
            el._rx = 0;
            el._ry = 0;
            el.style.transform = `perspective(${persp}px) translateZ(${tz}px) scale(var(--scale, 1.015))`;
            return;
          }
        }
        el._raf = requestAnimationFrame(step);
      };
      el._raf = requestAnimationFrame(step);
    }
    const glare = el.querySelector("[data-glare]") as HTMLDivElement | null;
    if (glare) glare.style.opacity = "0.22";
    const gx = ((event.clientX - rect.left) / rect.width) * 100;
    const gy = ((event.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--gx", gx.toFixed(2) + "%");
    el.style.setProperty("--gy", gy.toFixed(2) + "%");
  };

  const updatesMarkdown = updatesTxt[project.slug];
  const hasBg = Boolean(project.bg?.src && project.bg?.disabled !== true);
  const bgObjectFit = project.bg?.fit || "cover";
  const bgObjectPosition = project.bg?.position || "center";
  const statusLabel =
    project.status === "completed"
      ? lang === "en"
        ? "Completed"
        : "已完成"
      : project.status === "in-progress"
      ? lang === "en"
        ? "In Progress"
        : "进行中"
      : lang === "en"
      ? "Planning"
      : "规划中";
  const [hovered, setHovered] = useState(false);
  const handleEnter = () => setHovered(true);
  const handleLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    if (typeof document === "undefined" || !el.contains(document.activeElement)) {
      setHovered(false);
    }
    el.style.setProperty("--scale", "1.015");
    el._leaving = true;
    el._nx = 0;
    el._ny = 0;
    const glare = el.querySelector("[data-glare]") as HTMLDivElement | null;
    if (glare) glare.style.opacity = "0";
  };
  const handleBlurCapture: React.FocusEventHandler<HTMLDivElement> = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false);
  };
  const cardClassName =
    "card project-card card-compact tilt-card project-tilt relative overflow-hidden rounded-2xl transition-colors w-full will-change-transform shadow-xl";
  const projectType = getProjectTypeLabel(project.slug);

  return (
    <div className="w-full flex flex-col items-center">
      <div
        ref={cardRef}
        id={`proj-${project.slug}`}
        className={cardClassName}
        style={{ ["--scale" as any]: "1.015" }}
        onMouseDown={(e) => (e.currentTarget as HTMLElement).style.setProperty("--scale", "1.03")}
        onMouseUp={(e) => (e.currentTarget as HTMLElement).style.setProperty("--scale", "1.015")}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onPointerLeave={handleLeave}
        onMouseMove={handleMouseMove}
        onFocusCapture={handleEnter}
        onBlurCapture={handleBlurCapture}
        tabIndex={0}
      >
        {hasBg && (
          <>
            <div
              className={`card-bg absolute inset-0 -z-10 pointer-events-none overflow-hidden rounded-2xl transition duration-300 will-change-transform ${
                hovered ? "opacity-100 blur-0" : "opacity-0 blur-sm"
              }`}
              aria-hidden
            >
              <img
                src={project.bg?.src}
                alt=""
                loading="lazy"
                className="bg-cover pointer-events-none select-none"
                style={{
                  objectFit: bgObjectFit,
                  objectPosition: bgObjectPosition,
                  width: "100%",
                  height: "100%",
                }}
              />
            </div>
            <div
              className={`card-scrim absolute inset-0 -z-[9] pointer-events-none transition-opacity duration-300 ${
                hovered ? "opacity-60" : "opacity-30"
              }`}
              aria-hidden
            />
          </>
        )}
      <div
        data-glare
        className="tilt-glare pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 mix-blend-screen"
        style={{
          background:
            "radial-gradient(240px 240px at var(--gx,50%) var(--gy,50%), rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0) 70%)",
        }}
        aria-hidden
      />
      <div className="project-card__content space-y-3">
        {compact ? (
          <>
            <div className="card-rail">
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="card-title">{project.title}</h3>
                  <span className="badge">{statusLabel}</span>
                </div>
                <p className="card-prose card-summary">{projectType || project.summary}</p>
                <div className="card-tags">
                  {project.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card-actions">
                <button
                  className="btn"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onViewProject(project.slug);
                  }}
                >
                  {lang === "en" ? "View Project" : "查看项目"} <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  className="btn-ghost"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleUpdates(project.slug);
                  }}
                  aria-expanded={isUpdatesOpen}
                >
                  {lang === "en" ? "Updates" : "更新日志"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{project.title}</h3>
              <span className="badge">{statusLabel}</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{projectType || project.summary}</p>
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                className="btn"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onViewProject(project.slug);
                }}
              >
                {lang === "en" ? "View Project" : "查看项目"} <ChevronRight className="w-4 h-4" />
              </button>
              <button
                className="btn-ghost"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleUpdates(project.slug);
                }}
                aria-expanded={isUpdatesOpen}
              >
                {lang === "en" ? "Updates" : "更新日志"}
              </button>
            </div>
          </>
        )}
        {project.updatesTxt && (
          <p className="text-xs text-white/50 mt-1">
            {lang === "en" ? "TXT source:" : "TXT 文件路径："}{" "}
            <code className="opacity-80">{project.updatesTxt}</code>
          </p>
        )}
        {isUpdatesOpen && (
          <div className="mt-3 card bg-white/7">
            <h4 className="text-sm font-semibold mb-2">{lang === "en" ? "Updates" : "更新日志"}</h4>
            {project.updates && project.updates.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {project.updates
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="w-24 text-white/70 shrink-0">{entry.date}</span>
                      <p className="flex-1 text-white/90 leading-relaxed">{entry.text}</p>
                    </li>
                  ))}
              </ul>
            ) : project.updatesTxt ? (
              updatesMarkdown === undefined ? (
                <p className="text-white/70 text-sm">
                  {lang === "en" ? "Loading updates from TXT…" : "正在从 TXT 读取更新…"}
                </p>
              ) : updatesMarkdown ? (
                <article className="prose prose-invert max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:my-2 prose-li:my-1 prose-a:text-white/90 prose-strong:text-white">
                  <ReactMarkdown>{updatesMarkdown}</ReactMarkdown>
                </article>
              ) : (
                <p className="text-white/70 text-sm">{lang === "en" ? "No updates file found." : "未找到更新日志文件。"}</p>
              )
            ) : (
              <p className="text-white/70 text-sm">{lang === "en" ? "No updates yet." : "暂无更新。"}</p>
            )}
          </div>
        )}
      </div>
      <div className="card-shadow-oval" aria-hidden />
    </div>
  </div>
);
}

export default ProjectCard;
