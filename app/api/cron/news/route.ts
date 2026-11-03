import { buildEdition } from "../../../lib/newsEdition";
import { runAs } from "../../../lib/workspaceScope";
import { ownerUser } from "../../../lib/workspaceUsers";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Scheduled by Vercel Cron (see vercel.json): prepares the morning and evening front page. Anything without the cron secret is refused. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const edition = await runAs(ownerUser(), () => buildEdition());
    return Response.json({ date: edition.date, summarised: edition.summarised, stories: edition.sections.reduce((sum, section) => sum + section.items.length, 0) });
  } catch (error) {
    console.error("News edition failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
