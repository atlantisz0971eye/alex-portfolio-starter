import { checkToday } from "../../../lib/today";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Scheduled by Vercel Cron (see vercel.json). It checks for new mail and refreshes the plan for today
 * even when the app is closed. Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await checkToday({}));
  } catch (error) {
    console.error("Today check failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
