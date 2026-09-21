"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { ArrowUpRight, Headphones, Leaf, Play, Youtube } from "lucide-react";
import { GALLERY_CONTENT, type GalleryItem } from "../data/gallery";
import { cancelTiltAnimation, resetTilt, type TiltElement, updateTilt } from "../lib/tilt";
import type { Language } from "../types/project";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

export function GallerySection({ lang }: { lang: Language }) {
  const content = GALLERY_CONTENT[lang];
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [headerOpen, setHeaderOpen] = useState(false);

  useEffect(() => {
    setActiveSlug(null);
    setHeaderOpen(false);
  }, [lang]);

  useEffect(() => {
    const openGalleryCard = (event: Event) => {
      const slug = (event as CustomEvent<{ slug?: string }>).detail?.slug;
      if (slug) {
        setActiveSlug(slug);
        window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "gallery" } }));
      }
    };
    window.addEventListener("gallery:open", openGalleryCard);
    return () => window.removeEventListener("gallery:open", openGalleryCard);
  }, []);

  useEffect(() => {
    const closeForOtherContent = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind && kind !== "gallery") setActiveSlug(null);
    };
    window.addEventListener("glass:open", closeForOtherContent);
    return () => window.removeEventListener("glass:open", closeForOtherContent);
  }, []);

  const toggleCard = (slug: string) => {
    const next = activeSlug === slug ? null : slug;
    setActiveSlug(next);
    if (next) window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "gallery" } }));
  };

  return (
    <section id="gallery" className="gallery-section relative min-h-[100svh] snap-child overflow-hidden border-t border-white/10">
      <div className="gallery-orbit gallery-orbit-one" aria-hidden />
      <div className="gallery-orbit gallery-orbit-two" aria-hidden />

      <div className="gallery-shell relative z-10 mx-auto flex min-h-[100svh] w-full max-w-screen-xl flex-col justify-center px-5 py-24 md:px-10 lg:px-28">
        <header
          className={`gallery-header mb-8 flex flex-col items-center text-center ${headerOpen ? "is-open" : ""}`}
          role="button"
          tabIndex={0}
          aria-expanded={headerOpen}
          aria-label={`${content.title}: ${lang === "en" ? "show gallery introduction" : "显示画廊介绍"}`}
          onClick={() => setHeaderOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setHeaderOpen((current) => !current);
            }
          }}
        >
          <div className="gallery-header__title-block">
            <p className="gallery-kicker gallery-header__eyebrow">{content.eyebrow}</p>
            <h2 className="gallery-header__title text-4xl font-semibold tracking-tight md:text-6xl">{content.title}</h2>
          </div>
          <p className="gallery-header__intro max-w-3xl text-base leading-relaxed text-white/65 md:text-lg">
            {content.intro}
          </p>
        </header>

        <div className="gallery-grid" data-active-card={activeSlug ?? "none"}>
          {content.items.map((item) => {
            const isOpen = activeSlug === item.slug;
            const actionLabel =
              item.kind === "archive"
                ? content.visitLabel
                : item.kind === "video"
                  ? content.watchLabel
                  : content.listenLabel;

            return (
              <GalleryGlassCard
                key={item.slug}
                item={item}
                lang={lang}
                actionLabel={actionLabel}
                isOpen={isOpen}
                onToggle={() => toggleCard(item.slug)}
              />
            );
          })}

        </div>
      </div>
    </section>
  );
}

function GalleryGlassCard({
  item,
  lang,
  actionLabel,
  isOpen,
  onToggle,
}: {
  item: GalleryItem;
  lang: Language;
  actionLabel: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const interactionLabel = isOpen
    ? lang === "en"
      ? "Close details"
      : "收起详情"
    : lang === "en"
      ? "Open details"
      : "打开详情";

  return (
    <TiltArticle
      id={`gallery-${item.slug}`}
      className={`gallery-glass-card gallery-tilt ${isOpen ? "is-open" : ""}`}
      isOpen={isOpen}
      ariaLabel={`${interactionLabel}: ${item.title}`}
      onToggle={onToggle}
    >
      <div className="gallery-card__media" aria-hidden>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" loading="lazy" />
        ) : (
          <div className="gallery-card__leaf">
            <Leaf strokeWidth={0.8} />
          </div>
        )}
      </div>
      <div className="gallery-card__shade" aria-hidden />

      <div className="gallery-card__content">
        <div className="gallery-card__topline">
          <span className="gallery-kicker">{item.index} · {item.eyebrow}</span>
          <GalleryKindIcon kind={item.kind} />
        </div>

        <div className="gallery-card__primary">
          <h3>{item.title}</h3>
          <p>{item.subtitle}{item.year ? ` · ${item.year}` : ""}</p>
        </div>

        <div className="gallery-card__details" aria-hidden={!isOpen}>
          <div className="gallery-card__details-inner">
            <p className="gallery-card__description">{item.description}</p>
            <div className="gallery-card__tags">
              {item.tags.map((tag) => (
                <span key={tag} className="gallery-tag">{tag}</span>
              ))}
            </div>
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="gallery-card__link"
              aria-label={`${actionLabel}: ${item.title}`}
              tabIndex={isOpen ? 0 : -1}
            >
              {item.kind === "video" && <Play className="h-4 w-4 fill-current" />}
              {actionLabel}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="gallery-card__hint" aria-hidden>
          <span>{interactionLabel}</span>
          <span className="gallery-card__hint-mark">{isOpen ? "−" : "+"}</span>
        </div>
      </div>
    </TiltArticle>
  );
}

function GalleryKindIcon({ kind }: { kind: GalleryItem["kind"] }) {
  if (kind === "video") return <Youtube className="h-4 w-4" aria-hidden />;
  if (kind === "album") return <Headphones className="h-4 w-4" aria-hidden />;
  return <Leaf className="h-4 w-4" aria-hidden />;
}

function useGalleryTilt<T extends HTMLElement>() {
  const ref = useRef<TiltElement<T> | null>(null);

  useEffect(() => () => cancelTiltAnimation(ref.current), []);

  const onMouseMove = (event: ReactMouseEvent<T>) => {
    if (isTouchDevice || prefersReducedMotion) return;
    updateTilt(event.currentTarget as TiltElement<T>, event.clientX, event.clientY);
  };

  const onMouseLeave = (event: ReactMouseEvent<T>) => {
    if (isTouchDevice || prefersReducedMotion) return;
    resetTilt(event.currentTarget as TiltElement<T>);
  };

  const onMouseDown = (event: ReactMouseEvent<T>) => {
    if (isTouchDevice || prefersReducedMotion) return;
    event.currentTarget.style.setProperty("--scale", "1.012");
  };

  const onMouseUp = (event: ReactMouseEvent<T>) => {
    if (isTouchDevice || prefersReducedMotion) return;
    event.currentTarget.style.setProperty("--scale", "1.008");
  };

  return { ref, onMouseMove, onMouseLeave, onMouseDown, onMouseUp };
}

function TiltGlare() {
  return (
    <span
      data-glare
      className="gallery-tilt-glare pointer-events-none absolute inset-0 opacity-0"
      aria-hidden
    />
  );
}

function TiltArticle({
  id,
  className,
  isOpen,
  ariaLabel,
  onToggle,
  children,
}: {
  id: string;
  className: string;
  isOpen: boolean;
  ariaLabel: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  const tilt = useGalleryTilt<HTMLElement>();

  return (
    <article
      id={id}
      className={className}
      {...tilt}
    >
      <TiltGlare />
      <button
        type="button"
        className="gallery-card__toggle"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={onToggle}
      />
      {children}
    </article>
  );
}
