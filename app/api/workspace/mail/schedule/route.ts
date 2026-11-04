import { calendarGuard } from "../../../../lib/calendarGuard";
import { mailGuard } from "../../../../lib/mailGuard";
import { scanMailForEvents, ScanError } from "../../../../lib/mailSchedule";

export const runtime = "nodejs";
export const maxDuration = 120;

const calls = new Map<string, { count: number; until: number }>();

/**
 * Reads the last two weeks of mail and returns the events DeepSeek found in it. It only reads: the person picks
 * and corrects the events, and the page adds them through the calendar endpoint.
 */
export async function POST(request: Request) {
  const denied = (await mailGuard()) ?? (await calendarGuard());
  if (denied) return denied;
  const key = request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  const previous = calls.get(key);
  const count = previous && previous.until > now ? previous.count : 0;
  if (count >= 4) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set(key, { count: count + 1, until: now + 60_000 });

  let body: { zone?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 1000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    return Response.json(await scanMailForEvents(body.zone), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ScanError && error.code === "no_accounts") return Response.json({ error: "no_mail_accounts" }, { status: 404 });
    if (error instanceof ScanError) return Response.json({ error: "ai_failed" }, { status: 502 });
    return Response.json({ error: "mail_failed" }, { status: 502 });
  }
}
