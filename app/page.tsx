"use client";

import { useEffect, useRef, useState } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { MediaOverlay } from "./components/MediaOverlay";
import { ProjectCard } from "./components/ProjectCard";
import SidebarNav from "./components/SidebarNav";
import { CONTENT } from "./data/content";
import { useMediaHub } from "./hooks/useMediaHub";
import type { Project, SearchResult } from "./types/project";
import { isTouchDevice, prefersReducedMotion } from "./utils/environment";

/**
 * 极简依赖：不用 shadcn/ui，不用 Radix。
 * 直接用 Tailwind + 少量自定义 class，保证你「解压 -> npm i -> npm run dev」就能跑。
 */

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
  const [technologyVideoReady, setTechnologyVideoReady] = useState(false);
  const [technologyVideoError, setTechnologyVideoError] = useState<string | null>(null);
  const [ruminationVideoReady, setRuminationVideoReady] = useState(false);
  const [ruminationVideoError, setRuminationVideoError] = useState<string | null>(null);
  const ruminationVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaHub = useMediaHub();
  const portraitRef = useRef<TiltElement | null>(null);
  const technologyVideoRef = useRef<HTMLVideoElement | null>(null);

  // === Search state ===
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const themes = CONTENT[lang]?.themes ?? [];
  // Allow ?video=1 override via URL, otherwise respect reduced motion and touch
  const [forceVideo, setForceVideo] = useState(false);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setForceVideo(sp.get('video') === '1');
    } catch {}
  }, []);
  const allowTechnologyVideo = (!prefersReducedMotion && !isTouchDevice) || forceVideo;
  const allowRuminationVideo = allowTechnologyVideo; // same gating rules; ?video=1 overrides
  const techVideoPath = "/AfterEffect_intro.mp4";
  const rumVideoPath = "/Rumantion_close.mp4";

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
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Simple tokenizer
  const tokenize = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

  // Run search with lightweight scoring across current-language content
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) { setSearchResults([]); return; }
    const terms = tokenize(q);
    const results: SearchResult[] = [];

    for (const th of themes) {
      const hayTheme = `${th.title} ${th.intro}`.toLowerCase();
      if (terms.every((t) => hayTheme.includes(t))) {
        results.push({ kind:'theme', title: th.title, subtitle: lang==='en'? 'Theme' : '主题', themeId: th.id, score: 50 });
      }
      const projectList = th.projects ?? [];
      for (const p of projectList) {
        const base = `${p.title} ${p.summary} ${(p.tags||[]).join(' ')}`.toLowerCase();
        let score = 0;
        for (const term of terms) { if (base.includes(term)) score += 10; }
        if (p.updates && p.updates.length) {
          const updJoin = p.updates.map(u=>`${u.date} ${u.text}`).join(' ').toLowerCase();
          for (const term of terms) { if (updJoin.includes(term)) score += 3; }
        }
        if (score > 0) {
          results.push({ kind:'project', title: p.title, subtitle: th.title, slug: p.slug, themeId: th.id, score });
        }
        for (const tg of (p.tags||[])) {
          const low = tg.toLowerCase();
          if (terms.every(t=>low.includes(t))) {
            results.push({ kind:'tag', title: tg, subtitle: `${lang==='en'?'Tag of':''} ${p.title}`.trim(), slug: p.slug, themeId: th.id, score: 5 });
          }
        }
      }
    }
    results.sort((a,b)=> b.score - a.score || (a.kind>b.kind?1:-1));
    setSearchResults(results.slice(0,20));
  }, [debouncedQuery, lang, themes]);

  // Scroll and soft-highlight target
  const jumpTo = (themeId?: string, slug?: string) => {
    if (themeId) {
      const sec = document.getElementById(themeId);
      if (sec) sec.scrollIntoView({ behavior:'smooth', block:'start' });
    }
    if (slug) {
      const id = `proj-${slug}`;
      const el = document.getElementById(id);
      if (el) {
        setTimeout(()=>{
          el.classList.add('search-highlight');
          el.scrollIntoView({ behavior:'smooth', block:'center' });
          setTimeout(()=> el.classList.remove('search-highlight'), 1600);
        }, 300);
      }
    }
    setSearchOpen(false);
  };

  useEffect(() => {
    if (!updatesOpen) return;
    let found: Project | undefined;
    for (const th of themes) {
      const projectList = th.projects ?? [];
      const hit = projectList.find((p) => p.slug === updatesOpen);
      if (hit) { found = hit; break; }
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

  // === Intro overlay (first visit) ===
  const [introOpen, setIntroOpen] = useState<boolean>(false);
  useEffect(() => {
    try {
      const seen = localStorage.getItem('introSeen');
      if (!seen) setIntroOpen(true);
    } catch {}
  }, []);
  const closeIntro = () => {
    try { localStorage.setItem('introSeen', '1'); } catch {}
    setIntroOpen(false);
  };
  // ESC to close when intro is open
  useEffect(() => {
    if (!introOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeIntro(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [introOpen]);

  useEffect(() => {
    const videos: HTMLVideoElement[] = [];
    if (allowTechnologyVideo && technologyVideoRef.current) videos.push(technologyVideoRef.current);
    if (allowRuminationVideo && ruminationVideoRef.current) videos.push(ruminationVideoRef.current);
    if (videos.length === 0) return;

    const timers = new WeakMap<HTMLVideoElement, number>();
    const clearTimer = (el: HTMLVideoElement) => {
      const prev = timers.get(el);
      if (prev) {
        window.clearTimeout(prev);
        timers.delete(el);
      }
    };

    const setState = (el: HTMLVideoElement, playing: boolean) => {
      el.dataset.state = playing ? "playing" : "paused";
    };

    const tryPause = (el: HTMLVideoElement) => {
      el.pause();
      setState(el, false);
    };

    const tryPlay = (el: HTMLVideoElement) => {
      if (document.hidden || Boolean(mediaHub.openSlug) || searchOpen) {
        tryPause(el);
        return;
      }
      el
        .play()
        .then(() => setState(el, true))
        .catch(() => {
          setState(el, false);
        });
    };

    const schedule = (el: HTMLVideoElement, fn: () => void) => {
      clearTimer(el);
      const id = window.setTimeout(() => {
        fn();
        timers.delete(el);
      }, 100);
      timers.set(el, id);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            schedule(el, () => tryPlay(el));
          } else {
            schedule(el, () => tryPause(el));
          }
        });
      },
      { threshold: [0, 0.25, 0.5, 1] }
    );

    videos.forEach((el) => observer.observe(el));

    const recheckVisibility = () => {
      videos.forEach((el) => {
        if (document.hidden || Boolean(mediaHub.openSlug) || searchOpen) {
          tryPause(el);
          return;
        }
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const inView = rect.top < vh * 0.75 && rect.bottom > vh * 0.25;
        if (inView) {
          schedule(el, () => tryPlay(el));
        } else {
          schedule(el, () => tryPause(el));
        }
      });
    };

    document.addEventListener("visibilitychange", recheckVisibility);
    recheckVisibility();

    return () => {
      document.removeEventListener("visibilitychange", recheckVisibility);
      observer.disconnect();
      videos.forEach((el) => {
        clearTimer(el);
        tryPause(el);
      });
    };
  }, [allowTechnologyVideo, allowRuminationVideo, mediaHub.openSlug, searchOpen]);

  return (
    <div className="min-h-screen text-white relative font-satoshi" onClick={()=> setSearchOpen(false)}>
      {/* Intro Overlay (first visit) */}
      {introOpen && (
        <div
          className="intro-backdrop fixed inset-0 z-[400] flex flex-col items-center justify-center text-center space-y-10 p-6"
          onClick={closeIntro}
          role="dialog"
          aria-modal="true"
        >
          {/* Liquid glass animated background */}
          <div
            className="absolute inset-0 -z-10 backdrop-blur-3xl bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.15),transparent_60%),radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.10),transparent_60%),linear-gradient(135deg,rgba(255,255,255,0.05)_0%,rgba(0,0,0,0.8)_100%)] animate-glassflow"
          />
          <h1
            className="text-4xl md:text-6xl font-semibold tracking-wide mb-8 select-none"
            onClick={(e)=>e.stopPropagation()}
          >
            Alex Projects
          </h1>
          <div className="flex flex-col gap-6 text-2xl md:text-3xl font-light text-white/85"
               onClick={(e)=>e.stopPropagation()}>
            <a
              href="#tian"
              onClick={(e)=>{e.preventDefault(); closeIntro(); setTimeout(()=>document.getElementById('tian')?.scrollIntoView({behavior:'smooth'}), 50);}}
              className="hover:text-white transition-all duration-200"
            >
              ☁ Technology
            </a>
            <a
              href="#ren"
              onClick={(e)=>{e.preventDefault(); closeIntro(); setTimeout(()=>document.getElementById('ren')?.scrollIntoView({behavior:'smooth'}), 50);}}
              className="hover:text-white transition-all duration-200"
            >
              👤 Rumination
            </a>
            <a
              href="#di"
              onClick={(e)=>{e.preventDefault(); closeIntro(); setTimeout(()=>document.getElementById('di')?.scrollIntoView({behavior:'smooth'}), 50);}}
              className="hover:text-white transition-all duration-200"
            >
              🌍 Connection
            </a>
         </div>
       </div>
      )}
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
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setSearchOpen(false);
            (e.target as HTMLInputElement).blur();
            return;
          }
          if (e.key === "Enter" && searchResults[0]) {
            const top = searchResults[0];
            jumpTo(top.themeId, top.slug);
          }
        }}
        onResultClick={(result) => jumpTo(result.themeId, result.slug)}
        contentDump={CONTENT_DUMP}
      />

      {/* Main */}
      <main className="w-full snap-parent">
        {themes.map((t, idx) => {
          const next = themes[idx + 1] ?? null;
          const projects = t.projects ?? [];
          const isTechnology = t.id === "tian";
          const isRumination = t.id === "ren";
          const isConnection = t.id === "di";
          const showTechnologyVideo = isTechnology && allowTechnologyVideo;
          const shouldRenderTechnologyVideo = isTechnology; // always mount so poster/fallback stays visible
          const showRuminationVideo = isRumination && allowRuminationVideo;
          const shouldRenderRuminationVideo = isRumination; // always mount so poster/fallback stays visible
          return (
            <section
              id={t.id}
              key={t.id}
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
                  className="section-bg bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700"
                  aria-hidden
                />
              )}
              {isRumination && (
                <div
                  className="section-bg bg-center bg-cover"
                  style={{
                    backgroundImage: ruminationVideoReady ? "none" : "url('/Dys_Utopia_bg.png')",
                  }}
                  aria-hidden
                />
              )}
              {isRumination && shouldRenderRuminationVideo && (
                <video
                  ref={ruminationVideoRef}
                  className={`theme-video always ${ruminationVideoReady ? "is-ready" : ""}`}
                  autoPlay={showRuminationVideo}
                  muted
                  loop
                  playsInline
                  preload="auto"
                  aria-hidden
                  poster="/Dys_Utopia_bg.png"
                  onLoadedData={() => {
                    console.debug("[video] Rumination ready:", rumVideoPath);
                    setRuminationVideoReady(true);
                    setRuminationVideoError(null);
                  }}
                  onError={(e) => {
                    console.error("[video] Rumination error", {
                      src: e.currentTarget.currentSrc,
                      networkState: e.currentTarget.networkState,
                    });
                    setRuminationVideoError("Rumination video failed to load");
                    setRuminationVideoReady(false);
                  }}
                >
                  <source src={rumVideoPath} type="video/mp4" />
                </video>
              )}
              {isConnection && (
                <div
                  className="section-bg bg-gradient-to-b from-[#1c140b] via-[#0e0b09] to-black opacity-80"
                  aria-hidden
                />
              )}

              {isTechnology && shouldRenderTechnologyVideo && (
                <video
                  ref={technologyVideoRef}
                  className={`theme-video always ${technologyVideoReady ? "is-ready" : ""}`}
                  autoPlay={showTechnologyVideo}
                  muted
                  loop
                  playsInline
                  data-autoplay={showTechnologyVideo ? "1" : "0"}
                  preload="auto"
                  aria-hidden
                  poster="/Dys_Utopia_bg.png"
                  onLoadedData={() => {
                    console.debug("[video] Technology ready:", techVideoPath);
                    setTechnologyVideoReady(true);
                    setTechnologyVideoError(null);
                  }}
                  onError={(e) => {
                    console.error("[video] Technology error", {
                      src: e.currentTarget.currentSrc,
                      networkState: e.currentTarget.networkState,
                    });
                    setTechnologyVideoError("Technology video failed to load");
                    setTechnologyVideoReady(false);
                  }}
                >
                  <source src={techVideoPath} type="video/mp4" />
                </video>
              )}

              <div className="section-scrim" aria-hidden />
              <div className="theme-noise section-noise" aria-hidden />

              {technologyVideoError && isTechnology && (
                <div className="absolute top-6 right-6 z-30">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                    {technologyVideoError}
                  </span>
                </div>
              )}
              {isTechnology && !showTechnologyVideo && !technologyVideoError && (
                <div className="absolute top-6 right-6 z-30">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-lg border border-white/15">
                    {prefersReducedMotion ? "Reduced‑motion: video disabled" : isTouchDevice ? "Touch device: video disabled" : "Video idle"}
                  </span>
                </div>
              )}

              {ruminationVideoError && isRumination && (
                <div className="absolute top-6 right-6 z-30">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                    {ruminationVideoError}
                  </span>
                </div>
              )}
              {isRumination && !shouldRenderRuminationVideo && !ruminationVideoError && (
                <div className="absolute top-6 right-6 z-30">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 shadow-lg border border-white/15">
                    {prefersReducedMotion ? 'Reduced‑motion: video disabled' : isTouchDevice ? 'Touch device: video disabled' : 'Video idle'}
                  </span>
                </div>
              )}

              <div className="section-content content-grid py-16 md:py-24">
                <div className="section-head mb-8">
                  <h1 className="section-title text-4xl md:text-5xl font-semibold tracking-tight">
                    {t.title}
                  </h1>
                  <p className="section-subtitle text-white/85 leading-relaxed">
                    {t.intro}
                  </p>
                </div>
                <div className="cards-col flex flex-col items-center gap-6">
                  {projects.map((p) => (
                    <div
                      key={p.slug}
                      className="w-full [&_.card]:px-5 [&_.card]:py-4 md:[&_.card]:px-6 md:[&_.card]:py-5"
                    >
                      <ProjectCard
                        project={p}
                        lang={lang}
                        isUpdatesOpen={updatesOpen === p.slug}
                        onToggleUpdates={(slug) => setUpdatesOpen((prev) => (prev === slug ? null : slug))}
                        onViewProject={(slug) => {
                          mediaHub.open(slug);
                          setSearchOpen(false);
                        }}
                        updatesTxt={updatesTxt}
                        compact
                      />
                    </div>
                  ))}
                </div>
              </div>
              {next && (
                <div
                  aria-hidden
                  className="relative z-10 h-16 md:h-24"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.0), rgba(0,0,0,0.25))" }}
                />
              )}
            </section>
          );
        })}
        {/* === Bio Section === */}
        <section id="bio" className="relative border-t border-white/10 bg-transparent">
          <div className="w-full max-w-screen-xl mx-auto min-h-[100svh] py-16 md:py-24 flex items-center justify-center">
            {/* Centered block */}
            <div className="mx-auto w-full max-w-[960px] text-center">
              <div
                ref={portraitRef}
                className="card relative overflow-hidden rounded-2xl p-6 md:p-8 bg-white/5 border border-white/10 tilt-card project-tilt"
                onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.setProperty('--scale','1.03'); }}
                onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.setProperty('--scale','1.015'); }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement & { _raf?: number; _nx?: number; _ny?: number; _rx?: number; _ry?: number; _leaving?: boolean };
                  el.style.setProperty('--scale','1.015');
                  el._leaving = true;
                  el._nx = 0; el._ny = 0;
                  const glare = el.querySelector('[data-glare]') as HTMLDivElement | null;
                  if (glare) glare.style.opacity = '0';
                  setPortraitActive(false);
                }}
                onMouseEnter={() => { if (!isTouchDevice) setPortraitActive(true); }}
                onMouseMove={(e) => {
                  if (isTouchDevice || prefersReducedMotion) return;
                  const el = e.currentTarget as HTMLDivElement & { _raf?: number; _nx?: number; _ny?: number; _rx?: number; _ry?: number; _leaving?: boolean };
                  const r = el.getBoundingClientRect();
                  el._nx = (e.clientX - r.left) / r.width - 0.5;
                  el._ny = (e.clientY - r.top) / r.height - 0.5;
                  el._leaving = false;
                  if (!el._raf) {
                    el._rx = el._rx ?? 0; el._ry = el._ry ?? 0;
                    const step = () => {
                      const targetX = (-(el._ny ?? 0)) * 12;
                      const targetY = (el._nx ?? 0) * 12;
                      el._rx! += (targetX - el._rx!) * 0.18;
                      el._ry! += (targetY - el._ry!) * 0.18;
                      const tz = 14; const persp = 800;
                      // scale uses CSS var so we can animate it with cubic-bezier on click/press
                      el.style.transform = `perspective(${persp}px) rotateX(${el._rx!.toFixed(2)}deg) rotateY(${el._ry!.toFixed(2)}deg) translateZ(${tz}px) scale(var(--scale, 1.015))`;

                      // when pointer left, softly converge to neutral then stop the loop
                      if (el._leaving) {
                        const nearZero = Math.abs(el._rx!) + Math.abs(el._ry!) < 0.06;
                        if (nearZero) {
                          cancelAnimationFrame(el._raf!);
                          el._raf = undefined;
                          el._rx = 0; el._ry = 0;
                          // keep a neutral transform to avoid sudden layer demotion
                          el.style.transform = `perspective(${persp}px) translateZ(${tz}px) scale(var(--scale, 1.015))`;
                          return;
                        }
                      }
                      el._raf = requestAnimationFrame(step);
                    };
                    el._raf = requestAnimationFrame(step);
                  }
                  // glare center via CSS vars
                  const gx = ((e.clientX - r.left) / r.width) * 100;
                  const gy = ((e.clientY - r.top) / r.height) * 100;
                  el.style.setProperty('--gx', gx.toFixed(2) + '%');
                  el.style.setProperty('--gy', gy.toFixed(2) + '%');
                  const glare = el.querySelector('[data-glare]') as HTMLDivElement | null;
                  if (glare) glare.style.opacity = '0.22';
                }}
                onClick={() => { if (isTouchDevice) setPortraitActive(v => !v); }}
              >
                <div data-glare className="tilt-glare absolute inset-0" aria-hidden />
                {/* Full-card background photo (blurred by default, sharp on click) */}
                <div
                  className={`absolute inset-0 -z-10 bg-center bg-cover transition-all duration-300 ${portraitActive ? 'blur-0' : 'blur-md'}`}
                  style={{ backgroundImage: 'url(/portrait.jpg)', backgroundPosition: '50% 30%' }}
                  aria-hidden
                />
                {/* subtle dark scrim for readability */}
                <div className="absolute inset-0 -z-10 bg-black/25" aria-hidden />
                <div className="relative z-10 p-6 md:p-8">
                  {/* BIO on top */}
                  <div className="space-y-4 text-center">
                    <h2 className="text-3xl md:text-4xl font-semibold leading-tight">{lang === "en" ? "Bio — Alex" : "简介 — Alex"}</h2>
                    <div className="text-lg md:text-xl font-medium text-white/90 mt-1 mb-1">
                      {lang === "en"
                        ? "Composer, Photographer, Digital Artist"
                        : "编曲人，摄影师，数字艺术家"}
                    </div>
                    <p className="text-white/90 leading-relaxed">
                      {lang === "en"
                        ? "" // Remove the original English intro sentence
                        : "我的创作围绕 科技 / 反刍 / 连接 展开：技术统治与感知、反刍思维与自我坠落，以及滋养其发生的文化土壤。"}
                    </p>
                  </div>

                  {/* Buttons to reveal sub‑sections inside the block */}
                  <div className="mt-6 md:mt-8 flex flex-wrap justify-center gap-3">
                    <button className="btn-ghost" onMouseDown={(e)=>e.stopPropagation()} onClick={() => setAboutTab(aboutTab === 'statement' ? null : 'statement')}>{lang === 'en' ? 'Artist Statement' : '艺术家陈述'}</button>
                    <button className="btn-ghost" onMouseDown={(e)=>e.stopPropagation()} onClick={() => setAboutTab(aboutTab === 'timeline' ? null : 'timeline')}>{lang === 'en' ? 'Internships' : '实习经历'}</button>
                    <button className="btn-ghost" onMouseDown={(e)=>e.stopPropagation()} onClick={() => setAboutTab(aboutTab === 'contact' ? null : 'contact')}>{lang === 'en' ? 'Contact' : '联系'}</button>
                  </div>

                  {/* Reveal area */}
                  {aboutTab && (
                    <div className="mt-5">
                      {aboutTab === 'statement' && (
                        <div className="card bg-white/7">
                          <h3 className="text-xl font-semibold mb-3">{lang === 'en' ? 'Artist Statement' : '艺术家陈述'}</h3>
                          <p className="text-white/90 leading-relaxed">
                            {lang === 'en'
                              ? 'Between fitting reality and electromagnetic decay, I look at how technological ontology rewrites body and perception; in Dys/Utopia, the viewer is pulled into a chain reaction between multiplicity of thoughts and nihilistic retreat; “Connection” is the premise and trigger of them all.'
                              : '在拟合现实与电磁腐烂之间，我关注技术存在论如何改写身体与感知；在 Dys/Utopia 的观看机制里，观者被卷入多线思绪与虚无退隐的链式反应；而“连接”作为成长文化土壤，是一切发生的前提与引线。'}
                          </p>
                        </div>
                      )}
                      {aboutTab === 'timeline' && (
                        <div className="card">
                          <h3 className="text-xl font-semibold mb-4">{lang === 'en' ? 'Internships' : '实习经历'}</h3>
                          <ul className="space-y-4">
                            {[{
                              year: '',
                              title: lang === 'en'
                                ? 'Graphic Designer — Bund Dinosaur Exhibition (Shanghai)'
                                : '上海外滩恐龙展 平面设计师',
                              meta: lang === 'en' ? 'Internship' : '实习'
                            }, {
                              year: '',
                              title: lang === 'en'
                                ? 'Data Collector — Mr.Panda inbound AI localization guide (Huawei AI Joint Lab × Zhongying Niannian, Beijing)'
                                : '北京中影年年责任有限公司 · 华为AI联合实验室 · Mr.Panda 外国人来华AI平台智能本土化导引平台 数据收集师',
                              meta: lang === 'en' ? 'Internship' : '实习'
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
                      {aboutTab === 'contact' && (
                        <div className="card">
                          <h3 className="text-xl font-semibold mb-3">{lang === 'en' ? 'Contact' : '联系'}</h3>
                          <ul className="space-y-2 text-white/90">
                            <li>
                              <span className="opacity-80 mr-2">{lang === 'en' ? 'Email:' : '邮箱：'}</span>
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
