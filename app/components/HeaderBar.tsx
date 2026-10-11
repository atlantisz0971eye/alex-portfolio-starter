"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import type { SearchResult } from "../types/project";
import { glassButtonClass } from "../lib/ui";

type HeaderBarProps = {
  lang: "en" | "zh";
  onToggleLang: () => void;
  searchQuery: string;
  searchOpen: boolean;
  activeResultIndex: number;
  results: SearchResult[];
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onResultClick: (result: SearchResult) => void;
};

export function HeaderBar({
  lang,
  onToggleLang,
  searchQuery,
  searchOpen,
  activeResultIndex,
  results,
  onQueryChange,
  onFocus,
  onKeyDown,
  onResultClick,
}: HeaderBarProps) {
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <header className="header-glass attention-header text-white" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="header-inner w-full max-w-screen-xl mx-auto px-4 md:px-8 lg:px-10 md:pl-28 py-3 flex items-center gap-3">
        <h1 className="header-title text-lg font-bold">Alex Projects</h1>
        <div className="header-actions ml-auto flex items-center gap-2">
          <div className="header-search relative" onClick={(e) => e.stopPropagation()}>
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 opacity-70" />
            <input
              ref={searchInput}
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={onFocus}
              onKeyDown={onKeyDown}
              placeholder={lang === "en" ? "Search the site…" : "站内搜索…"}
              aria-label={lang === "en" ? "Search the site" : "站内搜索"}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen && !!searchQuery}
              aria-controls="site-search-results"
              aria-activedescendant={searchOpen && searchQuery && results.length ? `site-search-result-${activeResultIndex}` : undefined}
              className="header-search-input pl-8 h-8 w-64 md:w-72 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-white/60 outline-none"
            />
            {searchOpen && searchQuery && (
              <div id="site-search-results" className="header-search-results absolute left-0 mt-2 w-[22rem] md:w-[28rem] max-h-[60vh] overflow-auto rounded-xl bg-black/80 backdrop-blur border border-white/10 shadow-2xl z-50">
                {results.length === 0 ? (
                  <div className="p-4 text-sm text-white/70" role="status">{lang === "en" ? "No results" : "无结果"}</div>
                ) : (
                  <ul className="py-2" role="listbox" aria-label={lang === "en" ? "Search results" : "搜索结果"}>
                    {results.map((result, index) => (
                      <li key={`${result.kind}-${result.slug ?? result.themeId}-${result.orbitCategory ?? ""}-${result.orbitPoint ?? index}`} role="presentation">
                        <button
                          id={`site-search-result-${index}`}
                          role="option"
                          aria-selected={activeResultIndex === index}
                          className={`w-full text-left px-3 py-2 hover:bg-white/10 flex items-start gap-2 ${activeResultIndex === index ? "bg-white/10" : ""}`}
                          onClick={() => onResultClick(result)}
                        >
                          <span className="text-xs badge shrink-0">{searchKindLabel(result.kind, lang)}</span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{result.title}</div>
                            {result.subtitle && <div className="text-xs text-white/70 truncate">{result.subtitle}</div>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onToggleLang}
            className={`header-language ${glassButtonClass} text-sm`}
            aria-label={lang === "en" ? "Switch to Chinese" : "切换到英文"}
          >
            {lang === "en" ? "中文" : "EN"}
          </button>
        </div>
      </div>
    </header>
  );
}

function searchKindLabel(kind: SearchResult["kind"], lang: "en" | "zh") {
  const labels = {
    theme: { en: "Theme", zh: "主题" },
    project: { en: "Project", zh: "项目" },
    gallery: { en: "Gallery", zh: "画廊" },
    bio: { en: "Bio", zh: "简介" },
    education: { en: "Education", zh: "教育" },
    orbit: { en: "Reference", zh: "参照" },
  } as const;
  return labels[kind][lang];
}
