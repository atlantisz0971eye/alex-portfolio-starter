import { workspaceAuthorized } from "../../../../../lib/workspaceAuth";
import { readDocument, readOriginalFile, workspaceStorageConfigured } from "../../../../../lib/workspaceStore";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  try {
    const document = await readDocument((await params).id);
    if (!document) return Response.json({ error: "not_found" }, { status: 404 });
    const original = await readOriginalFile(document);
    if (!original || original.statusCode !== 200) return Response.json({ error: "not_found" }, { status: 404 });
    return new Response(original.stream, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `inline; filename="${document.name.replace(/["\\\r\n]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
