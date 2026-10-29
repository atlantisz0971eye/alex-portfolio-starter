import { checkToday } from "../../../lib/today";
import { runAs } from "../../../lib/workspaceScope";
import { listMembers, ownerUser } from "../../../lib/workspaceUsers";

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
    // The owner first, then members who have asked for the daily plan; each in their own folder.
    const started = Date.now();
    const result = await runAs(ownerUser(), () => checkToday({}));
    let members = 0;
    for (const member of await listMembers()) {
      if (member.disabled || !member.features.today || !member.features.mail || Date.now() - started > 90_000) continue;
      await runAs(member, () => checkToday({})).then(() => { members += 1; }).catch((error) => console.error("Today check failed for a member", error instanceof Error ? error.message : error));
    }
    return Response.json({ ...result, members });
  } catch (error) {
    console.error("Today check failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
