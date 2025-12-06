"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { MediaGroup, MediaGroups, MediaItem, Project, Theme } from "../types/project";
import type { useMediaHub } from "../hooks/useMediaHub";
import { getProjectTypeLabel } from "../lib/projectType";
import { isTouchDevice } from "../utils/environment";

type MediaOverlayProps = {
  lang: "en" | "zh";
  themes: Theme[];
  hub: ReturnType<typeof useMediaHub>;
  overviewText: Record<string, string | null>;
  setOverviewText: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
};

type MediaIndexRecord = {
  images?: Record<string, string[]>;
  videos?: Record<string, string[]>;
  audios?: Record<string, string[]>;
};

type ProjectWithBrief = Project & { briefTxt?: string };

const FALLBACK_LABEL: Record<"en" | "zh", string> = { en: "Set", zh: "组" };
const inferTypeFromExt = (src: string): MediaItem["type"] | undefined => {
  const lower = src.toLowerCase();
  const imageExts = ["jpg", "jpeg", "png", "webp", "gif", "tif", "tiff"];
  const videoExts = ["mp4", "mov", "webm", "m4v"];
  const audioExts = ["wav", "mp3", "aiff", "aac", "ogg"];
  const ext = lower.split(".").pop();
  if (!ext) return undefined;
  if (imageExts.includes(ext)) return "image";
  if (videoExts.includes(ext)) return "video";
  if (audioExts.includes(ext)) return "audio";
  return undefined;
};

const inferRoleFromPath = (src: string): MediaItem["role"] | undefined => {
  const lower = src.toLowerCase();
  if (lower.includes("/hero/") || /\/hero_/.test(lower)) return "hero";
  if (lower.includes("/experience/") || /\/experience_/.test(lower)) return "experience";
  if (lower.includes("/concept/") || /\/concept_/.test(lower)) return "concept";
  if (lower.includes("/system/") || /\/system_/.test(lower)) return "system";
  if (lower.includes("/process/") || /\/process_/.test(lower)) return "process";
  if (lower.includes("/docs/") || /\/doc_/.test(lower)) return "doc";
  return undefined;
};

const normalizeMediaItems = (items?: MediaItem[] | null): MediaItem[] => {
  if (!items) return [];
  return items
    .map((item) => {
      const role = item.role ?? inferRoleFromPath(item.src);
      const type = item.type ?? inferTypeFromExt(item.src);
      if (!role || !type) return null;
      return { ...item, role, type };
    })
    .filter((i): i is MediaItem => Boolean(i));
};

const buildGroups = (project: Project, lang: "en" | "zh", idx?: MediaIndexRecord | null): MediaGroups => {
  const { mediaGroups, media } = project;
  const mediaCollections = Array.isArray(media) ? undefined : media;
  const wrapFromIndex = (section?: Record<string, string[]>) =>
    section ? Object.entries(section).map(([label, items]) => ({ label, items })) : undefined;
  const wrap = (groups: MediaGroup[] | undefined, items?: string[], indexSection?: Record<string, string[]>) => {
    const indexed = wrapFromIndex(indexSection);
    if (indexed?.length) return indexed;
    if (groups?.length) return groups;
    if (!items || items.length === 0) return [];
    return [{ label: `${FALLBACK_LABEL[lang]} 1`, items }];
  };
  return {
    images: wrap(mediaGroups?.images, mediaCollections?.images, idx ? idx.images : undefined),
    videos: wrap(mediaGroups?.videos, mediaCollections?.videos, idx ? idx.videos : undefined),
    audios: wrap(mediaGroups?.audios, mediaCollections?.audios, idx ? idx.audios : undefined),
  };
};

export function MediaOverlay({ lang, themes, hub, overviewText, setOverviewText }: MediaOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [mediaIndexCache, setMediaIndexCache] = useState<Record<string, MediaIndexRecord | null>>({});
  const project = useMemo(() => {
    if (!hub.openSlug) return undefined;
    for (const theme of themes) {
      const hit = theme.projects.find((item) => item.slug === hub.openSlug);
      if (hit) return hit;
    }
    return undefined;
  }, [hub.openSlug, themes]);

  useEffect(() => {
    if (!project?.overviewTxt) return;
    const key = `${project.slug}-overview-${lang}`;
    if (overviewText[key] !== undefined) return;
    const controller = new AbortController();
    fetch(project.overviewTxt, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(response.statusText);
        return response.text();
      })
      .then((text) => setOverviewText((prev) => ({ ...prev, [key]: text })))
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setOverviewText((prev) => ({ ...prev, [key]: "" }));
      });
    return () => controller.abort();
  }, [lang, overviewText, project, setOverviewText]);

  useEffect(() => {
    return () => {
      const el = overlayRef.current;
      if (!el) return;
      el.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
        try {
          video.pause();
          video.currentTime = 0;
        } catch {
          /* noop */
        }
      });
    };
  }, [hub.openSlug]);

  useEffect(() => {
    if (!project) return;
    if (mediaIndexCache[project.slug] !== undefined) return;
    let aborted = false;
    fetch(`/media/${project.slug}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(response.statusText);
        return response.json();
      })
      .then((payload: MediaIndexRecord) => {
        if (aborted) return;
        setMediaIndexCache((prev) => ({ ...prev, [project.slug]: payload }));
      })
      .catch(() => {
        if (aborted) return;
        setMediaIndexCache((prev) => ({ ...prev, [project.slug]: null }));
      });
    return () => {
      aborted = true;
    };
  }, [mediaIndexCache, project]);

  if (!hub.openSlug || !project) {
    return null;
  }

  const mediaIndex = project ? mediaIndexCache[project.slug] : null;
  const groups = buildGroups(project, lang, mediaIndex ?? undefined);
  const rawMediaItems: MediaItem[] =
    Array.isArray(project.media) && project.media.length && (project.media as MediaItem[])[0]?.src
      ? (project.media as MediaItem[])
      : project.mediaItems ?? [];
  const mediaItems = normalizeMediaItems(rawMediaItems);
  const heroImages = mediaItems.filter((m) => m.role === "hero" && m.type === "image");
  const experienceMedia = mediaItems.filter((m) => m.role === "experience");
  const systemImages = mediaItems.filter((m) => m.role === "system" && m.type === "image");
  const conceptImages = mediaItems.filter((m) => m.role === "concept" && m.type === "image");
  const experienceImages = experienceMedia.filter((m) => m.type === "image");
  const experienceVideos = experienceMedia.filter((m) => m.type === "video");
  const filmstripImages = heroImages.length ? heroImages : experienceImages;
  // briefTxt path is derived from title -> underscores (see content.ts helper) and lives under /public/brief
  const briefSrc = (project as ProjectWithBrief).briefTxt;
  const briefKey = project.slug;
  const overviewKey = `${project.slug}-overview-${lang}`;
  const briefContent = overviewText[briefKey];
  const overviewContent = overviewText[overviewKey];

  const [tab, setTab] = useState<OverlayTab>("brief");
  const [previewImage, setPreviewImage] = useState<MediaItem | null>(null);

  useEffect(() => {
    setTab("brief");
  }, [hub.openSlug]);

  useEffect(() => {
    if (!briefSrc) return;
    if (overviewText[briefKey] !== undefined) return;
    console.log("[brief] fetch start", { slug: project.slug, url: briefSrc });
    const controller = new AbortController();
    fetch(briefSrc, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Status ${response.status}`);
        return response.text();
      })
      .then((text) => {
        console.log("[brief] fetch success", { slug: project.slug, preview: text.slice(0, 40) });
        setOverviewText((prev) => ({ ...prev, [briefKey]: text }));
      })
      .catch((error) => {
        console.log("[brief] fetch fail", { slug: project.slug, error: String(error) });
        if ((error as Error).name === "AbortError") return;
        setOverviewText((prev) => ({ ...prev, [briefKey]: "" }));
      });
    return () => controller.abort();
  }, [briefKey, briefSrc, hub.openSlug, overviewText, setOverviewText]);

  const closeOverlay = () => {
    hub.close();
    setTab("brief");
  };
  useEffect(() => {
    if (!previewImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewImage]);

  const heroImage = groups.images?.[0]?.items?.[0];
  const heroVideo = groups.videos?.[0]?.items?.[0];
  const mainHeroImage = heroImages[0]?.src || experienceImages[0]?.src || heroImage;
  const mainExperienceVideo = experienceVideos[0]?.src || heroVideo;
  const extraExperienceMedia = experienceMedia.filter(
    (m) => m.src !== mainHeroImage && m.src !== mainExperienceVideo
  );

  const renderTabContent = () => {
    switch (tab) {
      case "brief":
        return (
          <Card>
            <SectionHeading label={lang === "en" ? "Brief" : "简介"} badge="BRIEF" />
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{project.title}</h3>
                {briefContent === undefined ? (
                  <p className="text-sm text-white/60 leading-relaxed mt-2">{lang === "en" ? "Loading brief…" : "正在加载简介…"}</p>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed text-sm text-white/80 mt-2">
                    {briefContent !== null && briefContent !== "" ? briefContent : getProjectTypeLabel(project.slug)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span key={tag} className="tag uppercase tracking-wide text-[11px]">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/70">
                <MetaLine label={lang === "en" ? "Status" : "状态"} value={statusLabel(project.status, lang)} />
                <MetaLine label="Slug" value={project.slug} />
              </div>
            </div>
          </Card>
        );
      case "context":
        return (
          <Card>
            <SectionHeading label={lang === "en" ? "Context" : "语境"} badge="CONTEXT" />
            {project.overviewTxt ? (
              overviewContent === undefined ? (
                <p className="text-sm text-white/60">{lang === "en" ? "Loading context…" : "正在加载语境…"}</p>
              ) : overviewContent ? (
                <article className="prose prose-invert max-w-none prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-p:my-2 prose-li:my-1 prose-strong:text-white">
                  <ReactMarkdown>{overviewContent}</ReactMarkdown>
                </article>
              ) : (
                <p className="text-sm text-white/70">{lang === "en" ? "Context not found." : "未找到语境内容。"}</p>
              )
            ) : (
              <p className="text-sm text-white/70">{getProjectTypeLabel(project.slug)}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {project.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs tracking-[0.08em] uppercase text-white/80">
                  {tag}
                </span>
              ))}
            </div>
            {conceptImages.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {conceptImages.map((item, idx) => (
                  <div key={`${item.src}-${idx}`} className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
                    <button
                      type="button"
                      className="block focus:outline-none"
                      onDoubleClick={() => !isTouchDevice && setPreviewImage(item)}
                      onClick={() => isTouchDevice && setPreviewImage(item)}
                    >
                      <img src={item.src} alt={item.title || `${project.title} concept`} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                    {item.title && <div className="px-3 py-2 text-xs text-white/70">{item.title}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      case "system":
        return (
          <Card>
            <SectionHeading label={lang === "en" ? "System" : "系统"} badge="SYSTEM" />
            {project.updates && project.updates.length > 0 ? (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-white/90 tracking-[0.08em] uppercase">{lang === "en" ? "Build Timeline" : "进展时间线"}</h4>
                <div className="space-y-4 max-h-72 overflow-auto pr-1">
                  {project.updates
                    .slice()
                    .reverse()
                    .map((entry, idx) => (
                      <div key={`${entry.date}-${idx}`} className="flex gap-3">
                        <div className="pt-1">
                          <span className="block w-2 h-2 rounded-full bg-white/70" />
                        </div>
                        <div>
                          <div className="text-xs text-white/60">{entry.date}</div>
                          <div className="text-sm text-white/85 leading-relaxed">{entry.text}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <EmptyNote message={lang === "en" ? "System notes coming soon." : "系统说明即将更新。"} />
            )}
            {systemImages.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {systemImages.map((item, idx) => (
                  <div key={`${item.src}-${idx}`} className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
                    <button
                      type="button"
                      className="block focus:outline-none"
                      onDoubleClick={() => !isTouchDevice && setPreviewImage(item)}
                      onClick={() => isTouchDevice && setPreviewImage(item)}
                    >
                      <img src={item.src} alt={item.title || `${project.title} system`} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                    {item.title && <div className="px-3 py-2 text-xs text-white/70">{item.title}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      case "experience":
        return (
          <Card>
            <SectionHeading label={lang === "en" ? "Experience" : "体验"} badge="EXP" />
            {mainHeroImage || mainExperienceVideo ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {mainHeroImage && (
                  <button
                    type="button"
                    className="rounded-xl overflow-hidden border border-white/10 bg-black/40 block focus:outline-none"
                    onDoubleClick={() => !isTouchDevice && setPreviewImage({ type: "image", role: "experience", src: mainHeroImage })}
                    onClick={() => isTouchDevice && setPreviewImage({ type: "image", role: "experience", src: mainHeroImage })}
                  >
                    <img src={mainHeroImage} alt={`${project.title} hero`} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                )}
                {mainExperienceVideo && (
                  <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                    <video key={mainExperienceVideo} src={mainExperienceVideo} controls preload="metadata" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            ) : (
              <EmptyNote message={lang === "en" ? "Experience media coming soon." : "体验媒体即将上线。"} />
            )}
            {extraExperienceMedia.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {extraExperienceMedia.map((item, idx) => (
                  <div key={`${item.src}-${idx}`} className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
                    {item.type === "image" ? (
                      <>
                        <button
                          type="button"
                          className="block focus:outline-none"
                          onDoubleClick={() => !isTouchDevice && setPreviewImage(item)}
                          onClick={() => isTouchDevice && setPreviewImage(item)}
                        >
                          <img src={item.src} alt={item.title || `${project.title} experience`} className="w-full h-full object-cover" loading="lazy" />
                        </button>
                        {item.title && <div className="px-3 py-2 text-xs text-white/70">{item.title}</div>}
                      </>
                    ) : (
                      <div className="bg-black/50">
                        <video src={item.src} controls preload="metadata" className="w-full h-full object-cover" />
                        {item.title && <div className="px-3 py-2 text-xs text-white/70">{item.title}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-white/75 leading-relaxed mt-4">
              {lang === "en" ? "You enter the space and" : "你步入空间，"} {getProjectTypeLabel(project.slug)}
            </p>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/90 backdrop-blur z-[300] overflow-auto" onClick={closeOverlay} aria-modal="true" role="dialog">
        <div
          ref={overlayRef}
          className="relative w-full max-w-screen-xl mx-auto min-h-screen px-4 md:px-8 lg:px-10 pt-16 pb-10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative rounded-3xl bg-black/40 border border-white/10 p-6 md:p-8 shadow-2xl">
            <button
              onClick={closeOverlay}
              className="absolute top-4 right-4 text-white hover:text-gray-300"
              aria-label="Close media overlay"
            >
              ✕
            </button>
            <div className="flex items-center justify-between mb-6 pr-10">
              <BackButton onClick={closeOverlay} />
            </div>
            <div className="relative grid md:grid-cols-[260px,1fr] gap-6">
              {project.bg?.src && (
                <div
                  className="absolute inset-0 -z-10 bg-center bg-cover blur-xl opacity-30 pointer-events-none"
                  style={{ backgroundImage: `url(${project.bg.src})`, backgroundPosition: project.bg.position || "center" }}
                />
              )}
              <aside className="space-y-4">
                <h2 className="text-xl font-semibold">{project.title}</h2>
                <p className="text-sm text-white/85 leading-relaxed">{getProjectTypeLabel(project.slug)}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {project.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
                {filmstripImages.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4">
                    {filmstripImages.map((item, idx) => (
                      <button
                        key={`${item.src}-${idx}`}
                        className="overflow-hidden rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
                        onClick={() => {
                          if (isTouchDevice) setPreviewImage(item);
                          setTab("experience");
                        }}
                        onDoubleClick={() => !isTouchDevice && setPreviewImage(item)}
                      >
                        <img src={item.src} alt={item.title || `${project.title} thumb`} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
                {project.updates && project.updates.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold mb-2">{lang === "en" ? "Updates" : "更新日志"}</h3>
                    <ul className="space-y-1 text-xs text-white/70 max-h-40 overflow-auto pr-1">
                      {project.updates
                        .slice()
                        .reverse()
                        .map((entry, index) => (
                          <li key={index}>
                            <span className="text-white/60 mr-2">{entry.date}</span>
                            {entry.text}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </aside>
              <section className="space-y-4">
                <TabBar active={tab} onChange={setTab} />
                {renderTabContent()}
              </section>
            </div>
          </div>
        </div>
      </div>
      {previewImage && (
        <div
          className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white hover:text-gray-300 text-lg"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImage(null);
            }}
            aria-label="Close preview"
          >
            ✕
          </button>
          <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage.src} alt={previewImage.title || "Preview"} className="max-w-full max-h-[90vh] object-contain rounded-xl" loading="lazy" />
          </div>
        </div>
      )}
    </>
  );
}

type OverlayTab = "brief" | "context" | "system" | "experience";

function TabBar({ active, onChange }: { active: OverlayTab; onChange: (tab: OverlayTab) => void }) {
  const tabs: { id: OverlayTab; label: string }[] = [
    { id: "brief", label: "BRIEF" },
    { id: "context", label: "CONTEXT" },
    { id: "system", label: "SYSTEM" },
    { id: "experience", label: "EXPERIENCE" },
  ];
  return (
    <div className="rounded-2xl bg-black/40 border border-white/10 px-3 py-2 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1.5 rounded-lg border text-[11px] tracking-[0.14em] uppercase transition ${
            active === tab.id ? "bg-white text-black border-white" : "bg-white/5 text-white border-white/10 hover:bg-white/15"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const Card = ({ children }: { children: ReactNode }) => (
  <div className="rounded-2xl overflow-hidden bg-black/40 p-6 border border-white/10 space-y-4">{children}</div>
);

const SectionHeading = ({ label, badge }: { label: string; badge: string }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm font-semibold tracking-[0.12em] uppercase text-white/80">{label}</span>
    <span className="badge">{badge}</span>
  </div>
);

const MetaLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center gap-2 text-xs text-white/60">
    <span className="tracking-[0.08em] uppercase">{label}</span>
    <div className="flex-1 h-px bg-white/10" />
    <span className="text-white/80">{value}</span>
  </div>
);

const EmptyNote = ({ message }: { message: string }) => (
  <div className="text-sm text-white/65 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3">{message}</div>
);

const LabelOverlay = ({ text }: { text: string }) => (
  <div className="absolute top-2 right-2 text-[10px] tracking-[0.14em] uppercase bg-black/60 text-white px-2 py-1 rounded-full border border-white/15">
    {text}
  </div>
);

const BackButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-xs md:text-sm px-3 py-1.5 tracking-[0.12em] uppercase text-white transition"
  >
    <span aria-hidden>←</span>
    Back
  </button>
);

const statusLabel = (status: Project["status"], lang: "en" | "zh") => {
  if (status === "completed") return lang === "en" ? "Completed" : "已完成";
  if (status === "in-progress") return lang === "en" ? "In Progress" : "进行中";
  return lang === "en" ? "Planning" : "规划中";
};
