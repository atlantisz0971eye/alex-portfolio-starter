import { workspaceAuthorized } from "../../../lib/workspaceAuth";
import { validDocumentId, workspaceStorageConfigured, writeProgress } from "../../../lib/workspaceStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  let body: { id?: unknown; offset?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 512) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !validDocumentId(body.id) || typeof body.offset !== "number" || !Number.isSafeInteger(body.offset) || body.offset < 0) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    await writeProgress(body.id, body.offset);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
