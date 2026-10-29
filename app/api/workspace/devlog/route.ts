import { calendarGuard } from "../../../lib/calendarGuard";
import { currentUser } from "../../../lib/workspaceScope";
import { DevlogError, deleteEntry, deleteProject, readEntries, readProjects, saveEntry, saveProject, validId } from "../../../lib/devlogStore";

export const runtime = "nodejs";

const failure = (error: unknown) => error instanceof DevlogError ? Response.json({ error: "invalid_devlog", message: error.message }, { status: 400 }) : Response.json({ error: "devlog_failed" }, { status: 502 });

export async function GET() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const [projects, entries] = await Promise.all([readProjects(), readEntries()]);
    return Response.json({ projects, entries, github: !!process.env.GITHUB_TOKEN && (await currentUser()).features.github }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

/** One endpoint for edits: { action: "project" | "deleteProject" | "entry" | "deleteEntry", ... }. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    if (body.action === "project") return Response.json({ project: await saveProject((body.project ?? {}) as Record<string, unknown>) });
    if (body.action === "entry") return Response.json({ entry: await saveEntry((body.entry ?? {}) as Record<string, unknown>) });
    if (body.action === "deleteProject" && validId(body.id)) return Response.json({ ok: await deleteProject(body.id) });
    if (body.action === "deleteEntry" && validId(body.id)) return Response.json({ ok: await deleteEntry(body.id) });
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
