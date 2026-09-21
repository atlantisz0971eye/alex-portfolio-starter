"use client";

import { useEffect, useState } from "react";
import { GALLERY_CONTENT } from "../data/gallery";
import type { Language, SearchResult, Theme } from "../types/project";

const tokenize = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);
const includesTerms = (haystack: string, terms: string[]) => terms.every((term) => haystack.toLowerCase().includes(term));

const BIO_INDEX = {
  en: [
    { kind: "bio" as const, title: "Alex Zhao", subtitle: "Composer, Photographer, Digital Artist", slug: "statement" },
    { kind: "education" as const, title: "MFA Digital Media Arts", subtitle: "Xi’an Jiaotong-Liverpool University", slug: "education" },
    { kind: "education" as const, title: "MA Information Experience Design", subtitle: "Royal College of Art", slug: "education" },
    { kind: "bio" as const, title: "Internships", subtitle: "Graphic design, AI localization and data collection", slug: "timeline" },
    { kind: "bio" as const, title: "Contact", subtitle: "Email, Instagram and YouTube", slug: "contact" },
  ],
  zh: [
    { kind: "bio" as const, title: "Alex Zhao", subtitle: "编曲人，摄影师，数字艺术家", slug: "statement" },
    { kind: "education" as const, title: "数字媒体艺术 MFA", subtitle: "西交利物浦大学", slug: "education" },
    { kind: "education" as const, title: "信息体验设计 MA", subtitle: "英国皇家艺术学院", slug: "education" },
    { kind: "bio" as const, title: "实习经历", subtitle: "平面设计、人工智能本土化与数据收集", slug: "timeline" },
    { kind: "bio" as const, title: "联系", subtitle: "邮箱、Instagram 与 YouTube", slug: "contact" },
  ],
} satisfies Record<Language, { kind: "bio" | "education"; title: string; subtitle: string; slug: string }[]>;

export function useSearch(themes: Theme[], lang: Language) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 160);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const query = debouncedQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    const terms = tokenize(query);
    const results: SearchResult[] = [];

    for (const theme of themes) {
      if (includesTerms(`${theme.title} ${theme.intro}`, terms)) {
        results.push({ kind: "theme", title: theme.title, subtitle: lang === "en" ? "Theme" : "主题", themeId: theme.id, score: 50 });
      }

      for (const project of theme.projects ?? []) {
        const base = `${project.title} ${project.summary} ${(project.tags || []).join(" ")}`;
        let score = terms.reduce((total, term) => total + (base.toLowerCase().includes(term) ? 10 : 0), 0);
        if (includesTerms(project.title, terms)) score += 30;
        if (score > 0) {
          results.push({ kind: "project", title: project.title, subtitle: theme.title, slug: project.slug, themeId: theme.id, score });
        }
        for (const tag of project.tags || []) {
          if (includesTerms(tag, terms)) {
            results.push({ kind: "tag", title: tag, subtitle: `${lang === "en" ? "Tag of" : "项目标签"} ${project.title}`, slug: project.slug, themeId: theme.id, score: 8 });
          }
        }
      }
    }

    const gallery = GALLERY_CONTENT[lang];
    if (includesTerms(`${gallery.title} ${gallery.eyebrow} ${gallery.intro}`, terms)) {
      results.push({ kind: "gallery", title: gallery.title, subtitle: gallery.intro, themeId: "gallery", score: 42 });
    }
    for (const item of gallery.items) {
      const base = `${item.title} ${item.subtitle} ${item.description} ${item.eyebrow} ${item.tags.join(" ")} ${item.year ?? ""}`;
      if (terms.some((term) => base.toLowerCase().includes(term))) {
        results.push({ kind: "gallery", title: item.title, subtitle: item.subtitle, slug: item.slug, themeId: "gallery", score: includesTerms(item.title, terms) ? 38 : 18 });
      }
    }

    for (const entry of BIO_INDEX[lang]) {
      if (terms.some((term) => `${entry.title} ${entry.subtitle}`.toLowerCase().includes(term))) {
        results.push({ ...entry, themeId: "bio", score: includesTerms(entry.title, terms) ? 36 : 16 });
      }
    }

    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    setSearchResults(results.slice(0, 24));
  }, [debouncedQuery, lang, themes]);

  const jumpTo = (result: SearchResult) => {
    const section = result.themeId ? document.getElementById(result.themeId) : null;
    section?.scrollIntoView({ behavior: "smooth", block: "start" });

    let target: HTMLElement | null = section;
    if ((result.kind === "project" || result.kind === "tag") && result.slug) {
      window.dispatchEvent(new CustomEvent("portfolio:open", { detail: { slug: result.slug } }));
      target = document.getElementById(`proj-${result.slug}`);
    } else if (result.kind === "gallery" && result.slug) {
      window.dispatchEvent(new CustomEvent("gallery:open", { detail: { slug: result.slug } }));
      target = document.getElementById(`gallery-${result.slug}`);
    } else if ((result.kind === "bio" || result.kind === "education") && result.slug) {
      window.dispatchEvent(new CustomEvent("bio:open", { detail: { tab: result.slug } }));
      target = document.getElementById("bio");
    }

    if (target) {
      setTimeout(() => {
        target?.classList.add("search-highlight");
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => target?.classList.remove("search-highlight"), 1600);
      }, 260);
    }
    setSearchOpen(false);
  };

  return { searchQuery, setSearchQuery, searchOpen, setSearchOpen, searchResults, jumpTo };
}
