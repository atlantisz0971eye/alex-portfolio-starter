"use client";

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Project } from "../types/project";
import { getProjectTypeLabel } from "../lib/projectType";
import { cancelTiltAnimation, resetTilt, type TiltElement, updateTilt } from "../lib/tilt";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

type ProjectCardProps = {
  project: Project;
  lang: "en" | "zh";
  isOpen: boolean;
  onToggle: () => void;
  onViewProject: (slug: string) => void;
};

export function ProjectCard({ project, lang, isOpen, onToggle, onViewProject }: ProjectCardProps) {
  const cardRef = useRef<TiltElement | null>(null);
  const hasBg = Boolean(project.bg?.src && project.bg?.disabled !== true);
  const projectType = getProjectTypeLabel(project.slug);
  const statusLabel = lang === "en" ? "Completed" : "已完成";
  const interactionLabel = isOpen
    ? lang === "en" ? "Close details" : "收起详情"
    : lang === "en" ? "Open details" : "打开详情";

  useEffect(() => () => cancelTiltAnimation(cardRef.current), []);

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isTouchDevice || prefersReducedMotion) return;
    updateTilt(event.currentTarget as TiltElement, event.clientX, event.clientY);
  };

  return (
    <div className="w-full flex flex-col items-center">
      <div
        ref={cardRef}
        id={`proj-${project.slug}`}
        className={`portfolio-glass-card project-tilt relative w-full overflow-hidden ${isOpen ? "is-open" : ""}`}
        style={{ ["--scale" as string]: "1.012" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={(event) => resetTilt(event.currentTarget as TiltElement)}
        onMouseDown={(event) => event.currentTarget.style.setProperty("--scale", "1.02")}
        onMouseUp={(event) => event.currentTarget.style.setProperty("--scale", "1.012")}
      >
        {hasBg && (
          <div
            className="portfolio-card__media"
            style={{
              backgroundImage: `url("${project.bg!.src}")`,
              backgroundPosition: project.bg?.position || "center",
              backgroundSize: project.bg?.fit || "cover",
            }}
            aria-hidden
          />
        )}
        <div className="portfolio-card__shade" aria-hidden />
        <div data-glare className="tilt-glare pointer-events-none absolute inset-0" aria-hidden />

        <button
          type="button"
          className="portfolio-card__toggle"
          aria-expanded={isOpen}
          aria-label={`${interactionLabel}: ${project.title}`}
          onClick={onToggle}
        />

        <div className="portfolio-card__content">
          <div className="portfolio-card__heading">
            <h3>{project.title}</h3>
            <span className="badge">{statusLabel}</span>
          </div>
          <p className="portfolio-card__type">{projectType || project.summary}</p>

          <div className="portfolio-card__details" aria-hidden={!isOpen}>
            <div className="portfolio-card__details-inner">
              <p className="portfolio-card__summary">{project.summary}</p>
              <div className="portfolio-card__tags">
                {project.tags.map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
              <button
                type="button"
                className="portfolio-card__view"
                tabIndex={isOpen ? 0 : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  onViewProject(project.slug);
                }}
              >
                {lang === "en" ? "View Project" : "查看项目"}
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="portfolio-card__hint" aria-hidden>
            <span>{interactionLabel}</span>
            <span>{isOpen ? "−" : "+"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectCard;
