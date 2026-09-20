import { ArrowUpRight, Leaf, Play, Plus, Youtube } from "lucide-react";
import { GALLERY_CONTENT } from "../data/gallery";
import type { Language } from "../types/project";

export function GallerySection({ lang }: { lang: Language }) {
  const content = GALLERY_CONTENT[lang];
  const featuredItem = content.items.find((item) => item.kind === "archive");
  const videoItems = content.items.filter((item) => item.kind === "video");

  return (
    <section id="gallery" className="gallery-section relative min-h-[100svh] snap-child overflow-hidden border-t border-white/10">
      <div className="gallery-orbit gallery-orbit-one" aria-hidden />
      <div className="gallery-orbit gallery-orbit-two" aria-hidden />

      <div className="gallery-shell relative z-10 mx-auto flex min-h-[100svh] w-full max-w-screen-xl flex-col justify-center px-5 py-24 md:px-10 lg:pl-28">
        <header className="gallery-header mb-10 grid gap-4 md:grid-cols-[1fr,1.35fr] md:items-end">
          <div>
            <p className="gallery-kicker">{content.eyebrow}</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">{content.title}</h2>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-white/65 md:justify-self-end md:text-lg">
            {content.intro}
          </p>
        </header>

        <div className="gallery-grid">
          {featuredItem && (
            <article className="gallery-feature group">
              <div className="gallery-feature-art" aria-hidden>
                <span className="gallery-index">ARCHIVE {featuredItem.index}</span>
                <div className="gallery-leaf-wrap">
                  <Leaf className="gallery-leaf" strokeWidth={0.75} />
                  <span className="gallery-leaf-shadow" />
                </div>
                <p className="gallery-trace">TRANSLATION LEAVES A MATERIAL TRACE.</p>
              </div>

              <div className="gallery-feature-copy">
                <div>
                  <p className="gallery-kicker text-[#a7bc8b]">{featuredItem.eyebrow}</p>
                  <h3 className="mt-4 text-4xl font-medium tracking-tight md:text-5xl">{featuredItem.title}</h3>
                  <p className="mt-1 text-lg text-white/55">{featuredItem.subtitle}</p>
                  <p className="mt-7 max-w-xl text-base leading-7 text-white/75">{featuredItem.description}</p>
                </div>

                <div className="mt-8">
                  <div className="mb-7 flex flex-wrap gap-2">
                    {featuredItem.tags.map((tag) => (
                      <span key={tag} className="gallery-tag">{tag}</span>
                    ))}
                  </div>
                  <a
                    href={featuredItem.href}
                    target="_blank"
                    rel="noreferrer"
                    className="gallery-link"
                    aria-label={`${content.visitLabel}: ${featuredItem.title} — ${featuredItem.subtitle}`}
                  >
                    {content.visitLabel}
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </article>
          )}

          {videoItems.map((item) => (
            <a
              key={item.slug}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="gallery-video-card group"
              aria-label={`${content.watchLabel}: ${item.title} (${item.year})`}
            >
              <div className="gallery-video-art">
                {item.thumbnail && (
                  <img
                    src={item.thumbnail}
                    alt={`${item.title} ${item.year ?? ""}`.trim()}
                    loading="lazy"
                  />
                )}
                <div className="gallery-video-shade" aria-hidden />
                <span className="gallery-video-index">FILM {item.index}</span>
                <span className="gallery-video-duration">{item.duration}</span>
                <span className="gallery-video-play" aria-hidden>
                  <Play className="h-5 w-5 fill-current" />
                </span>
              </div>

              <div className="gallery-video-copy">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="gallery-kicker text-white/45">{item.eyebrow}</p>
                    <Youtube className="h-4 w-4 text-white/35" aria-hidden />
                  </div>
                  <h3 className="mt-4 text-3xl font-medium tracking-tight">{item.title}</h3>
                  <p className="mt-1 text-sm text-white/50">{item.subtitle} · {item.year}</p>
                  <p className="mt-5 text-sm leading-6 text-white/65">{item.description}</p>
                </div>

                <div className="gallery-video-footer">
                  <span>{content.watchLabel}</span>
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
            </a>
          ))}

          {["04"].map((index) => (
            <div key={index} className="gallery-reserve gallery-reserve-wide">
              <div className="flex items-center justify-between">
                <span className="gallery-kicker">{index}</span>
                <Plus className="h-5 w-5 text-white/35" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-white/75">{content.reserveLabel}</h3>
                <p className="mt-2 text-sm leading-6 text-white/45">{content.reserveDescription}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
