import { readAsset, validAssetName, validBoardId } from "../../../../../../lib/boardStore";
import { calendarGuard } from "../../../../../../lib/calendarGuard";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const { id, name } = await params;
  if (!validBoardId(id) || !validAssetName(name)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const asset = await readAsset(id, name);
    if (!asset || asset.statusCode !== 200) return Response.json({ error: "not_found" }, { status: 404 });
    return new Response(asset.stream, { headers: { "Content-Type": asset.blob.contentType, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ error: "boards_failed" }, { status: 502 });
  }
}
