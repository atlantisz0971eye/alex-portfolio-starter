"use client";

import dynamic from "next/dynamic";
import { useState, type KeyboardEvent } from "react";
import { Info, Search } from "lucide-react";
import type { SearchResult } from "../types/project";
import { glassButtonClass } from "../lib/ui";
const InfoDrawerContent = dynamic(() => import("./InfoDrawerContent"));

type HeaderBarProps = {
  lang: "en" | "zh";
  onToggleLang: () => void;
  searchQuery: string;
  searchOpen: boolean;
  results: SearchResult[];
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onResultClick: (result: SearchResult) => void;
  contentDump: string;
};

export function HeaderBar({
  lang,
  onToggleLang,
  searchQuery,
  searchOpen,
  results,
  onQueryChange,
  onFocus,
  onKeyDown,
  onResultClick,
  contentDump,
}: HeaderBarProps) {
  return (
    <header className="header-glass backdrop-blur bg-black/30 border-b border-white/10 text-white" style={{ paddingTop: "var(--safe-top)" }}>
      {/* Pad left on desktop to clear the fixed sidebar and align with main content */}
      <div className="w-full max-w-screen-xl mx-auto px-4 md:px-8 lg:px-10 md:pl-28 py-3 flex items-center gap-3">
        <h1 className="text-lg font-bold">Alex Projects</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 opacity-70" />
            <input
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={onFocus}
              onKeyDown={onKeyDown}
              placeholder={lang === "en" ? "Search the site…" : "站内搜索…"}
              className="pl-8 h-8 w-64 md:w-72 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-white/60 outline-none"
            />
            {searchOpen && searchQuery && (
              <div className="absolute left-0 mt-2 w-[22rem] md:w-[28rem] max-h-[60vh] overflow-auto rounded-xl bg-black/80 backdrop-blur border border-white/10 shadow-2xl z-50">
                {results.length === 0 ? (
                  <div className="p-4 text-sm text-white/70">{lang === "en" ? "No results" : "无结果"}</div>
                ) : (
                  <ul className="py-2">
                    {results.map((result, index) => (
                      <li key={`${result.kind}-${index}`}>
                        <button
                          className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-start gap-2"
                          onClick={() => onResultClick(result)}
                        >
                          <span className="text-xs badge shrink-0">
                            {result.kind === "theme"
                              ? lang === "en"
                                ? "Theme"
                                : "主题"
                              : result.kind === "project"
                              ? lang === "en"
                                ? "Project"
                                : "项目"
                              : result.kind === "tag"
                              ? lang === "en"
                                ? "Tag"
                                : "标签"
                              : lang === "en"
                              ? "Update"
                              : "更新"}
                          </span>
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
            className={`${glassButtonClass} text-sm`}
            aria-label={lang === "en" ? "Switch to Chinese" : "切换到英文"}
          >
            {lang === "en" ? "中文" : "EN"}
          </button>
          <InfoSection lang={lang} contentDump={contentDump} />
        </div>
      </div>
    </header>
  );
}

function InfoSection({ lang, contentDump }: { lang: "en" | "zh"; contentDump: string }) {
  const [open, setOpen] = useState(false);
  const infoLabel = lang === "en" ? "Open information drawer" : "打开信息抽屉";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="btn-ghost"
        aria-expanded={open}
        aria-label={infoLabel}
      >
        <Info className="w-4 h-4" />
      </button>
      {open && <InfoDrawerContent lang={lang} contentDump={contentDump} />}
    </div>
  );
}
