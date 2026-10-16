import { boardFailure } from "../../../../lib/boardHttp";
import { BoardError, deleteBoard, readBoard, updateBoard, validBoardId } from "../../../../lib/boardStore";
import { calendarGuard } from "../../../../lib/calendarGuard";
import { setTrashed } from "../../../../lib/notesStore";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: Context) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const found = await readBoard((await params).id);
    return found ? Response.json(found, { headers: noStore }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return boardFailure(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!validBoardId(id)) return Response.json({ error: "not_found" }, { status: 404 });
    if (Number(request.headers.get("content-length")) > 1_000_000) throw new BoardError("This board is too large.");
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const board = await updateBoard(id, { title: body.title, content: body.content, noteId: body.noteId });
    return board ? Response.json({ board }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return boardFailure(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!validBoardId(id)) return Response.json({ error: "not_found" }, { status: 404 });
    const found = await readBoard(id);
    if (!(await deleteBoard(id))) return Response.json({ error: "not_found" }, { status: 404 });
    // The paired note is not deleted for good: it goes to the Notes trash, where it can be restored.
    if (found?.board.noteId) await setTrashed(found.board.noteId, true).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return boardFailure(error);
  }
}
