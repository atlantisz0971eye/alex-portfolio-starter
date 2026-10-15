import { boardFailure } from "../../../lib/boardHttp";
import { createBoard, listBoards } from "../../../lib/boardStore";
import { calendarGuard } from "../../../lib/calendarGuard";

export const runtime = "nodejs";

export async function GET() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    return Response.json({ boards: await listBoards() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return boardFailure(error);
  }
}

export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Response.json({ board: await createBoard(typeof body.title === "string" ? body.title : "") }, { status: 201 });
  } catch (error) {
    return boardFailure(error);
  }
}
