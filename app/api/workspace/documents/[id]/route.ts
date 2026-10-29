import { after } from "next/server";
import { enrichDocument } from "../../../../lib/bookEnrich";
import { currentUser, runAs } from "../../../../lib/workspaceScope";
import { workspaceAuthorized } from "../../../../lib/workspaceAuth";
import { emptyPages, ExtractError, extractDocument } from "../../../../lib/workspaceExtract";
import { deleteDocument, readDocument, readDocumentText, readOriginalFile, workspaceStorageConfigured, writeDocument } from "../../../../lib/workspaceStore";

export const runtime = "nodejs";
export const maxDuration = 120;

async function guard() {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  return null;
}

async function json(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 2048) return null;
    return await request.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Renames a document. The original file extension is kept when the new name has none. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const body = await json(request);
  const title = typeof body?.name === "string" ? body.name.replace(/[\r\n]+/g, " ").trim().slice(0, 170) : "";
  if (!title) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const document = await readDocument((await params).id);
    if (!document) return Response.json({ error: "not_found" }, { status: 404 });
    const extension = /\.[a-z0-9]{2,4}$/i.exec(document.name)?.[0] ?? "";
    const name = /\.[a-z0-9]{2,4}$/i.test(title) ? title : `${title}${extension}`;
    const updated = { ...document, name, title: title.replace(/\.[a-z0-9]{2,4}$/i, "") };
    await writeDocument(updated);
    return Response.json({ document: updated });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

/**
 * "rescan" re-checks the saved text for pages with no text (cheap; needed for books imported before OCR existed).
 * "reextract" reads the original file again and replaces the saved text.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const body = await json(request);
  const action = body?.action;
  if (action !== "rescan" && action !== "reextract") return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const document = await readDocument((await params).id);
    if (!document) return Response.json({ error: "not_found" }, { status: 404 });
    if (action === "rescan") {
      if (document.mimeType !== "application/pdf") return Response.json({ error: "unsupported_format" }, { status: 415 });
      const text = await readDocumentText(document.id);
      if (!text) return Response.json({ error: "not_found" }, { status: 404 });
      const { empty, total } = emptyPages(text);
      const updated = { ...document, ocrPending: empty.length ? empty : undefined };
      if (!empty.length) delete updated.ocrPending;
      await writeDocument(updated);
      return Response.json({ document: updated, emptyPages: empty.length, totalPages: total });
    }
    const original = await readOriginalFile(document);
    if (!original || original.statusCode !== 200) return Response.json({ error: "file_not_found" }, { status: 404 });
    const extension = document.mimeType === "application/pdf" ? "pdf" : (document.name.split(".").pop() ?? "txt").toLowerCase();
    const { text, pageCount, ocrPending } = await extractDocument(new Uint8Array(await new Response(original.stream).arrayBuffer()), extension);
    if (text.length < 40 && ocrPending.length === 0) return Response.json({ error: "no_extractable_text" }, { status: 422 });
    const updated = { ...document, pageCount, characterCount: text.length, ocrPending: ocrPending.length ? ocrPending : undefined };
    if (!ocrPending.length) delete updated.ocrPending;
    // The text changed, so chapter offsets read from the old text no longer apply.
    delete updated.outline;
    delete updated.outlineSource;
    await writeDocument(updated, text);
    // Background work has no cookie, so it carries the signed-in person with it.
    const me = await currentUser();
    after(() => runAs(me, async () => { await enrichDocument(document.id, ["outline"]).catch(() => undefined); }));
    return Response.json({ document: updated, emptyPages: ocrPending.length, totalPages: pageCount });
  } catch (error) {
    if (error instanceof ExtractError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "processing_failed" }, { status: 502 });
  }
}

/** Permanently removes the document, its text, notes, highlights and the original file. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const document = await readDocument((await params).id);
    if (!document) return Response.json({ error: "not_found" }, { status: 404 });
    await deleteDocument(document);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
