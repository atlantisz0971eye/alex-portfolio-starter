"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { DEVELOPMENT_CONTENT, type DevelopmentItem } from "../data/development";
import { cancelTiltAnimation, resetTilt, type TiltElement, updateTilt } from "../lib/tilt";
import type { Language } from "../types/project";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

type CardProps = { item: DevelopmentItem; lang: Language; isOpen: boolean; onToggle: () => void; liveLabel: string; visitLabel: string };

/** A project card that opens and closes exactly like the project cards of the themes, with a link out to the live work. */
function DevelopmentCard({ item, lang, isOpen, onToggle, liveLabel, visitLabel }: CardProps) {
  const cardRef = useRef<TiltElement | null>(null);
  useEffect(() => () => cancelTiltAnimation(cardRef.current), []);
  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isTouchDevice || prefersReducedMotion) return;
    updateTilt(event.currentTarget as TiltElement, event.clientX, event.clientY);
  };
  const interactionLabel = isOpen ? (lang === "en" ? "Close details" : "收起详情") : (lang === "en" ? "Open details" : "打开详情");

  return (
    <div className="w-full flex flex-col items-center">
      <div
        ref={cardRef}
        id={`dev-${item.slug}`}
        className={`portfolio-glass-card project-tilt relative w-full overflow-hidden ${isOpen ? "is-open" : ""}`}
        style={{ ["--scale" as string]: "1.012" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={(event) => resetTilt(event.currentTarget as TiltElement)}
        onMouseDown={(event) => event.currentTarget.style.setProperty("--scale", "1.02")}
        onMouseUp={(event) => event.currentTarget.style.setProperty("--scale", "1.012")}
      >
        <div
          className="portfolio-card__media"
          style={item.poster
            ? { backgroundImage: `url("${item.poster}")`, backgroundSize: "cover", backgroundPosition: item.posterPosition ?? "center" }
            : { backgroundImage: item.field, backgroundSize: "cover" }}
          aria-hidden
        />
        <div className="portfolio-card__shade" aria-hidden />
        <div data-glare className="tilt-glare pointer-events-none absolute inset-0" aria-hidden />

        <button type="button" className="portfolio-card__toggle" aria-expanded={isOpen} aria-label={`${interactionLabel}: ${item.title}`} onClick={onToggle} />

        <div className="portfolio-card__content">
          <div className="portfolio-card__heading">
            <h3>{item.title}</h3>
            <span className="badge dev-badge"><i aria-hidden />{liveLabel}</span>
          </div>
          <p className="portfolio-card__type">{item.subtitle === item.type ? item.type : `${item.subtitle} · ${item.type}`}</p>

          <div className="portfolio-card__details" aria-hidden={!isOpen}>
            <div className="portfolio-card__details-inner">
              <p className="portfolio-card__summary">{item.summary}</p>
              {item.quote && (
                <p className="dev-quote">
                  <span>{item.quote.text}</span>
                  {item.quote.note && <small>{item.quote.note}</small>}
                </p>
              )}
              <div className="portfolio-card__tags">
                {item.tags.map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
              <a className="portfolio-card__view" href={item.href} target="_blank" rel="noopener noreferrer" tabIndex={isOpen ? 0 : -1} onClick={(event) => event.stopPropagation()}>
                {visitLabel}
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="portfolio-card__hint" aria-hidden>
            <span>{isOpen ? item.host : interactionLabel}</span>
            <span>{isOpen ? "−" : "+"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Running, hosted projects, shown with the same glass cards as the themes. One card is open at a time. */
export function DevelopmentSection({ lang }: { lang: Language }) {
  const content = DEVELOPMENT_CONTENT[lang];
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // Opening a card elsewhere on the page closes this one, as it does for the project cards.
  useEffect(() => {
    const closeForOtherContent = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind && kind !== "development") setOpenSlug(null);
    };
    window.addEventListener("glass:open", closeForOtherContent);
    return () => window.removeEventListener("glass:open", closeForOtherContent);
  }, []);

  const toggle = (slug: string) => {
    const next = openSlug === slug ? null : slug;
    setOpenSlug(next);
    if (next) window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "development" } }));
  };

  return (
    <section id="development" className="section-wrap development-section relative overflow-hidden snap-child min-h-[100svh] w-full">
      <div className="dev-grid" aria-hidden />
      <div className="dev-orbit dev-orbit-one" aria-hidden />
      <div className="dev-orbit dev-orbit-two" aria-hidden />
      <div className="theme-noise section-noise" aria-hidden />

      <div className="section-content content-grid py-16 md:py-24">
        <div className="section-head mb-8">
          <p className="gallery-kicker">{content.eyebrow}</p>
          <h1 className="section-title text-4xl md:text-5xl font-semibold tracking-tight">{content.title}</h1>
          <p className="section-subtitle text-white/85 leading-relaxed">{content.intro}</p>
        </div>
        <div className="cards-col flex flex-col items-center gap-6">
          {content.items.map((item) => (
            <div key={item.slug} className="w-full [&_.card]:px-5 [&_.card]:py-4 md:[&_.card]:px-6 md:[&_.card]:py-5">
              <DevelopmentCard item={item} lang={lang} isOpen={openSlug === item.slug} onToggle={() => toggle(item.slug)} liveLabel={content.liveLabel} visitLabel={content.visitLabel} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
