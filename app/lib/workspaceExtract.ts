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
      text = result.pages.map((page) => `[Page ${page.num}]\n${page.text}`).join("\n\n");
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
