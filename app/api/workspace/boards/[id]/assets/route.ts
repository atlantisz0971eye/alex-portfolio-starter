import { boardFailure } from "../../../../../lib/boardHttp";
import { BoardError, readBoard, saveAsset, validBoardId } from "../../../../../lib/boardStore";
import { calendarGuard } from "../../../../../lib/calendarGuard";

export const runtime = "nodejs";
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX = 4_000_000;

/** Accepts one image as the raw request body. The client shrinks photos first so they stay under the function body limit. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const { id } = await params;
    const type = TYPES.find((item) => item === request.headers.get("content-type"));
    if (!validBoardId(id) || !type) return Response.json({ error: "invalid_request" }, { status: 400 });
    if (!(await readBoard(id))) return Response.json({ error: "not_found" }, { status: 404 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > MAX) throw new BoardError("That image is too large.");
    return Response.json({ name: await saveAsset(id, bytes, type) }, { status: 201 });
  } catch (error) {
    return boardFailure(error);
  }
}
