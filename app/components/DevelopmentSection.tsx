"use client";

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { DEVELOPMENT_CONTENT, type DevelopmentItem } from "../data/development";
import { cancelTiltAnimation, resetTilt, type TiltElement, updateTilt } from "../lib/tilt";
import type { Language } from "../types/project";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

function DevelopmentCard({ item, lang, liveLabel, visitLabel }: { item: DevelopmentItem; lang: Language; liveLabel: string; visitLabel: string }) {
  const cardRef = useRef<TiltElement | null>(null);
  useEffect(() => () => cancelTiltAnimation(cardRef.current), []);
  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isTouchDevice || prefersReducedMotion) return;
    updateTilt(event.currentTarget as TiltElement, event.clientX, event.clientY);
  };

  return (
    <div
      ref={cardRef}
      id={`dev-${item.slug}`}
      className="portfolio-glass-card dev-card project-tilt relative w-full overflow-hidden is-open"
      style={{ ["--scale" as string]: "1.012" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={(event) => resetTilt(event.currentTarget as TiltElement)}
      onMouseDown={(event) => event.currentTarget.style.setProperty("--scale", "1.02")}
      onMouseUp={(event) => event.currentTarget.style.setProperty("--scale", "1.012")}
    >
      <div
        className="portfolio-card__media"
        style={item.poster ? { backgroundImage: `url("${item.poster}")`, backgroundSize: "cover", backgroundPosition: "center" } : { backgroundImage: item.field, backgroundSize: "cover" }}
        aria-hidden
      />
      <div className="portfolio-card__shade" aria-hidden />
      <div data-glare className="tilt-glare pointer-events-none absolute inset-0" aria-hidden />

      <a
        className="portfolio-card__toggle"
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${visitLabel}: ${item.title}`}
      />

      <div className="portfolio-card__content dev-card__content">
        <div className="dev-card__index" aria-hidden>{item.index}</div>
        <div className="portfolio-card__heading">
          <h3>{item.title}</h3>
          <span className="badge dev-badge"><i aria-hidden />{liveLabel}</span>
        </div>
        <p className="portfolio-card__type">{item.subtitle === item.type ? item.type : `${item.subtitle} · ${item.type}`}</p>

        <p className="portfolio-card__summary">{item.summary}</p>
        <div className="portfolio-card__tags">
          {item.tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
        <span className="portfolio-card__view dev-card__visit" lang={lang}>
          {visitLabel}
          <ArrowUpRight className="h-4 w-4" />
        </span>

        <div className="portfolio-card__hint" aria-hidden>
          <span>{item.host}</span>
          <span>↗</span>
        </div>
      </div>
    </div>
  );
}

/** The first section of the page: running, hosted projects shown as glass cards in the same style as the themes. */
export function DevelopmentSection({ lang }: { lang: Language }) {
  const content = DEVELOPMENT_CONTENT[lang];
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
        <div className="cards-col dev-cards">
          {content.items.map((item) => (
            <DevelopmentCard key={item.slug} item={item} lang={lang} liveLabel={content.liveLabel} visitLabel={content.visitLabel} />
          ))}
        </div>
      </div>
    </section>
  );
}
