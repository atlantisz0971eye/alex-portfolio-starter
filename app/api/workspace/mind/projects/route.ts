import { calendarGuard } from "../../../../lib/calendarGuard";
import { readStatus, refreshStatus, refreshStatusLater } from "../../../../lib/projectStatus";
import { currentUser } from "../../../../lib/workspaceScope";

export const runtime = "nodejs";
export const maxDuration = 120;

const calls = new Map<string, number>();

/** The saved status of every project. When it is missing or several hours old, a fresh one is made after this response. */
export async function GET() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const saved = await readStatus();
    await refreshStatusLater(saved);
    return Response.json(saved ?? { updatedAt: "", overview: "", projects: [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "projects_failed" }, { status: 502 });
  }
}

/** Reads the repositories, the notebook and the sync again now. At most once a minute per person. */
export async function POST() {
  const denied = await calendarGuard();
  if (denied) return denied;
  const user = await currentUser();
  if (Date.now() - (calls.get(user.id) ?? 0) < 60_000) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set(user.id, Date.now());
  try {
    return Response.json(await refreshStatus(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "projects_failed" }, { status: 502 });
  }
}
