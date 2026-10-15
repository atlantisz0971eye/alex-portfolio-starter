import { workspaceAuthorized } from "../../../lib/workspaceAuth";
import { readMarks, validDocumentId, workspaceStorageConfigured, writeMarks, type WorkspaceMark } from "../../../lib/workspaceStore";

export const runtime = "nodejs";

const COLORS = ["yellow", "green", "blue", "pink"];

async function guard() {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  return null;
}

function cleanMark(value: unknown): WorkspaceMark | null {
  if (!value || typeof value !== "object") return null;
  const mark = value as Record<string, unknown>;
  if (typeof mark.id !== "string" || mark.id.length > 64 || typeof mark.text !== "string" || typeof mark.color !== "string" || !COLORS.includes(mark.color)) return null;
  const integers = [mark.blockOffset, mark.from, mark.to];
  if (!integers.every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0) || (mark.to as number) <= (mark.from as number)) return null;
  return {
    id: mark.id,
    blockOffset: mark.blockOffset as number,
    from: mark.from as number,
    to: mark.to as number,
    text: mark.text.slice(0, 1800),
    color: mark.color as WorkspaceMark["color"],
    note: typeof mark.note === "string" && mark.note.trim() ? mark.note.slice(0, 2000) : undefined,
    createdAt: typeof mark.createdAt === "string" ? mark.createdAt.slice(0, 40) : new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!validDocumentId(id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    return Response.json({ marks: await readMarks(id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  let body: { id?: unknown; marks?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 600_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !validDocumentId(body.id) || !Array.isArray(body.marks) || body.marks.length > 1000) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const marks = body.marks.map(cleanMark);
  if (marks.some((mark) => !mark)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    await writeMarks(body.id, marks as WorkspaceMark[]);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
