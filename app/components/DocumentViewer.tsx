"use client";

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { MediaGroup, Project } from "../types/project";

type DocumentViewerProps = {
  project: Project;
  lang: "en" | "zh";
  cacheKey: string;
  cache: Record<string, string | null>;
  setCache: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  docGroups?: MediaGroup[];
  onBack: () => void;
};

export function DocumentViewer({
  project,
  lang,
  cacheKey,
  cache,
  setCache,
  docGroups,
  onBack,
}: DocumentViewerProps) {
  const source = project.docTxt;
  const pdfHref = project.docPdf;
  const cachedValue = cache[cacheKey];
  const docDownloads: { label: string; href: string }[] = [];

  if (pdfHref) {
    docDownloads.push({
      label: lang === "en" ? "Primary PDF" : "主 PDF",
      href: pdfHref,
    });
  }
  if (docGroups?.length) {
    docGroups.forEach((group) => {
      group.items.forEach((item, idx) => {
        const suffix = group.items.length > 1 ? ` ${idx + 1}` : "";
        docDownloads.push({ label: `${group.label}${suffix}`, href: item });
      });
    });
  }

  const renderDownloads = () => {
    if (!docDownloads.length) return null;
    return (
      <div className="flex flex-col gap-3">
        {docDownloads.map((doc, idx) => (
          <div key={`${doc.href}-${idx}`} className="flex flex-wrap items-center justify-center gap-2">
            <a
              href={doc.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white transition-colors duration-200"
            >
              👁️ {lang === "en" ? "View" : "查看"} — {doc.label}
            </a>
            <a
              href={doc.href}
              download
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-white/20 bg-white/5 hover:bg-white/15 text-white/90 transition-colors duration-200"
            >
              ⬇ {lang === "en" ? "Download" : "下载"} — {doc.label}
            </a>
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (!source) return;
    if (cachedValue !== undefined) return;
    const controller = new AbortController();
    fetch(source, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(response.statusText);
        return response.text();
      })
      .then((text) => setCache((prev) => ({ ...prev, [cacheKey]: text })))
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setCache((prev) => ({ ...prev, [cacheKey]: "" }));
      });
    return () => controller.abort();
  }, [cacheKey, cachedValue, setCache, source]);

  if (!source && docDownloads.length === 0) {
    return (
      <div className="rounded-2xl overflow-hidden bg-black/40 p-6 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack} className="btn-ghost">
            ← {lang === "en" ? "Back" : "返回"}
          </button>
          <span className="badge">TXT</span>
        </div>
        <div className="text-white/70 text-sm">
          {lang === "en" ? "No document configured." : "未配置说明文档。"}
        </div>
      </div>
    );
  }

  if (source) {
    if (cachedValue === undefined) {
      return (
        <div className="rounded-2xl overflow-hidden bg-black/40 p-6 border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <button onClick={onBack} className="btn-ghost">
              ← {lang === "en" ? "Back" : "返回"}
            </button>
            <span className="badge">TXT/MD</span>
          </div>
          <div className="text-white/70 text-sm">
            {lang === "en" ? "Loading document…" : "正在加载文档…"}
          </div>
        </div>
      );
    }

    if (!cachedValue) {
      return (
        <div className="rounded-2xl overflow-hidden bg-black/40 p-6 border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <button onClick={onBack} className="btn-ghost">
              ← {lang === "en" ? "Back" : "返回"}
            </button>
            <span className="badge">TXT/MD</span>
          </div>
          <div className="card text-center py-10">
            {lang === "en" ? "Document not found." : "未找到说明文档。"}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl overflow-hidden bg-black/40 p-6 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="btn-ghost">
            ← {lang === "en" ? "Back" : "返回"}
          </button>
          <span className="badge">TXT/MD</span>
        </div>
        <article className="prose prose-invert max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:my-2 prose-li:my-1 prose-a:text-white/90 prose-strong:text-white">
          <ReactMarkdown>{cachedValue}</ReactMarkdown>
        </article>
        {renderDownloads()}
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden bg-black/40 p-6 border border-white/10 space-y-4">
      <div className="flex items-center justify-between mb-1">
        <button onClick={onBack} className="btn-ghost">
          ← {lang === "en" ? "Back" : "返回"}
        </button>
        <span className="badge">PDF</span>
      </div>
      <div className="text-white/85 text-sm">
        {lang === "en" ? "This project provides downloadable documents." : "本项目提供可下载文档。"}
      </div>
      {renderDownloads()}
    </div>
  );
}
