import { loadAll, parseRange } from "../../../../lib/gcal";
import { mailGuard } from "../../../../lib/mailGuard";
import { readAccounts } from "../../../../lib/mailStore";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = await mailGuard();
  if (denied) return denied;
  const range = parseRange(new URL(request.url).searchParams);
  if (!range) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    return Response.json(await loadAll(await readAccounts(), range.from, range.to), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "calendar_failed" }, { status: 502 });
  }
}
