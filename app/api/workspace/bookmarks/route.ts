import { workspaceAuthorized } from "../../../lib/workspaceAuth";
import { readBookmarks, validDocumentId, workspaceStorageConfigured, writeBookmarks, type WorkspaceBookmark } from "../../../lib/workspaceStore";

export const runtime = "nodejs";

async function guard() {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  return null;
}

function cleanBookmark(value: unknown): WorkspaceBookmark | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.length > 64 || typeof item.label !== "string") return null;
  if (typeof item.offset !== "number" || !Number.isSafeInteger(item.offset) || item.offset < 0) return null;
  const page = typeof item.page === "number" && Number.isSafeInteger(item.page) && item.page > 0 ? item.page : undefined;
  return {
    id: item.id,
    offset: item.offset,
    page,
    chapter: typeof item.chapter === "string" && item.chapter.trim() ? item.chapter.slice(0, 200) : undefined,
    label: item.label.slice(0, 200),
    createdAt: typeof item.createdAt === "string" ? item.createdAt.slice(0, 40) : new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!validDocumentId(id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    return Response.json({ bookmarks: await readBookmarks(id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  let body: { id?: unknown; bookmarks?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 300_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !validDocumentId(body.id) || !Array.isArray(body.bookmarks) || body.bookmarks.length > 500) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const bookmarks = body.bookmarks.map(cleanBookmark);
  if (bookmarks.some((item) => !item)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    await writeBookmarks(body.id, bookmarks as WorkspaceBookmark[]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
