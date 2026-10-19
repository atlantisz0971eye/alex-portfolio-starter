import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFParse } from "pdf-parse";
import type { Chapter } from "./workspaceOutline";
import { quickDeepSeek } from "./workspaceDeepSeek";

export type PdfInfo = { title?: string; author?: string; outline: { title: string; page: number }[] };

const NOT_CHAPTERS = /^(cover|front cover|back cover|title page|half title|copyright|series|dedication|blank)\b/i;

/** Title, author and bookmarks stored inside the PDF itself. Bookmarks are resolved to page numbers. */
export async function readPdfInfo(bytes: Uint8Array): Promise<PdfInfo> {
  const parser = new PDFParse({ data: bytes.slice() });
  try {
    const info = await parser.getInfo();
    const outline: PdfInfo["outline"] = [];
    if (info.outline?.length) {
      // pdf.js is the same copy pdf-parse uses; it resolves a bookmark's destination to a page.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true, disableFontFace: true, verbosity: 0 } as never).promise;
      try {
        const pageOf = async (dest: unknown): Promise<number | null> => {
          let target = dest;
          if (typeof target === "string") target = await doc.getDestination(target);
          if (!Array.isArray(target)) return null;
          const ref = target[0];
          if (typeof ref === "number") return ref + 1;
          try { return (await doc.getPageIndex(ref)) + 1; } catch { return null; }
        };
        // A single top-level entry (the book's own title) holds the real chapters one level down.
        let nodes = info.outline as { title: string; dest: unknown; items?: unknown[] }[];
        if (nodes.length <= 2 && nodes.some((node) => (node.items?.length ?? 0) >= 3)) nodes = nodes.flatMap((node) => (node.items as typeof nodes | undefined) ?? [node]);
        for (const node of nodes) {
          const page = await pageOf(node.dest);
          const title = node.title?.replace(/\s+/g, " ").trim();
          if (page && title && !NOT_CHAPTERS.test(title)) outline.push({ title, page });
        }
      } finally {
        await doc.destroy().catch(() => undefined);
      }
    }
    const clean = (value: unknown) => (typeof value === "string" && value.trim().length > 1 && !/^(untitled|microsoft word|unknown)/i.test(value.trim()) ? value.trim() : undefined);
    return { title: clean(info.info?.Title), author: clean(info.info?.Author), outline };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/** The first page as a small JPEG, for the library. */
export async function makeCover(bytes: Uint8Array): Promise<Uint8Array | null> {
  const parser = new PDFParse({ data: bytes.slice() });
  try {
    const shots = await parser.getScreenshot({ partial: [1], scale: 1.3, imageBuffer: true, imageDataUrl: false });
    const data = shots.pages[0]?.data;
    if (!data?.length) return null;
    const image = await loadImage(Buffer.from(data));
    const width = Math.min(520, image.width);
    const height = Math.round((image.height * width) / image.width);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return new Uint8Array(canvas.toBuffer("image/jpeg", 82));
  } catch {
    return null;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

const json = (raw: string | null) => {
  try { return JSON.parse((raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as Record<string, unknown>; } catch { return null; }
};

const INFO_SYSTEM = `你是图书编目员。用户给你一本书开头几页的文字（来自 PDF，可能有乱码或排版错位）以及 PDF 文件里的元数据。
请判断这本书正确的书名和作者。只输出 JSON：{"title":"书名（含副标题，用冒号连接）","author":"作者，多位用逗号分隔，不确定就给空字符串"}
规则：书名用书上印的原样（英文书保持英文，大小写规范成标题格式）；不要把文件名、出版社、ISBN、下载站名当成书名；不确定时宁可给元数据里的值。`;

/** Works out the real title and author from the PDF's metadata and the text of its first pages. */
export async function bookInfoWithAi(fileName: string, meta: PdfInfo, front: string): Promise<{ title?: string; author?: string }> {
  const raw = await quickDeepSeek(INFO_SYSTEM, `文件名：${fileName}\n元数据标题：${meta.title ?? "（无）"}\n元数据作者：${meta.author ?? "（无）"}\n\n开头文字：\n${front.slice(0, 5000)}`, 300, 30_000);
  const parsed = json(raw);
  const title = typeof parsed?.title === "string" ? parsed.title.trim().slice(0, 200) : "";
  const author = typeof parsed?.author === "string" ? parsed.author.trim().slice(0, 160) : "";
  return { title: title || meta.title, author: author || meta.author };
}

// ---- locating chapters in the stored text ---------------------------------------------------------------

type PageSpan = { num: number; start: number; bodyStart: number; end: number };

function pageSpans(text: string): PageSpan[] {
  const spans: PageSpan[] = [];
  const marker = /\[Page (\d+)\]\n?/g;
  for (let match = marker.exec(text); match; match = marker.exec(text)) spans.push({ num: Number(match[1]), start: match.index, bodyStart: match.index + match[0].length, end: text.length });
  for (let i = 0; i < spans.length - 1; i += 1) spans[i].end = spans[i + 1].start;
  return spans;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripNumber = (title: string) => title.replace(/^(chapter|part|section)\s+(\d+|[ivxlc]+|[a-z]+)\s*[.:·\-—–]*\s*/i, "").replace(/^\d{1,2}[.)]\s+/, "").trim();

/** Finds the heading line of a chapter on a page. Returns the offset of that line, or null when the title is not there. */
function locateOnPage(text: string, span: PageSpan, title: string): Chapter | null {
  const words = stripNumber(title).toLowerCase().split(/[\s\W_]+/).filter(Boolean);
  if (!words.length) return null;
  const pattern = new RegExp(words.map(escape).join("[\\s\\W_]*"), "i");
  const body = text.slice(span.bodyStart, span.end);
  const found = pattern.exec(body);
  if (!found) return null;
  const at = span.bodyStart + found.index;
  const lineStart = text.lastIndexOf("\n", at) + 1;
  const lineEnd = text.indexOf("\n", at);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  // A heading is a short line, not the title quoted in the middle of a paragraph.
  if (line.trim().length > Math.max(60, stripNumber(title).length + 40)) return null;
  let offset = lineStart + (line.length - line.trimStart().length);
  let heading = title;
  // "Chapter five" on the line above belongs to the heading; take both lines.
  const before = lineStart > span.bodyStart ? text.slice(text.lastIndexOf("\n", lineStart - 2) + 1, lineStart - 1) : "";
  if (/^\s*(chapter|part|section)\s+[\w-]+\s*$/i.test(before) && !/^(chapter|part|section)\s/i.test(title)) {
    heading = `${before.trim().replace(/^./, (char) => char.toUpperCase())} · ${stripNumber(title)}`;
    offset = lineStart - 1 - before.length + (before.length - before.trimStart().length);
  }
  return { title: heading, offset };
}

/** Turns bookmark entries (title + PDF page) into chapters. Titles that cannot be found are placed at the top of their page. */
export function chaptersFromPages(text: string, entries: { title: string; page: number }[]): Chapter[] {
  const spans = new Map(pageSpans(text).map((span) => [span.num, span]));
  const out: Chapter[] = [];
  let last = -1;
  for (const entry of entries) {
    const span = spans.get(entry.page);
    if (!span) continue;
    const located = locateOnPage(text, span, entry.title);
    const chapter: Chapter = located ?? { title: entry.title, offset: span.bodyStart, keep: true };
    if (chapter.offset <= last) continue;
    out.push(chapter);
    last = chapter.offset;
  }
  return out;
}

const TOC_SYSTEM = `你读一本书目录页的文字（从 PDF 提取，排版可能错乱）。只输出 JSON：{"entries":[{"number":"章节编号，没有就是空字符串","title":"标题","page":印刷页码整数}]}
要求：只列出目录里的主条目：前言/导言、各章、各部分、结语、附录、注释、参考文献、索引等；不要列副标题、小节。目录列表结束后出现的内容（例如插图清单、图注、正文）不是目录条目，不要列。按目录顺序。page 是目录里印的阿拉伯数字页码；目录里没有印页码（OCR 常丢掉页码）就给 null；罗马数字页码的条目也给 null。标题保持原文，不要自己编造目录里没有的标题。`;

/** The text following a "Contents" heading near the start of the book. */
function tocWindow(text: string) {
  const head = text.slice(0, 150_000);
  const candidates = [...head.matchAll(/^[ \t]*(?:table of )?contents[ \t]*$/gim)];
  for (const match of candidates) {
    const start = match.index ?? 0;
    const window = text.slice(start, start + 9000);
    const lines = window.split("\n").map((line) => line.trim()).filter(Boolean);
    const numbered = lines.filter((line) => /\b\d{1,3}\s*$/.test(line)).length;
    // Scanned books often lose the page numbers, leaving a plain list of short title lines.
    const titles = lines.slice(1, 40).filter((line) => line.length <= 70 && !/\[Page/.test(line) && !/[.,;]$/.test(line)).length;
    if (numbered >= 5 || titles >= 8) return { start, end: start + 9000, text: window };
  }
  return null;
}

/** Reads the printed contents with DeepSeek and finds each chapter in the text. Returns [] when it cannot be done reliably. */
export async function chaptersFromContents(text: string): Promise<Chapter[]> {
  const toc = tocWindow(text);
  if (!toc) return [];
  const parsed = json(await quickDeepSeek(TOC_SYSTEM, toc.text, 2500, 50_000));
  const entries = (Array.isArray(parsed?.entries) ? parsed.entries : []).map((item) => item as { number?: unknown; title?: unknown; page?: unknown })
    .filter((item) => typeof item.title === "string" && item.title.trim())
    .map((item) => ({ title: String(item.title).trim(), number: item.number ? String(item.number).trim() : "", page: Number.isInteger(item.page) ? Number(item.page) : null }));
  if (entries.length < 3) return [];

  const spans = pageSpans(text).filter((span) => span.start > toc.start + 200);
  const byNum = new Map(spans.map((span) => [span.num, span]));
  const out: Chapter[] = [];
  let last = toc.start + 2000;
  let shift: number | null = null;
  for (const entry of entries) {
    const label = entry.number && /^\d+$/.test(entry.number) ? `Chapter ${entry.number}` : "";
    // With a printed page number the chapter is looked for near it; without one, anywhere after the previous chapter.
    const entryPage = entry.page;
    const near = shift === null || entryPage === null ? [] : [0, 1, -1, 2, -2].map((step) => byNum.get(entryPage + (shift as number) + step));
    const order: PageSpan[] = shift !== null && entryPage !== null ? near.filter((span): span is PageSpan => !!span) : spans;
    for (const span of order) {
      if (span.end <= last) continue;
      const located = locateOnPage(text, span, entry.title);
      if (!located || located.offset <= last) continue;
      out.push({ ...located, title: located.title.includes(" · ") ? located.title : label ? `${label} · ${entry.title}` : entry.title });
      last = located.offset;
      if (shift === null && entryPage !== null) shift = span.num - entryPage;
      break;
    }
  }
  // Reliable only when most of the printed entries were found, in order.
  return out.length >= 3 && out.length >= entries.length * 0.6 ? out : [];
}
