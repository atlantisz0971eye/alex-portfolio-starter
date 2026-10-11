"use client";

import { useMemo, useState } from "react";
import { searchSite } from "../lib/siteSearch";
import type { Language, SearchResult } from "../types/project";

export function useSearch(lang: Language) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchResults = useMemo(() => searchSite(searchQuery, lang), [searchQuery, lang]);

  const jumpTo = (result: SearchResult) => {
    const section = result.themeId ? document.getElementById(result.themeId) : null;
    section?.scrollIntoView({ behavior: "smooth", block: "start" });

    let target: HTMLElement | null = section;
    if (result.kind === "project" && result.slug) {
      window.dispatchEvent(new CustomEvent("portfolio:open", { detail: { slug: result.slug } }));
      target = document.getElementById(`proj-${result.slug}`);
    } else if (result.kind === "gallery" && result.slug) {
      window.dispatchEvent(new CustomEvent("gallery:open", { detail: { slug: result.slug } }));
      target = document.getElementById(`gallery-${result.slug}`);
    } else if (result.kind === "orbit" && result.orbitCategory && result.orbitPoint !== undefined) {
      window.dispatchEvent(new CustomEvent("bio:open", {
        detail: { tab: "entanglement", selection: { category: result.orbitCategory, point: result.orbitPoint } },
      }));
      target = document.getElementById("bio");
    } else if ((result.kind === "bio" || result.kind === "education") && result.slug) {
      window.dispatchEvent(new CustomEvent("bio:open", { detail: { tab: result.slug } }));
      target = document.getElementById("bio");
    }

    if (target) {
      window.setTimeout(() => {
        const destination = result.kind === "orbit"
          ? document.querySelector<HTMLElement>(".bio-panel--entanglement") ?? target
          : target;
        destination?.classList.add("search-highlight");
        destination?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => destination?.classList.remove("search-highlight"), 1600);
      }, 260);
    }
    setSearchOpen(false);
    setSearchQuery("");
  };

  return { searchQuery, setSearchQuery, searchOpen, setSearchOpen, searchResults, jumpTo };
}
