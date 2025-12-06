"use client";

import { ProjectCard } from "./ProjectCard";
import type { Theme } from "../types/project";
import type { ThemeVideos } from "../hooks/useThemeVideos";

type ThemeSectionProps = {
  theme: Theme;
  nextTheme: Theme | null;
  lang: "en" | "zh";
  videoState: ThemeVideos;
  prefersReducedMotion: boolean;
  isTouchDevice: boolean;
  updatesOpen: string | null;
  updatesTxt: Record<string, string | null>;
  onToggleUpdates: (slug: string) => void;
  onViewProject: (slug: string) => void;
};

export function ThemeSection({
  theme,
  nextTheme,
  lang,
  videoState,
  prefersReducedMotion,
  isTouchDevice,
  updatesOpen,
  updatesTxt,
  onToggleUpdates,
  onViewProject,
}: ThemeSectionProps) {
  const projects = theme.projects ?? [];
  const isTechnology = theme.id === "tian";
  const isRumination = theme.id === "ren";
  const isConnection = theme.id === "di";

  const showTechnologyVideo = isTechnology && videoState.technology.show;
  const shouldRenderTechnologyVideo = isTechnology;
  const showRuminationVideo = isRumination && videoState.rumination.show;
  const shouldRenderRuminationVideo = isRumination;
  const showConnectionVideo = isConnection && videoState.connection.show;
  const shouldRenderConnectionVideo = isConnection;

  return (
    <section
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
        <div className="section-bg bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700" aria-hidden />
      )}
      {isRumination && (
        <div
          className="section-bg bg-center bg-cover"
          style={{
            backgroundImage: videoState.rumination.ready ? "none" : "url('/Dys_Utopia_bg.png')",
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
          className="section-bg bg-gradient-to-b from-[#1c140b] via-[#0e0b09] to-black opacity-80"
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
        <div className="absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
            {videoState.technology.error}
          </span>
        </div>
      )}
      {isTechnology && !showTechnologyVideo && !videoState.technology.error && (
        <div className="absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-lg border border-white/15">
            {prefersReducedMotion ? "Reduced‑motion: video disabled" : isTouchDevice ? "Touch device: video disabled" : "Video idle"}
          </span>
        </div>
      )}

      {videoState.rumination.error && isRumination && (
        <div className="absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
            {videoState.rumination.error}
          </span>
        </div>
      )}
      {isRumination && !shouldRenderRuminationVideo && !videoState.rumination.error && (
        <div className="absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-lg border border-white/15">
            {prefersReducedMotion ? "Reduced‑motion: video disabled" : isTouchDevice ? "Touch device: video disabled" : "Video idle"}
          </span>
        </div>
      )}
      {videoState.connection.error && isConnection && (
        <div className="absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
            {videoState.connection.error}
          </span>
        </div>
      )}
      {isConnection && !showConnectionVideo && !videoState.connection.error && (
        <div className="absolute top-6 right-6 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-lg border border-white/15">
            {prefersReducedMotion ? "Reduced‑motion: video disabled" : isTouchDevice ? "Touch device: video disabled" : "Video idle"}
          </span>
        </div>
      )}

      <div className="section-content content-grid py-16 md:py-24">
        <div className="section-head mb-8">
          <h1 className="section-title text-4xl md:text-5xl font-semibold tracking-tight">{theme.title}</h1>
          <p className="section-subtitle text-white/85 leading-relaxed">{theme.intro}</p>
        </div>
        <div className="cards-col flex flex-col items-center gap-6">
          {projects.map((p) => (
            <div key={p.slug} className="w-full [&_.card]:px-5 [&_.card]:py-4 md:[&_.card]:px-6 md:[&_.card]:py-5">
              <ProjectCard
                project={p}
                lang={lang}
                isUpdatesOpen={updatesOpen === p.slug}
                onToggleUpdates={(slug) => onToggleUpdates(slug)}
                onViewProject={(slug) => onViewProject(slug)}
                updatesTxt={updatesTxt}
                compact
              />
            </div>
          ))}
        </div>
      </div>
      {nextTheme && (
        <div
          aria-hidden
          className="relative z-10 h-16 md:h-24"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.0), rgba(0,0,0,0.25))" }}
        />
      )}
    </section>
  );
}
