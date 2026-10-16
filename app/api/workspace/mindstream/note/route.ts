import { readBoard, validBoardId } from "../../../../lib/boardStore";
import { calendarGuard } from "../../../../lib/calendarGuard";
import { outlineOfBoard, summarizeBoard } from "../../../../lib/mindstream";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Board → note: writes a connected summary of a board. Nothing is saved here; the client creates the note after review. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  if (!process.env.DEEPSEEK_API_KEY) return Response.json({ error: "ai_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { boardId?: unknown };
  if (typeof body.boardId !== "string" || !validBoardId(body.boardId)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const found = await readBoard(body.boardId);
    if (!found) return Response.json({ error: "not_found" }, { status: 404 });
    const { outline, count } = outlineOfBoard(found.content.nodes, found.content.edges);
    if (!count) return Response.json({ error: "board_empty" }, { status: 422 });
    const markdown = await summarizeBoard(found.board.title, outline);
    return markdown ? Response.json({ markdown }) : Response.json({ error: "organize_failed" }, { status: 502 });
  } catch {
    return Response.json({ error: "boards_failed" }, { status: 502 });
  }
}
