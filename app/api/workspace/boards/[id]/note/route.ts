import { boardFailure } from "../../../../../lib/boardHttp";
import { validBoardId } from "../../../../../lib/boardStore";
import { calendarGuard } from "../../../../../lib/calendarGuard";
import { ensureNote } from "../../../../../lib/mindstreamOps";

export const runtime = "nodejs";

/** Returns the note paired with this board, creating it the first time. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!validBoardId(id)) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ noteId: (await ensureNote(id)).noteId });
  } catch (error) {
    return boardFailure(error);
  }
}
