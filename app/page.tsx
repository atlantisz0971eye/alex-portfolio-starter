"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { BioSection } from "./components/BioSection";
import { DevelopmentSection } from "./components/DevelopmentSection";
import { GallerySection } from "./components/GallerySection";
import { HeaderBar } from "./components/HeaderBar";
import { IntroOverlay } from "./components/IntroOverlay";
import { SiteFooter } from "./components/SiteFooter";
import SidebarNav from "./components/SidebarNav";
import { ThemeSection } from "./components/ThemeSection";
import { CONTENT } from "./data/content";
import { useIntroOverlay } from "./hooks/useIntroOverlay";
import { useMediaHub } from "./hooks/useMediaHub";
import { useSearch } from "./hooks/useSearch";
import { useThemeVideos } from "./hooks/useThemeVideos";
import type { Language } from "./types/project";
import { isTouchDevice, prefersReducedMotion } from "./utils/environment";

const MediaOverlay = dynamic(
  () => import("./components/MediaOverlay").then((module) => module.MediaOverlay),
  { ssr: false }
);

export default function Page() {
  const [lang, setLang] = useState<Language>("en");
  const [overviewText, setOverviewText] = useState<Record<string, string | null>>({});
  const [activeProjectSlug, setActiveProjectSlug] = useState<string | null>(null);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const themes = CONTENT[lang].themes;
  const intro = useIntroOverlay();
  const mediaHub = useMediaHub();
  const search = useSearch(lang);

  useEffect(() => {
    const openProject = (event: Event) => {
      const slug = (event as CustomEvent<{ slug?: string }>).detail?.slug;
      if (slug) {
        setActiveProjectSlug(slug);
        window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "portfolio" } }));
      }
    };
    window.addEventListener("portfolio:open", openProject);
    return () => window.removeEventListener("portfolio:open", openProject);
  }, []);

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (!focus) return;
    const kind = focus === "bio-entanglement" ? "bio" : focus.startsWith("project-") ? "project" : focus.startsWith("gallery-") ? "gallery" : null;
    if (!kind) return;
    if (kind === "bio") {
      const timer = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("bio:open", { detail: { tab: "entanglement" } }));
        document.getElementById("bio")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
      return () => window.clearTimeout(timer);
    }
    const slug = focus.slice(kind.length + 1);
    const targetId = kind === "project" ? `proj-${slug}` : `gallery-${slug}`;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      window.dispatchEvent(new CustomEvent(kind === "project" ? "portfolio:open" : "gallery:open", { detail: { slug } }));
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const closeForOtherContent = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind && kind !== "portfolio") setActiveProjectSlug(null);
    };
    window.addEventListener("glass:open", closeForOtherContent);
    return () => window.removeEventListener("glass:open", closeForOtherContent);
  }, []);

  const toggleProject = (slug: string) => {
    const next = activeProjectSlug === slug ? null : slug;
    setActiveProjectSlug(next);
    if (next) window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "portfolio" } }));
  };

  const allowThemeVideo = !prefersReducedMotion && !isTouchDevice;
  const videoState = useThemeVideos({
    allowTechnologyVideo: allowThemeVideo,
    allowRuminationVideo: allowThemeVideo,
    allowConnectionVideo: allowThemeVideo,
    mediaHubOpenSlug: mediaHub.openSlug,
    searchOpen: search.searchOpen,
  });

  const navigateToId = (themeId: string) => {
    document.getElementById(themeId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      search.setSearchOpen(false);
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (search.searchResults.length) {
        setActiveSearchIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + search.searchResults.length) % search.searchResults.length);
      }
      return;
    }
    if (event.key === "Enter" && search.searchResults[activeSearchIndex]) {
      event.preventDefault();
      const result = search.searchResults[activeSearchIndex];
      search.jumpTo(result);
      event.currentTarget.blur();
    }
  };

  return (
    <div className="min-h-screen text-white relative font-satoshi" onClick={() => search.setSearchOpen(false)}>
      <IntroOverlay open={intro.isOpen} onClose={intro.close} onNavigate={navigateToId} />
      <SidebarNav lang={lang} />

      <HeaderBar
        lang={lang}
        onToggleLang={() => setLang((current) => (current === "en" ? "zh" : "en"))}
        searchQuery={search.searchQuery}
        searchOpen={search.searchOpen}
        activeResultIndex={activeSearchIndex}
        results={search.searchResults}
        onQueryChange={(value) => {
          search.setSearchQuery(value);
          search.setSearchOpen(true);
          setActiveSearchIndex(0);
        }}
        onFocus={() => search.setSearchOpen(true)}
        onKeyDown={handleSearchKeyDown}
        onResultClick={search.jumpTo}
      />

      <main className="w-full snap-parent">
        <DevelopmentSection lang={lang} />
        {themes.map((theme) => (
          <ThemeSection
            key={theme.id}
            theme={theme}
            lang={lang}
            videoState={videoState}
            prefersReducedMotion={prefersReducedMotion}
            isTouchDevice={isTouchDevice}
            activeProjectSlug={activeProjectSlug}
            onToggleProject={toggleProject}
            onViewProject={(slug) => {
              mediaHub.open(slug);
              search.setSearchOpen(false);
            }}
          />
        ))}
        <GallerySection lang={lang} />
        <BioSection lang={lang} />
      </main>

      {mediaHub.openSlug && (
        <MediaOverlay
          lang={lang}
          themes={themes}
          hub={mediaHub}
          overviewText={overviewText}
          setOverviewText={setOverviewText}
        />
      )}

      <SiteFooter lang={lang} />
    </div>
  );
}
