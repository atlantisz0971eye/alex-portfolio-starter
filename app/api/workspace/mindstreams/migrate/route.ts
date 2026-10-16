import { boardFailure } from "../../../../lib/boardHttp";
import { calendarGuard } from "../../../../lib/calendarGuard";
import { adoptOrphanBoards } from "../../../../lib/mindstreamOps";

export const runtime = "nodejs";

/** Gives boards made before the merge a page in the tree. Safe to repeat. */
export async function POST() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    return Response.json({ adopted: await adoptOrphanBoards() });
  } catch (error) {
    return boardFailure(error);
  }
}
