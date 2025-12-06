"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { IntroOverlay } from "./components/IntroOverlay";
import { MediaOverlay } from "./components/MediaOverlay";
import SidebarNav from "./components/SidebarNav";
import { ThemeSection } from "./components/ThemeSection";
import { CONTENT } from "./data/content";
import { useMediaHub } from "./hooks/useMediaHub";
import { useSearch } from "./hooks/useSearch";
import { useThemeVideos } from "./hooks/useThemeVideos";
import type { Project } from "./types/project";
import { isTouchDevice, prefersReducedMotion } from "./utils/environment";

const CONTENT_DUMP = JSON.stringify(CONTENT, null, 2);

type TiltElement = HTMLDivElement & {
  _raf?: number;
  _nx?: number;
  _ny?: number;
  _rx?: number;
  _ry?: number;
  _leaving?: boolean;
};

export default function Page() {
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [portraitActive, setPortraitActive] = useState(false);
  const [aboutTab, setAboutTab] = useState<null | "statement" | "timeline" | "press" | "contact">(null);
  const [updatesOpen, setUpdatesOpen] = useState<string | null>(null);
  const [updatesTxt, setUpdatesTxt] = useState<Record<string, string | null>>({});
  const [overviewText, setOverviewText] = useState<Record<string, string | null>>({});
  const [introOpen, setIntroOpen] = useState<boolean>(false);
  const [forceVideo, setForceVideo] = useState(false);

  const portraitRef = useRef<TiltElement | null>(null);
  const mediaHub = useMediaHub();
  const themes = CONTENT[lang]?.themes ?? [];

  const { searchQuery, setSearchQuery, searchOpen, setSearchOpen, searchResults, jumpTo } = useSearch(themes, lang);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setForceVideo(sp.get("video") === "1");
    } catch {}
  }, []);

  const allowTechnologyVideo = (!prefersReducedMotion && !isTouchDevice) || forceVideo;
  const allowRuminationVideo = allowTechnologyVideo;
  const allowConnectionVideo = allowTechnologyVideo;

  const videoState = useThemeVideos({
    allowTechnologyVideo,
    allowRuminationVideo,
    allowConnectionVideo,
    mediaHubOpenSlug: mediaHub.openSlug,
    searchOpen,
  });

  useEffect(() => {
    return () => {
      const el = portraitRef.current;
      if (el?._raf) {
        cancelAnimationFrame(el._raf);
        el._raf = undefined;
      }
    };
  }, []);

  useEffect(() => {
    const jumpOnFirstVisit = () => {
      try {
        const seen = localStorage.getItem("introSeen");
        if (!seen) setIntroOpen(true);
      } catch {}
    };
    jumpOnFirstVisit();
  }, []);

  const closeIntro = () => {
    try {
      localStorage.setItem("introSeen", "1");
    } catch {}
    setIntroOpen(false);
  };

  useEffect(() => {
    if (!introOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeIntro();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [introOpen]);

  useEffect(() => {
    if (!updatesOpen) return;
    let found: Project | undefined;
    for (const th of themes) {
      const projectList = th.projects ?? [];
      const hit = projectList.find((p) => p.slug === updatesOpen);
      if (hit) {
        found = hit;
        break;
      }
    }
    if (!found || !found.updatesTxt) return;
    const existing = updatesTxt[updatesOpen];
    if (existing !== undefined) return;
    let cancelled = false;
    fetch(found.updatesTxt)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.text();
      })
      .then((txt) => {
        if (cancelled) return;
        setUpdatesTxt((prev) => ({ ...prev, [updatesOpen]: txt }));
      })
      .catch(() => {
        if (cancelled) return;
        setUpdatesTxt((prev) => ({ ...prev, [updatesOpen]: "" }));
      });
    return () => {
      cancelled = true;
    };
  }, [updatesOpen, themes, updatesTxt]);

  const navigateToId = (themeId: string) => {
    const sec = document.getElementById(themeId);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setSearchOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key === "Enter" && searchResults[0]) {
      const top = searchResults[0];
      jumpTo(top.themeId, top.slug);
    }
  };

  return (
    <div className="min-h-screen text-white relative font-satoshi" onClick={() => setSearchOpen(false)}>
      <IntroOverlay open={introOpen} onClose={closeIntro} onNavigate={navigateToId} />
      <SidebarNav lang={lang} />

      <HeaderBar
        lang={lang}
        onToggleLang={() => setLang(lang === "en" ? "zh" : "en")}
        searchQuery={searchQuery}
        searchOpen={searchOpen}
        results={searchResults}
        onQueryChange={(value) => {
          setSearchQuery(value);
          setSearchOpen(true);
        }}
        onFocus={() => setSearchOpen(true)}
        onKeyDown={handleKeyDown}
        onResultClick={(result) => jumpTo(result.themeId, result.slug)}
        contentDump={CONTENT_DUMP}
      />

      <main className="w-full snap-parent">
        {themes.map((t, idx) => (
          <ThemeSection
            key={t.id}
            theme={t}
            nextTheme={themes[idx + 1] ?? null}
            lang={lang}
            videoState={videoState}
            prefersReducedMotion={prefersReducedMotion}
            isTouchDevice={isTouchDevice}
            updatesOpen={updatesOpen}
            updatesTxt={updatesTxt}
            onToggleUpdates={(slug) => setUpdatesOpen((prev) => (prev === slug ? null : slug))}
            onViewProject={(slug) => {
              mediaHub.open(slug);
              setSearchOpen(false);
            }}
          />
        ))}

        {/* === Bio Section === */}
        <section id="bio" className="relative border-t border-white/10 bg-transparent">
          <div className="w-full max-w-screen-xl mx-auto min-h-[100svh] py-16 md:py-24 flex items-center justify-center">
            <div className="mx-auto w-full max-w-[960px] text-center">
              <div
                ref={portraitRef}
                className="card relative overflow-hidden rounded-2xl p-6 md:p-8 bg-white/5 border border-white/10 tilt-card project-tilt"
                onMouseDown={(e) => {
                  (e.currentTarget as HTMLElement).style.setProperty("--scale", "1.03");
                }}
                onMouseUp={(e) => {
                  (e.currentTarget as HTMLElement).style.setProperty("--scale", "1.015");
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as TiltElement;
                  el.style.setProperty("--scale", "1.015");
                  el._leaving = true;
                  el._nx = 0;
                  el._ny = 0;
                  const glare = el.querySelector("[data-glare]") as HTMLDivElement | null;
                  if (glare) glare.style.opacity = "0";
                  setPortraitActive(false);
                }}
                onMouseEnter={() => {
                  if (!isTouchDevice) setPortraitActive(true);
                }}
                onMouseMove={(e) => {
                  if (isTouchDevice || prefersReducedMotion) return;
                  const el = e.currentTarget as TiltElement;
                  const r = el.getBoundingClientRect();
                  el._nx = (e.clientX - r.left) / r.width - 0.5;
                  el._ny = (e.clientY - r.top) / r.height - 0.5;
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
                  const gx = ((e.clientX - r.left) / r.width) * 100;
                  const gy = ((e.clientY - r.top) / r.height) * 100;
                  el.style.setProperty("--gx", gx.toFixed(2) + "%");
                  el.style.setProperty("--gy", gy.toFixed(2) + "%");
                  const glare = el.querySelector("[data-glare]") as HTMLDivElement | null;
                  if (glare) glare.style.opacity = "0.22";
                }}
                onClick={() => {
                  if (isTouchDevice) setPortraitActive((v) => !v);
                }}
              >
                <div data-glare className="tilt-glare absolute inset-0" aria-hidden />
                <div
                  className={`absolute inset-0 -z-10 bg-center bg-cover transition-all duration-300 ${portraitActive ? "blur-0" : "blur-md"}`}
                  style={{ backgroundImage: "url(/portrait.jpg)", backgroundPosition: "50% 30%" }}
                  aria-hidden
                />
                <div className="absolute inset-0 -z-10 bg-black/25" aria-hidden />
                <div className="relative z-10 p-6 md:p-8">
                  <div className="space-y-4 text-center">
                    <h2 className="text-3xl md:text-4xl font-semibold leading-tight">{lang === "en" ? "Bio — Alex" : "简介 — Alex"}</h2>
                    <div className="text-lg md:text-xl font-medium text-white/90 mt-1 mb-1">
                      {lang === "en" ? "Composer, Photographer, Digital Artist" : "编曲人，摄影师，数字艺术家"}
                    </div>
                    <p className="text-white/90 leading-relaxed">
                      {lang === "en"
                        ? ""
                        : "我的创作围绕 科技 / 反刍 / 连接 展开：技术统治与感知、反刍思维与自我坠落，以及滋养其发生的文化土壤。"}
                    </p>
                  </div>

                  <div className="mt-6 md:mt-8 flex flex-wrap justify-center gap-3">
                    <button
                      className="btn-ghost"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setAboutTab(aboutTab === "statement" ? null : "statement")}
                    >
                      {lang === "en" ? "Artist Statement" : "艺术家陈述"}
                    </button>
                    <button
                      className="btn-ghost"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setAboutTab(aboutTab === "timeline" ? null : "timeline")}
                    >
                      {lang === "en" ? "Internships" : "实习经历"}
                    </button>
                    <button
                      className="btn-ghost"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setAboutTab(aboutTab === "contact" ? null : "contact")}
                    >
                      {lang === "en" ? "Contact" : "联系"}
                    </button>
                  </div>

                  {aboutTab && (
                    <div className="mt-5">
                      {aboutTab === "statement" && (
                        <div className="card bg-white/7">
                          <h3 className="text-xl font-semibold mb-3">{lang === "en" ? "Artist Statement" : "艺术家陈述"}</h3>
                          <p className="text-white/90 leading-relaxed">
                            {lang === "en"
                              ? "Between fitting reality and electromagnetic decay, I look at how technological ontology rewrites body and perception; in Dys/Utopia, the viewer is pulled into a chain reaction between multiplicity of thoughts and nihilistic retreat; “Connection” is the premise and trigger of them all."
                              : "在拟合现实与电磁腐烂之间，我关注技术存在论如何改写身体与感知；在 Dys/Utopia 的观看机制里，观者被卷入多线思绪与虚无退隐的链式反应；而“连接”作为成长文化土壤，是一切发生的前提与引线。"}
                          </p>
                        </div>
                      )}
                      {aboutTab === "timeline" && (
                        <div className="card">
                          <h3 className="text-xl font-semibold mb-4">{lang === "en" ? "Internships" : "实习经历"}</h3>
                          <ul className="space-y-4">
                            {[{
                              year: "",
                              title: lang === "en"
                                ? "Graphic Designer — Bund Dinosaur Exhibition (Shanghai)"
                                : "上海外滩恐龙展 平面设计师",
                              meta: lang === "en" ? "Internship" : "实习"
                            }, {
                              year: "",
                              title: lang === "en"
                                ? "Data Collector — Mr.Panda inbound AI localization guide (Huawei AI Joint Lab × Zhongying Niannian, Beijing)"
                                : "北京中影年年责任有限公司 · 华为AI联合实验室 · Mr.Panda 外国人来华AI平台智能本土化导引平台 数据收集师",
                              meta: lang === "en" ? "Internship" : "实习"
                            }].map((e, i) => (
                              <li key={i} className="flex items-start gap-4">
                                <span className="text-white/70 w-16">{e.year}</span>
                                <div className="card flex-1">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium">{e.title}</p>
                                    <span className="badge">{e.meta}</span>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aboutTab === "contact" && (
                        <div className="card">
                          <h3 className="text-xl font-semibold mb-3">{lang === "en" ? "Contact" : "联系"}</h3>
                          <ul className="space-y-2 text-white/90">
                            <li>
                              <span className="opacity-80 mr-2">{lang === "en" ? "Email:" : "邮箱："}</span>
                              <a href="mailto:Atlantisz0971@gmail.com" className="underline hover:opacity-80">Atlantisz0971@gmail.com</a>
                            </li>
                            <li>
                              <span className="opacity-80 mr-2">Instagram:</span>
                              <a href="https://www.instagram.com/alex_zhao0971" target="_blank" rel="noreferrer" className="underline hover:opacity-80">instagram.com/alex_zhao0971</a>
                            </li>
                            <li>
                              <span className="opacity-80 mr-2">YouTube:</span>
                              <a href="https://www.youtube.com/@AlexZhao-t7k/videos" target="_blank" rel="noreferrer" className="underline hover:opacity-80">youtube.com/@AlexZhao-t7k</a>
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
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

      <footer className="py-8 border-t border-white/10 bg-black">
        <div className="container mx-auto max-w-screen-xl px-6 text-sm text-white/80 flex flex-col items-center justify-center gap-2 text-center">
          <div>© {new Date().getFullYear()} Alex — {lang === "en" ? "Portfolio" : "作品集"}</div>
          <div className="opacity-80">
            {lang === "en"
              ? "Architecture: Technology · Rumination · Connection ｜ Tech Stack: Next.js + Tailwind"
              : "架构：科技·反刍·连接 ｜ 技术栈：Next.js + Tailwind"}
          </div>
        </div>
      </footer>
    </div>
  );
}
