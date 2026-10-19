import { workspaceAuthorized } from "../../../../../lib/workspaceAuth";
import { readCover, validDocumentId, workspaceStorageConfigured } from "../../../../../lib/workspaceStore";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const { id } = await params;
  if (!validDocumentId(id)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const cover = await readCover(id);
    if (!cover || cover.statusCode !== 200) return Response.json({ error: "not_found" }, { status: 404 });
    return new Response(cover.stream, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
