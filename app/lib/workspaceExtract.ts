import { PDFParse } from "pdf-parse";

export class ExtractError extends Error {
  constructor(readonly code: "invalid_pdf" | "pdf_encrypted" | "pdf_unreadable", readonly status = 422) {
    super(code);
  }
}

export type Extracted = { text: string; pageCount: number | null; ocrPending: number[] };

/** Pages with fewer visible characters than this are treated as having no text layer. */
const EMPTY_PAGE = 25;

/** Pages of stored "[Page N]" text that have no real text. */
export function emptyPages(text: string) {
  const empty: number[] = [];
  let total = 0;
  for (const match of text.matchAll(/\[Page (\d+)\]\n([\s\S]*?)(?=\n\n\[Page \d+\]\n|$)/g)) {
    total += 1;
    if (match[2].replace(/\s+/g, "").length < EMPTY_PAGE) empty.push(Number(match[1]));
  }
  return { empty, total };
}

const LIGATURES: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };

/** Letters spaced out for display ("c h a p t e r") come out of PDFs as single-letter words; join them. */
export function joinSpacedLetters(line: string) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 5) return line;
  const single = tokens.filter((token) => /^[\p{L}]$/u.test(token)).length;
  if (single / tokens.length < 0.7) return line;
  // Keep a leading page number; join the rest. Word gaps are lost, which is fine for text that is mostly a running head.
  const lead = /^\d+$/.test(tokens[0]) ? `${tokens[0]} ` : "";
  return lead + tokens.slice(lead ? 1 : 0).join("");
}

const headKey = (line: string) => line.toLowerCase().replace(/[\d\s\p{P}]+/gu, "");

/**
 * Cleans PDF page text: ligatures, letter-spaced words, and running heads and feet (the line at the top or bottom
 * of many pages that repeats the chapter or book title and the page number), which would otherwise be read as prose.
 */
export function cleanPdfPages(pages: { num: number; text: string }[]) {
  const lines = pages.map((page) => page.text.replace(/[ﬀ-ﬆ]/g, (char) => LIGATURES[char] ?? char).split("\n").map(joinSpacedLetters));
  const counts = new Map<string, number>();
  const edges = (list: string[]) => {
    const filled = list.map((line, index) => ({ line, index })).filter((item) => item.line.trim());
    return [...filled.slice(0, 2), ...filled.slice(-2)];
  };
  for (const list of lines) {
    const seen = new Set<string>();
    for (const { line } of edges(list)) {
      const key = headKey(line);
      if (key.length >= 3 && key.length <= 60 && !seen.has(key)) { seen.add(key); counts.set(key, (counts.get(key) ?? 0) + 1); }
    }
  }
  const threshold = Math.max(4, Math.round(pages.length * 0.06));
  return pages.map((page, index) => {
    const list = lines[index];
    const drop = new Set<number>();
    for (const { line, index: at } of edges(list)) {
      const key = headKey(line);
      // A bare page number is dropped too; real content is never one of the page's edge lines that repeats.
      if ((counts.get(key) ?? 0) >= threshold || /^\d{1,4}$/.test(line.trim())) drop.add(at);
    }
    return { num: page.num, text: list.filter((_, at) => !drop.has(at)).join("\n") };
  });
}

/**
 * Reads text out of an uploaded file. For PDFs, pages without a text layer are kept as empty
 * "[Page N]" sections and reported in `ocrPending` when a large share of the book is scanned.
 */
export async function extractDocument(bytes: Uint8Array, extension: string): Promise<Extracted> {
  let text = "";
  let pageCount: number | null = null;
  let ocrPending: number[] = [];
  if (extension === "pdf") {
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") throw new ExtractError("invalid_pdf");
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      pageCount = result.total;
      const cleaned = cleanPdfPages(result.pages);
      text = cleaned.map((page) => `[Page ${page.num}]\n${page.text}`).join("\n\n");
      const empty = result.pages.filter((page) => page.text.replace(/\s+/g, "").length < EMPTY_PAGE).map((page) => page.num);
      // A few blank or picture-only pages are normal; flag the book only when much of it has no text.
      ocrPending = result.pages.length > 0 && empty.length / result.pages.length >= 0.3 ? empty : [];
    } catch (cause) {
      throw new ExtractError(cause instanceof Error && cause.name === "PasswordException" ? "pdf_encrypted" : "pdf_unreadable");
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } else {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (extension === "html" || extension === "htm") {
      text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    }
  }
  return { text: text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim(), pageCount, ocrPending };
}
