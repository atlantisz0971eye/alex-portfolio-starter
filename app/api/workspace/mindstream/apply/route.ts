import { boardFailure } from "../../../../lib/boardHttp";
import { validBoardId } from "../../../../lib/boardStore";
import { calendarGuard } from "../../../../lib/calendarGuard";
import { applyBoardOps, applyNoteEdit, applyTree, type BoardOp } from "../../../../lib/mindstreamOps";

export const runtime = "nodejs";

/** Applies a change the reader has confirmed: a note edit, card operations, or a generated card tree. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.boardId !== "string" || !validBoardId(body.boardId)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    if (body.kind === "note" && typeof body.markdown === "string") return Response.json(await applyNoteEdit(body.boardId, body.mode === "replace" ? "replace" : "append", body.markdown));
    if (body.kind === "board" && Array.isArray(body.ops)) return Response.json(await applyBoardOps(body.boardId, body.ops as BoardOp[]));
    if (body.kind === "tree" && body.tree && typeof body.tree === "object") {
      const tree = body.tree as { title?: unknown; items?: unknown };
      if (typeof tree.title !== "string" || !Array.isArray(tree.items)) return Response.json({ error: "invalid_request" }, { status: 400 });
      const items = (tree.items as { text?: unknown; parent?: unknown }[]).slice(0, 40).map((item) => ({ text: String(item.text ?? "").slice(0, 200), parent: typeof item.parent === "number" ? item.parent : null }));
      return Response.json(await applyTree(body.boardId, body.mode === "replace" ? "replace" : "add", { title: tree.title.slice(0, 80), items }));
    }
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    return boardFailure(error);
  }
}
