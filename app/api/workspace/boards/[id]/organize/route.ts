import { organizeNotes } from "../../../../../lib/boardOrganize";
import { validBoardId } from "../../../../../lib/boardStore";
import { calendarGuard } from "../../../../../lib/calendarGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Turns recognized note text into proposed nodes. Nothing is stored here; the client places them after confirmation. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await calendarGuard();
  if (denied) return denied;
  if (!process.env.DEEPSEEK_API_KEY) return Response.json({ error: "ai_not_configured" }, { status: 503 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { text?: unknown };
  if (!validBoardId(id) || typeof body.text !== "string" || body.text.trim().length < 3) return Response.json({ error: "invalid_request" }, { status: 400 });
  const result = await organizeNotes(body.text);
  return result ? Response.json(result) : Response.json({ error: "organize_failed" }, { status: 502 });
}
