import { PDFParse } from "pdf-parse";
import { get } from "@vercel/blob";
import { workspaceAuthorized } from "../../../../../lib/workspaceAuth";
import { readDocument, readDocumentText, workspaceStorageConfigured, writeDocument } from "../../../../../lib/workspaceStore";
import { recognize, VisionError, visionConfigured } from "../../../../../lib/vision";

export const runtime = "nodejs";
export const maxDuration = 120;

const BATCH = 4;

async function guard() {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  return null;
}

/** Splits stored text into its "[Page N]" sections. */
function pageSections(text: string) {
  const sections = new Map<number, string>();
  for (const match of text.matchAll(/\[Page (\d+)\]\n([\s\S]*?)(?=\n\n\[Page \d+\]\n|$)/g)) sections.set(Number(match[1]), match[2]);
  return sections;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const document = await readDocument((await params).id);
    if (!document) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ configured: visionConfigured(), pending: document.ocrPending ?? [], total: document.pageCount ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

/** Recognizes up to a few pending pages and writes their text into the document. The client calls this until nothing is pending. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  if (!visionConfigured()) return Response.json({ error: "ocr_not_configured" }, { status: 503 });
  let body: { pages?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 2000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const document = await readDocument((await params).id);
    if (!document || document.mimeType !== "application/pdf") return Response.json({ error: "not_found" }, { status: 404 });
    const pending = new Set(document.ocrPending ?? []);
    const pages = Array.isArray(body.pages) ? [...new Set(body.pages.map(Number))].filter((page) => pending.has(page)).slice(0, BATCH) : [];
    if (!pages.length) return Response.json({ done: [], pending: [...pending], characterCount: document.characterCount });

    const original = await get(document.filePath, { access: "private", useCache: false });
    if (!original || original.statusCode !== 200) return Response.json({ error: "file_not_found" }, { status: 404 });
    const bytes = new Uint8Array(await new Response(original.stream).arrayBuffer());
    const parser = new PDFParse({ data: bytes });
    let images: Uint8Array[];
    try {
      const shots = await parser.getScreenshot({ partial: pages, scale: 2.2, imageBuffer: true, imageDataUrl: false });
      images = pages.map((page) => shots.pages.find((shot) => shot.pageNumber === page)?.data ?? new Uint8Array());
    } finally {
      await parser.destroy().catch(() => undefined);
    }
    const texts = await recognize(images);

    const text = (await readDocumentText(document.id)) ?? "";
    const sections = pageSections(text);
    pages.forEach((page, index) => sections.set(page, texts[index].replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()));
    const merged = [...sections.entries()].sort((a, b) => a[0] - b[0]).map(([page, body]) => `[Page ${page}]\n${body}`).join("\n\n");
    const remaining = [...pending].filter((page) => !pages.includes(page));
    const updated = { ...document, characterCount: merged.length, ocrPending: remaining.length ? remaining : undefined };
    if (!remaining.length) delete updated.ocrPending;
    await writeDocument(updated, merged);
    return Response.json({ done: pages, pending: remaining, characterCount: merged.length });
  } catch (error) {
    if (error instanceof VisionError) return Response.json({ error: error.code }, { status: error.code === "ocr_not_configured" ? 503 : 502 });
    console.error("OCR failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "ocr_failed" }, { status: 502 });
  }
}
