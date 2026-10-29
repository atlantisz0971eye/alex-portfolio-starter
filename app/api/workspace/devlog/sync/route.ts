import { calendarGuard } from "../../../../lib/calendarGuard";
import { currentUser } from "../../../../lib/workspaceScope";
import { validZone } from "../../../../lib/calendarTime";
import { shaKey, syncProject } from "../../../../lib/devlogGit";
import { readEntries, readProjects, replaceCommitEntries, setLastSync, validId } from "../../../../lib/devlogStore";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Reads a project's new commits from GitHub and turns each day into a log entry. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  // The GitHub token belongs to the owner and can see their private repositories, so only the owner syncs.
  if (!(await currentUser()).features.github) return Response.json({ error: "member_feature_off" }, { status: 403 });
  if (!process.env.DEEPSEEK_API_KEY) return Response.json({ error: "ai_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { projectId?: unknown; zone?: unknown };
  if (!validId(body.projectId)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const project = (await readProjects()).find((item) => item.id === body.projectId);
  if (!project?.repo) return Response.json({ error: "no_repo" }, { status: 400 });
  try {
    const known = new Map((await readEntries()).filter((entry) => entry.projectId === project.id && entry.kind === "commits" && entry.commits).map((entry) => [entry.date, shaKey(entry.commits!.map((commit) => commit.sha))]));
    const result = await syncProject(project, validZone(body.zone), known);
    await replaceCommitEntries(project.id, result.entries);
    // Days beyond this run's limit are picked up next time, so keep the clock where the newest handled day ends.
    if (!result.skippedDays) await setLastSync(project.id, new Date().toISOString());
    return Response.json({ days: result.entries.length, commits: result.commitCount, skippedDays: result.skippedDays });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "github_404") return Response.json({ error: "github_not_found" }, { status: 404 });
    if (code === "github_401" || code === "github_403") return Response.json({ error: "github_denied" }, { status: 502 });
    return Response.json({ error: "github_failed" }, { status: 502 });
  }
}
