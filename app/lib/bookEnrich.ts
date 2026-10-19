import { ENRICH_VERSION } from "./bookTitle";
import { bookInfoWithAi, chaptersFromContents, chaptersFromPages, makeCover, readPdfInfo } from "./bookMeta";
import { readDocument, readDocumentText, readOriginalFile, writeCover, writeDocument, type WorkspaceDocument } from "./workspaceStore";

export type EnrichPart = "info" | "cover" | "outline";

/**
 * Makes an imported book read like a real one: its true title and author, a cover from the first page, and a
 * table of contents taken from the PDF's bookmarks or, failing that, read from the printed contents by DeepSeek.
 */
export async function enrichDocument(id: string, parts: EnrichPart[] = ["info", "cover", "outline"]): Promise<WorkspaceDocument | null> {
  const document = await readDocument(id);
  if (!document || document.mimeType !== "application/pdf") return document;
  const text = (await readDocumentText(id)) ?? "";
  const original = await readOriginalFile(document);
  if (!original || original.statusCode !== 200) return document;
  const bytes = new Uint8Array(await new Response(original.stream).arrayBuffer());
  const next: WorkspaceDocument = { ...document };

  const meta = await readPdfInfo(bytes).catch(() => ({ title: undefined, author: undefined, outline: [] as { title: string; page: number }[] }));
  if (parts.includes("info")) {
    const front = text.replace(/\[Page \d+\]\n?/g, "").slice(0, 6000);
    const found = await bookInfoWithAi(document.name, meta, front).catch(() => ({ title: meta.title, author: meta.author }));
    if (found.title) next.title = found.title;
    if (found.author) next.author = found.author;
  }
  if (parts.includes("cover")) {
    const cover = await makeCover(bytes);
    if (cover) {
      await writeCover(id, cover);
      next.cover = true;
    }
  }
  if (parts.includes("outline")) {
    let chapters = meta.outline.length >= 3 ? chaptersFromPages(text, meta.outline) : [];
    let source: "pdf" | "ai" = "pdf";
    if (chapters.length < 3) {
      chapters = await chaptersFromContents(text).catch(() => []);
      source = "ai";
    }
    if (chapters.length >= 3) { next.outline = chapters; next.outlineSource = source; }
    else { delete next.outline; delete next.outlineSource; }
  }
  next.enrichedAt = new Date().toISOString();
  next.enrichVersion = ENRICH_VERSION;
  await writeDocument(next);
  return next;
}
