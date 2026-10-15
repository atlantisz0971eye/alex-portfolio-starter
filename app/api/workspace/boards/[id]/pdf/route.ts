import { PDFParse } from "pdf-parse";
import { boardFailure } from "../../../../../lib/boardHttp";
import { BoardError, readBoard, saveAsset, validBoardId } from "../../../../../lib/boardStore";
import { calendarGuard } from "../../../../../lib/calendarGuard";
import { readDocument, readOriginalFile } from "../../../../../lib/workspaceStore";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_PAGES = 12;

/**
 * Renders pages of a PDF as images. The PDF is either a document already in the library (JSON body with
 * `documentId`) or a small file sent as the raw body (`?pages=1,2,3`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!validBoardId(id) || !(await readBoard(id))) return Response.json({ error: "not_found" }, { status: 404 });
    let bytes: Uint8Array;
    let pages: number[];
    if (request.headers.get("content-type") === "application/pdf") {
      bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > 4_000_000) throw new BoardError("That PDF is too large to send directly. Add it to the library and import it from there.");
      pages = (new URL(request.url).searchParams.get("pages") ?? "1").split(",").map(Number);
    } else {
      const body = await request.json().catch(() => ({})) as { documentId?: unknown; pages?: unknown };
      const document = typeof body.documentId === "string" ? await readDocument(body.documentId) : null;
      if (!document || document.mimeType !== "application/pdf") return Response.json({ error: "not_found" }, { status: 404 });
      const original = await readOriginalFile(document);
      if (!original || original.statusCode !== 200) return Response.json({ error: "not_found" }, { status: 404 });
      bytes = new Uint8Array(await new Response(original.stream).arrayBuffer());
      pages = Array.isArray(body.pages) ? body.pages.map(Number) : [1];
    }
    pages = [...new Set(pages)].filter((page) => Number.isInteger(page) && page > 0).slice(0, MAX_PAGES);
    if (!pages.length) throw new BoardError("Choose at least one page.");

    const parser = new PDFParse({ data: bytes });
    try {
      const shots = await parser.getScreenshot({ partial: pages, scale: 1.6, imageBuffer: true, imageDataUrl: false });
      const out: { page: number; name: string; width: number; height: number }[] = [];
      for (const shot of shots.pages) {
        out.push({ page: shot.pageNumber, name: await saveAsset(id, shot.data, "image/png"), width: shot.width, height: shot.height });
      }
      return Response.json({ pages: out.sort((a, b) => a.page - b.page), total: shots.total });
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (error) {
    return boardFailure(error);
  }
}
