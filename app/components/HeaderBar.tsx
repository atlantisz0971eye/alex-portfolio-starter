"use client";

import { useState, type KeyboardEvent } from "react";
import { Info, Search } from "lucide-react";
import type { SearchResult } from "../types/project";

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
            className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 backdrop-blur text-sm hover:bg-white/10 transition-all duration-200 shadow-sm hover:shadow scale-100 hover:scale-105"
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

  return (
    <div className="relative">
      <button onClick={() => setOpen((prev) => !prev)} className="btn-ghost" aria-expanded={open}>
        <Info className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[600px] max-w-[90vw] card text-sm space-y-4 z-50 backdrop-blur">
          <div>
            <h4 className="font-semibold mb-2">{lang === "en" ? "Information Architecture (IA)" : "信息架构（IA）"}</h4>
            <pre className="whitespace-pre-wrap text-xs bg-white/5 p-3 rounded-lg border border-white/10">
{lang === "en" ? 
`Site Root
├── Home (Overview: Technology · Rumination · Connection intro + latest/featured works)
├── Technology / 科技
│   ├── Fitting Reality (Project page)
│   └── Electromagnetic Decay (Project page)
├── Rumination / 反刍
│   └── Dys/Utopia (Project page)
├── Connection / 连接
│   └── Roots / Hometown Series (Ongoing, phase logs/material wall)
├── About (Artist statement / CV / Statement)
└── Contact (Contact info / Social media)`
:
`Site Root
├── Home (总述：科技·反刍·连接引子 + 最新/精选作品)
├── 科技 / Technology
│   ├── 拟合现实 (项目页)
│   └── 电磁腐烂 (项目页)
├── 反刍 / Rumination
│   └── Dys/Utopia (项目页)
├── 连接 / Connection
│   └── 根源/家乡系列 (进行中，阶段性日志/素材墙)
├── About (艺术家自述 / CV / Statement)
└── Contact (联系方式 / 社媒)`}
            </pre>
          </div>
          <div>
            <h4 className="font-semibold mb-2">{lang === "en" ? "Content Data Structure (Example)" : "内容数据结构（示意）"}</h4>
            <pre className="whitespace-pre-wrap text-xs bg-white/5 p-3 rounded-lg border border-white/10 overflow-auto max-h-[240px]">
{contentDump}
            </pre>
          </div>
          <div className="text-white/80 text-sm leading-relaxed">
            <p className="mb-2">{lang === "en" ? "Implementation Suggestions:" : "落地建议："}</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>{lang === "en" ? "Split projects into MDX/JSON; generate project pages with dynamic routes /[theme]/[slug]." : "将 projects 拆成 MDX/JSON；用动态路由 /[theme]/[slug] 生成项目页。"}</li>
              <li>{lang === "en" ? "Content hosting: local MDX (Contentlayer), or Headless CMS (Sanity/Strapi/Contentful)." : "内容托管：本地 MDX（Contentlayer），或 Headless CMS（Sanity/Strapi/Contentful）。"}</li>
              <li>{lang === "en" ? "Deployment: Vercel/Netlify." : "部署：Vercel/Netlify。"}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
