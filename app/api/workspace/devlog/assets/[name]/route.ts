import { calendarGuard } from "../../../../../lib/calendarGuard";
import { readAsset, validAsset } from "../../../../../lib/devlogStore";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const { name } = await params;
  if (!validAsset(name)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const asset = await readAsset(name);
    if (!asset || asset.statusCode !== 200) return Response.json({ error: "not_found" }, { status: 404 });
    return new Response(asset.stream, { headers: { "Content-Type": asset.blob.contentType, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ error: "devlog_failed" }, { status: 502 });
  }
}
