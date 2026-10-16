import { boardFailure } from "../../../../../lib/boardHttp";
import { calendarGuard } from "../../../../../lib/calendarGuard";
import { ensureBoardForNote } from "../../../../../lib/mindstreamOps";

export const runtime = "nodejs";

/** The board that goes with a page, created empty the first time. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    return Response.json({ boardId: await ensureBoardForNote((await params).id) });
  } catch (error) {
    return boardFailure(error);
  }
}
