import { calendarGuard } from "../../../lib/calendarGuard";
import { buildEdition, ensureEdition, readEdition } from "../../../lib/newsEdition";
import { currentUser, runAs } from "../../../lib/workspaceScope";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The saved front page. When it is missing or old and the viewer is the owner, a new one is made in the background. */
export async function GET() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const edition = await readEdition();
    await ensureEdition(edition).catch(() => undefined);
    return Response.json({ edition }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "news_failed" }, { status: 502 });
  }
}

/** The owner asks for a new edition now. */
export async function POST() {
  const denied = await calendarGuard();
  if (denied) return denied;
  const user = await currentUser();
  if (user.role !== "owner") return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const edition = await runAs(user, () => buildEdition());
    return Response.json({ edition });
  } catch {
    return Response.json({ error: "news_failed" }, { status: 502 });
  }
}
