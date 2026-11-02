import { calendarGuard } from "../../../lib/calendarGuard";
import { MindError, addMindEntry, deleteMindEntry, readGraph } from "../../../lib/mindStore";
import { editEntry, importLegacyNotes, organizeLater, readInputs, renameTopic } from "../../../lib/mindOrganize";
import { currentUser } from "../../../lib/workspaceScope";

export const runtime = "nodejs";
export const maxDuration = 120;

const calls = new Map<string, { count: number; until: number }>();
const kicked = new Map<string, number>();

/** The notebook with its map: every input (notebook and devlog, newest first) and what the organizer has made of them. */
export async function GET() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const [{ inputs }, graph] = await Promise.all([readInputs(), readGraph()]);
    // Entries nobody has filed yet (a first visit, devlog entries, an earlier failure) are picked up here, at most every two minutes.
    const user = await currentUser();
    if (inputs.some((input) => !graph.derived[input.id]) && Date.now() - (kicked.get(user.id) ?? 0) > 120_000) { kicked.set(user.id, Date.now()); await organizeLater(); }
    const items = inputs.slice(0, 600).map((input) => ({ id: input.id, at: input.date, text: input.text.slice(0, 1500), source: input.source, derived: graph.derived[input.id] ?? null }));
    return Response.json({ items, topics: graph.topics, projects: graph.projects, overview: graph.overview, updatedAt: graph.updatedAt }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "mind_failed" }, { status: 502 });
  }
}

/** { action: "add", text } saves a thought and files it in the background; "delete" removes one; "reorganize" rebuilds the map. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: { action?: unknown; text?: unknown; id?: unknown; title?: unknown; topic?: unknown; project?: unknown; to?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 12_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const user = await currentUser();
  const now = Date.now();
  const previous = calls.get(user.id);
  const count = previous && previous.until > now ? previous.count : 0;
  if (count >= 40) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set(user.id, { count: count + 1, until: previous && previous.until > now ? previous.until : now + 60_000 });
  try {
    if (body.action === "add") {
      const entry = await addMindEntry(body.text);
      await organizeLater();
      return Response.json({ entry });
    }
    if (body.action === "delete" && typeof body.id === "string" && /^[0-9a-f-]{36}$/.test(body.id)) return Response.json({ ok: await deleteMindEntry(body.id) });
    if (body.action === "edit" && typeof body.id === "string") { await editEntry(body.id, { title: body.title, topic: body.topic, project: body.project }); return Response.json({ ok: true }); }
    if (body.action === "renameTopic") { await renameTopic(body.project, body.topic, body.to); return Response.json({ ok: true }); }
    if (body.action === "importNotes") { const result = await importLegacyNotes(); await organizeLater(); return Response.json(result); }
    if (body.action === "reorganize") { await organizeLater({ force: true }); return Response.json({ ok: true }); }
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    if (error instanceof MindError) return Response.json({ error: "invalid_mind", message: error.message }, { status: 400 });
    return Response.json({ error: "mind_failed" }, { status: 502 });
  }
}
