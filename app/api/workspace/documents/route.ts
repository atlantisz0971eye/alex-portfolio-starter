import { PDFParse } from "pdf-parse";
import { del, get } from "@vercel/blob";
import { workspaceAuthorized } from "../../../lib/workspaceAuth";
import {
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
  const extension = name.split(".").pop()?.toLowerCase();
  if (!extension || !["pdf", "txt", "md", "html", "htm"].includes(extension)) {
    return Response.json({ error: "unsupported_format" }, { status: 415 });
  }
  try {
    if (await readDocument(id)) return Response.json({ error: "already_exists" }, { status: 409 });
    const original = await get(pathname, { access: "private", useCache: false });
    if (!original || original.statusCode !== 200 || original.blob.size > 25 * 1024 * 1024) {
      return Response.json({ error: "file_not_found" }, { status: 404 });
    }
    const bytes = new Uint8Array(await new Response(original.stream).arrayBuffer());
    let extracted = "";
    let pageCount: number | null = null;
    if (extension === "pdf") {
      if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
        return Response.json({ error: "invalid_pdf" }, { status: 422 });
      }
      const parser = new PDFParse({ data: bytes });
      try {
        const result = await parser.getText();
        pageCount = result.total;
        extracted = result.pages.map((page) => `[Page ${page.num}]\n${page.text}`).join("\n\n");
      } finally {
        await parser.destroy();
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
    if (extracted.length < 40) {
      await del(pathname);
      return Response.json({ error: "no_extractable_text" }, { status: 422 });
    }
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
    await writeDocument(document, extracted);
    return Response.json({ document, ...readerSection(extracted) }, { status: 201 });
  } catch {
    return Response.json({ error: "processing_failed" }, { status: 502 });
  }
}
