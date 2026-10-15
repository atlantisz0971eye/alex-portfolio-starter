import { PDFParse } from "pdf-parse";
import { get } from "@vercel/blob";
import { workspaceAuthorized } from "../../../lib/workspaceAuth";
import {
  discardUpload,
  listDocuments,
  readDocument,
  readDocumentText,
  validDocumentId,
  workspaceStorageConfigured,
  writeDocument,
  type WorkspaceDocument,
} from "../../../lib/workspaceStore";

export const runtime = "nodejs";
export const maxDuration = 120;

// Keep the full source in storage, but bound each reader response for books.
function readerSection(text: string, requested = 0) {
  const size = 30_000;
  const sectionCount = Math.max(1, Math.ceil(text.length / size));
  const section = Math.max(0, Math.min(sectionCount - 1, Math.floor(requested)));
  return { text: text.slice(section * size, (section + 1) * size), section, sectionCount };
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
  const section = Number(params.get("section") ?? 0);
  if (!Number.isSafeInteger(section) || section < 0) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    if (!id) return Response.json({ documents: await listDocuments() }, { headers: { "Cache-Control": "private, no-store" } });
    const document = await readDocument(id);
    if (!document) return Response.json({ error: "not_found" }, { status: 404 });
    const text = await readDocumentText(id);
    return Response.json({ document, ...readerSection(text ?? "", section) }, { headers: { "Cache-Control": "private, no-store" } });
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
    let extracted = "";
    let pageCount: number | null = null;
    if (extension === "pdf") {
      if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") return fail("invalid_pdf", 422);
      const parser = new PDFParse({ data: bytes });
      try {
        const result = await parser.getText();
        pageCount = result.total;
        extracted = result.pages.map((page) => `[Page ${page.num}]\n${page.text}`).join("\n\n");
      } catch (cause) {
        const reason = cause instanceof Error ? cause.name : "";
        return fail(reason === "PasswordException" ? "pdf_encrypted" : "pdf_unreadable", 422);
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    } else {
      extracted = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (extension === "html" || extension === "htm") {
        extracted = extracted.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ");
      }
    }
    extracted = extracted.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
    if (extracted.length < 40) return fail("no_extractable_text", 422);
    const document: WorkspaceDocument = {
      id,
      name,
      mimeType: extension === "pdf" ? "application/pdf" : "text/plain",
      filePath: pathname,
      textPath: `workspace/text/${id}.txt`,
      createdAt: new Date().toISOString(),
      pageCount,
      characterCount: extracted.length,
    };
    try {
      await writeDocument(document, extracted);
    } catch {
      return fail("storage_failed", 502);
    }
    return Response.json({ document, ...readerSection(extracted) }, { status: 201 });
  } catch {
    return fail("processing_failed", 502);
  }
}
