import { readAsset, readBoard, validAssetName, validBoardId } from "../../../../../lib/boardStore";
import { calendarGuard } from "../../../../../lib/calendarGuard";
import { recognize, VisionError } from "../../../../../lib/vision";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reads the text in one image on the board. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { name?: unknown };
  if (!validBoardId(id) || typeof body.name !== "string" || !validAssetName(body.name)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    if (!(await readBoard(id))) return Response.json({ error: "not_found" }, { status: 404 });
    const asset = await readAsset(id, body.name);
    if (!asset || asset.statusCode !== 200) return Response.json({ error: "not_found" }, { status: 404 });
    const bytes = new Uint8Array(await new Response(asset.stream).arrayBuffer());
    const [text] = await recognize([bytes]);
    const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) return Response.json({ error: "no_text_found" }, { status: 422 });
    return Response.json({ text: clean });
  } catch (error) {
    if (error instanceof VisionError) return Response.json({ error: error.code }, { status: error.code === "ocr_not_configured" ? 503 : 502 });
    return Response.json({ error: "ocr_failed" }, { status: 502 });
  }
}
