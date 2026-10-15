import { DeepSeekError, deepSeekErrorCode } from "../../../lib/workspaceDeepSeek";
import { workspaceAuthorized } from "../../../lib/workspaceAuth";
import { needsTranslation, readTranslations, writeTranslations, type BlockInput } from "../../../lib/translationStore";
import { translateBlocks } from "../../../lib/workspaceTranslate";
import { readDocument, validDocumentId, workspaceStorageConfigured } from "../../../lib/workspaceStore";

export const runtime = "nodejs";
export const maxDuration = 120;

const calls = new Map<string, { count: number; until: number }>();

/**
 * Paragraph translations for the bilingual reader. "cache" only returns what is saved; "translate" also
 * translates what is missing and saves it, so each paragraph is only ever translated once.
 */
export async function POST(request: Request) {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  let body: { documentId?: unknown; blocks?: unknown; mode?: unknown; force?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 60_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const mode = body.mode === "translate" ? "translate" : "cache";
  const blocks: BlockInput[] = Array.isArray(body.blocks)
    ? body.blocks.slice(0, mode === "cache" ? 120 : 8).filter((item): item is BlockInput => !!item && typeof item === "object" && Number.isSafeInteger((item as BlockInput).offset) && (item as BlockInput).offset >= 0 && typeof (item as BlockInput).text === "string" && (item as BlockInput).text.length > 0 && (item as BlockInput).text.length <= 2600)
    : [];
  if (!validDocumentId(documentId) || !blocks.length) return Response.json({ error: "invalid_request" }, { status: 400 });

  try {
    if (!(await readDocument(documentId))) return Response.json({ error: "not_found" }, { status: 404 });
    const wanted = blocks.filter((block) => needsTranslation(block.text));
    const skipped = blocks.filter((block) => !needsTranslation(block.text)).map((block) => block.offset);
    const cached = body.force === true ? new Map<number, string>() : await readTranslations(documentId, wanted);
    const missing = wanted.filter((block) => !cached.has(block.offset));
    if (mode === "cache" || !missing.length) {
      return Response.json({ translations: Object.fromEntries(cached), missing: missing.map((block) => block.offset), skipped });
    }

    const key = request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local";
    const now = Date.now();
    const previous = calls.get(key);
    const count = previous && previous.until > now ? previous.count : 0;
    if (count >= 40) return Response.json({ error: "rate_limited" }, { status: 429 });
    calls.set(key, { count: count + 1, until: now + 60_000 });

    let fresh: Map<number, string>;
    try {
      fresh = await translateBlocks(missing, request.signal);
    } catch (error) {
      return Response.json({ error: deepSeekErrorCode(error instanceof DeepSeekError ? error.status : 502) }, { status: 502 });
    }
    await writeTranslations(documentId, missing.filter((block) => fresh.has(block.offset)).map((block) => ({ block, translation: fresh.get(block.offset)! })));
    const translations = { ...Object.fromEntries(cached), ...Object.fromEntries(fresh) };
    return Response.json({ translations, missing: missing.filter((block) => !fresh.has(block.offset)).map((block) => block.offset), skipped });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
