"use client";

import { useEffect, useState } from "react";
import type { SearchResult, Theme } from "../types/project";

const tokenize = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

export function useSearch(themes: Theme[], lang: "en" | "zh") {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const terms = tokenize(q);
    const results: SearchResult[] = [];

    for (const th of themes) {
      const hayTheme = `${th.title} ${th.intro}`.toLowerCase();
      if (terms.every((t) => hayTheme.includes(t))) {
        results.push({ kind: "theme", title: th.title, subtitle: lang === "en" ? "Theme" : "主题", themeId: th.id, score: 50 });
      }
      const projectList = th.projects ?? [];
      for (const p of projectList) {
        const base = `${p.title} ${p.summary} ${(p.tags || []).join(" ")}`.toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (base.includes(term)) score += 10;
        }
        if (p.updates && p.updates.length) {
          const updJoin = p.updates.map((u) => `${u.date} ${u.text}`).join(" ").toLowerCase();
          for (const term of terms) {
            if (updJoin.includes(term)) score += 3;
          }
        }
        if (score > 0) {
          results.push({ kind: "project", title: p.title, subtitle: th.title, slug: p.slug, themeId: th.id, score });
        }
        for (const tg of p.tags || []) {
          const low = tg.toLowerCase();
          if (terms.every((t) => low.includes(t))) {
            results.push({ kind: "tag", title: tg, subtitle: `${lang === "en" ? "Tag of" : ""} ${p.title}`.trim(), slug: p.slug, themeId: th.id, score: 5 });
          }
        }
      }
    }
    results.sort((a, b) => b.score - a.score || (a.kind > b.kind ? 1 : -1));
    setSearchResults(results.slice(0, 20));
  }, [debouncedQuery, lang, themes]);

  const jumpTo = (themeId?: string, slug?: string) => {
    if (themeId) {
      const sec = document.getElementById(themeId);
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (slug) {
      const id = `proj-${slug}`;
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => {
          el.classList.add("search-highlight");
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => el.classList.remove("search-highlight"), 1600);
        }, 300);
      }
    }
    setSearchOpen(false);
  };

  return {
    searchQuery,
    setSearchQuery,
    searchOpen,
    setSearchOpen,
    searchResults,
    jumpTo,
  };
}
