"use client";

import { useEffect, useRef, useState } from "react";
import { ProjectCard } from "./ProjectCard";
import type { Theme } from "../types/project";
import type { ThemeVideos } from "../hooks/useThemeVideos";

type ThemeSectionProps = {
  theme: Theme;
  lang: "en" | "zh";
  videoState: ThemeVideos;
  prefersReducedMotion: boolean;
  isTouchDevice: boolean;
  activeProjectSlug: string | null;
  onToggleProject: (slug: string) => void;
  onViewProject: (slug: string) => void;
};

export function ThemeSection({
  theme,
  lang,
  videoState,
  prefersReducedMotion,
  isTouchDevice,
  activeProjectSlug,
  onToggleProject,
  onViewProject,
}: ThemeSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [isSectionVisible, setIsSectionVisible] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const projects = theme.projects ?? [];
  const isTechnology = theme.id === "tian";
  const isRumination = theme.id === "ren";
  const isConnection = theme.id === "di";

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsSectionVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35);
        });
      },
      { threshold: [0, 0.2, 0.35, 0.6, 0.85] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showTechnologyVideo = isTechnology && videoState.technology.show && isSectionVisible;
  const shouldRenderTechnologyVideo = showTechnologyVideo;
  const showRuminationVideo = isRumination && videoState.rumination.show && isSectionVisible;
  const shouldRenderRuminationVideo = showRuminationVideo;
  const showConnectionVideo = isConnection && videoState.connection.show && isSectionVisible;
  const shouldRenderConnectionVideo = showConnectionVideo;

  return (
    <section
      ref={sectionRef}
      id={theme.id}
      className="section-wrap relative overflow-hidden snap-child min-h-[100svh] w-full"
      onMouseMove={(e) => {
        if (isRumination) {
          (e.currentTarget as HTMLElement).classList.add("is-active");
        }
      }}
      onMouseLeave={(e) => {
        if (isRumination) {
          (e.currentTarget as HTMLElement).classList.remove("is-active");
        }
      }}
    >
      {isTechnology && (
        <div
          className="section-bg bg-center bg-cover"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.3), rgba(15,23,42,.58)), url('${videoState.technology.poster}')`,
          }}
          aria-hidden
        />
      )}
      {isRumination && (
        <div
          className="section-bg bg-center bg-cover"
          style={{
            backgroundImage: `url('${videoState.rumination.poster}')`,
          }}
          aria-hidden
        />
      )}
      {isRumination && shouldRenderRuminationVideo && (
        <video
          ref={videoState.rumination.ref}
          className={`theme-video always ${videoState.rumination.ready ? "is-ready" : ""}`}
          autoPlay={showRuminationVideo}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          poster={videoState.rumination.poster}
          onLoadedData={videoState.rumination.onLoaded}
          onError={videoState.rumination.onError}
        >
          <source src={videoState.rumination.path} type="video/mp4" />
        </video>
      )}
      {isConnection && (
        <div
          className="section-bg bg-center bg-cover"
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(28,20,11,.32), rgba(0,0,0,.62)), url('${videoState.connection.poster}')`,
          }}
          aria-hidden
        />
      )}
      {isConnection && shouldRenderConnectionVideo && (
        <video
          ref={videoState.connection.ref}
          className={`theme-video always ${videoState.connection.ready ? "is-ready" : ""}`}
          autoPlay={showConnectionVideo}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          poster={videoState.connection.poster}
          onLoadedData={videoState.connection.onLoaded}
          onError={videoState.connection.onError}
        >
          <source src={videoState.connection.path} type="video/mp4" />
        </video>
      )}

      {isTechnology && shouldRenderTechnologyVideo && (
        <video
          ref={videoState.technology.ref}
          className={`theme-video always ${videoState.technology.ready ? "is-ready" : ""}`}
          autoPlay={showTechnologyVideo}
          muted
          loop
          playsInline
          data-autoplay={showTechnologyVideo ? "1" : "0"}
          preload="metadata"
          aria-hidden
          poster={videoState.technology.poster}
          onLoadedData={videoState.technology.onLoaded}
          onError={videoState.technology.onError}
        >
          <source src={videoState.technology.path} type="video/mp4" />
        </video>
      )}

      <div className="section-scrim" aria-hidden />
      <div className="theme-noise section-noise" aria-hidden />

      {videoState.technology.error && isTechnology && (
        <div className="video-status absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
            {videoState.technology.error}
          </span>
        </div>
      )}
      {isTechnology && !showTechnologyVideo && !videoState.technology.error && (
        <div className="video-status absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-lg border border-white/15">
            {prefersReducedMotion ? "Reduced‑motion: video disabled" : isTouchDevice ? "Touch device: video disabled" : "Video idle"}
          </span>
        </div>
      )}

      {videoState.rumination.error && isRumination && (
        <div className="video-status absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
            {videoState.rumination.error}
          </span>
        </div>
      )}
      {isRumination && !shouldRenderRuminationVideo && !videoState.rumination.error && (
        <div className="video-status absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-lg border border-white/15">
            {prefersReducedMotion ? "Reduced‑motion: video disabled" : isTouchDevice ? "Touch device: video disabled" : "Video idle"}
          </span>
        </div>
      )}
      {videoState.connection.error && isConnection && (
        <div className="video-status absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
            {videoState.connection.error}
          </span>
        </div>
      )}
      {isConnection && !showConnectionVideo && !videoState.connection.error && (
        <div className="video-status absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-lg border border-white/15">
            {prefersReducedMotion ? "Reduced‑motion: video disabled" : isTouchDevice ? "Touch device: video disabled" : "Video idle"}
          </span>
        </div>
      )}

      <div className="section-content content-grid py-16 md:py-24">
        <div
          className={`section-head mb-8 ${introOpen ? "is-open" : ""}`}
          role="button"
          tabIndex={0}
          aria-expanded={introOpen}
          aria-label={`${theme.title}: ${lang === "en" ? "show theme introduction" : "显示主题介绍"}`}
          onClick={() => setIntroOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIntroOpen((current) => !current);
            }
          }}
        >
          <h1 className="section-title text-4xl md:text-5xl font-semibold tracking-tight">{theme.title}</h1>
          <p className="section-subtitle text-white/85 leading-relaxed">{theme.intro}</p>
        </div>
        <div className="cards-col flex flex-col items-center gap-6">
          {projects.map((p) => (
            <div key={p.slug} className="w-full [&_.card]:px-5 [&_.card]:py-4 md:[&_.card]:px-6 md:[&_.card]:py-5">
              <ProjectCard
                project={p}
                lang={lang}
                isOpen={activeProjectSlug === p.slug}
                onToggle={() => onToggleProject(p.slug)}
                onViewProject={(slug) => onViewProject(slug)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
