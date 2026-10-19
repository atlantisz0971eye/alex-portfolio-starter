import { enrichDocument, type EnrichPart } from "../../../../../lib/bookEnrich";
import { workspaceAuthorized } from "../../../../../lib/workspaceAuth";
import { validDocumentId, workspaceStorageConfigured } from "../../../../../lib/workspaceStore";

export const runtime = "nodejs";
export const maxDuration = 120;

const PARTS: EnrichPart[] = ["info", "cover", "outline"];

/** Reads a book's real title, cover and contents. `parts` limits the work, for example to rebuilding the contents. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const { id } = await params;
  if (!validDocumentId(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { parts?: unknown };
  const parts = Array.isArray(body.parts) ? PARTS.filter((part) => (body.parts as unknown[]).includes(part)) : PARTS;
  try {
    const document = await enrichDocument(id, parts.length ? parts : PARTS);
    return document ? Response.json({ document }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    console.error("Enrich failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "processing_failed" }, { status: 502 });
  }
}
