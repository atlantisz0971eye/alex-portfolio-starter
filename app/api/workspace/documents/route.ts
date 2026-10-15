import { get } from "@vercel/blob";
import { ExtractError, extractDocument } from "../../../lib/workspaceExtract";
import { workspaceAuthorized } from "../../../lib/workspaceAuth";
import { buildSegments, detectChapters, segmentIndexFor } from "../../../lib/workspaceOutline";
import {
  discardUpload,
  listDocuments,
  readDocument,
  readDocumentText,
  readProgress,
  validDocumentId,
  workspaceStorageConfigured,
  writeDocument,
  type WorkspaceDocument,
} from "../../../lib/workspaceStore";

export const runtime = "nodejs";
export const maxDuration = 120;

// Keep the full source in storage; the reader loads one segment at a time.
function readerWindow(text: string, target: { segment?: number; offset?: number }) {
  const chapters = detectChapters(text);
  const starts = buildSegments(text, chapters);
  const index = target.segment !== undefined
    ? Math.max(0, Math.min(starts.length - 1, target.segment))
    : segmentIndexFor(starts, Math.min(target.offset ?? 0, Math.max(0, text.length - 1)));
  const start = starts[index];
  const end = starts[index + 1] ?? text.length;
  return { text: text.slice(start, end), start, end, index, starts, chapters, totalLength: text.length };
}

async function guard() {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  return null;
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const segmentParam = params.get("segment");
  const offsetParam = params.get("offset");
  const segment = segmentParam === null ? undefined : Number(segmentParam);
  const offset = offsetParam === null ? undefined : Number(offsetParam);
  if ((segment !== undefined && (!Number.isSafeInteger(segment) || segment < 0)) || (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0))) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    if (!id) return Response.json({ documents: await listDocuments() }, { headers: { "Cache-Control": "private, no-store" } });
    const document = await readDocument(id);
    if (!document) return Response.json({ error: "not_found" }, { status: 404 });
    const text = await readDocumentText(id);
    const pageParam = params.get("page");
    if (pageParam !== null) {
      // Resolve a printed page number (a citation) to a position in the text.
      const page = Number(pageParam);
      const marker = `[Page ${page}]`;
      const at = Number.isSafeInteger(page) && page > 0 ? (text ?? "").indexOf(marker) : -1;
      // Land on the first text after the marker, not the passage before it.
      return at === -1 ? Response.json({ error: "not_found" }, { status: 404 }) : Response.json({ offset: at + marker.length + 1 }, { headers: { "Cache-Control": "private, no-store" } });
    }
    // Without an explicit target, reopen where the reader left off.
    const saved = segment === undefined && offset === undefined ? await readProgress(id).catch(() => null) : null;
    const window = readerWindow(text ?? "", { segment, offset: offset ?? saved ?? 0 });
    return Response.json({ document, ...window, target: offset ?? saved ?? window.start }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 2048) throw new Error("too large");
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const id = asText(body.id);
  const pathname = asText(body.pathname);
  const name = asText(body.name).slice(0, 180);
  if (!validDocumentId(id) || !pathname.startsWith(`workspace/files/${id}/`) || !name) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  // From here the upload exists in storage, so every failure must remove it.
  const fail = async (error: string, status: number) => {
    await discardUpload(id, pathname);
    return Response.json({ error }, { status });
  };
  const extension = name.split(".").pop()?.toLowerCase();
  if (!extension || !["pdf", "txt", "md", "html", "htm"].includes(extension)) {
    return fail("unsupported_format", 415);
  }
  try {
    // An existing record owns this path, so leave its files alone.
    if (await readDocument(id)) return Response.json({ error: "already_exists" }, { status: 409 });
    const original = await get(pathname, { access: "private", useCache: false });
    if (!original || original.statusCode !== 200) return fail("file_not_found", 404);
    if (original.blob.size > 25 * 1024 * 1024) return fail("file_too_large", 413);
    const bytes = new Uint8Array(await new Response(original.stream).arrayBuffer());
    let extracted: Awaited<ReturnType<typeof extractDocument>>;
    try {
      extracted = await extractDocument(bytes, extension);
    } catch (cause) {
      if (cause instanceof ExtractError) return fail(cause.code, cause.status);
      throw cause;
    }
    const { text: extractedText, pageCount, ocrPending } = extracted;
    if (extractedText.length < 40 && ocrPending.length === 0) return fail("no_extractable_text", 422);
    const document: WorkspaceDocument = {
      id,
      name,
      mimeType: extension === "pdf" ? "application/pdf" : "text/plain",
      filePath: pathname,
      textPath: `workspace/text/${id}.txt`,
      createdAt: new Date().toISOString(),
      pageCount,
      characterCount: extractedText.length,
      ...(ocrPending.length ? { ocrPending } : {}),
    };
    try {
      await writeDocument(document, extractedText);
    } catch {
      return fail("storage_failed", 502);
    }
    return Response.json({ document, ...readerWindow(extractedText, { segment: 0 }), target: 0 }, { status: 201 });
  } catch {
    return fail("processing_failed", 502);
  }
}
