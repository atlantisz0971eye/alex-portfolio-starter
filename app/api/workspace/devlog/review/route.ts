import { calendarGuard } from "../../../../lib/calendarGuard";
import { reviewEntries } from "../../../../lib/devlogGit";
import { readEntries, readProjects, validDate, validId } from "../../../../lib/devlogStore";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Drafts a retrospective of a project's entries between two days. The client lets the reader edit it before saving. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  if (!process.env.DEEPSEEK_API_KEY) return Response.json({ error: "ai_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { projectId?: unknown; from?: unknown; to?: unknown };
  if (!validId(body.projectId) || !validDate(body.from) || !validDate(body.to)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const project = (await readProjects()).find((item) => item.id === body.projectId);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });
  const entries = (await readEntries()).filter((entry) => entry.projectId === project.id && entry.kind !== "review" && entry.date >= (body.from as string) && entry.date <= (body.to as string));
  if (!entries.length) return Response.json({ error: "devlog_empty" }, { status: 422 });
  const markdown = await reviewEntries(project.name, body.from, body.to, entries);
  return markdown ? Response.json({ markdown: markdown.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim(), count: entries.length }) : Response.json({ error: "organize_failed" }, { status: 502 });
}
