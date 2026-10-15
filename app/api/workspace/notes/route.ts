import { calendarGuard } from "../../../lib/calendarGuard";
import { noteFailure } from "../../../lib/notesHttp";
import { createNote, listNotes, NoteError } from "../../../lib/notesStore";
import { markdownToDoc } from "../../../lib/notesText";

export const runtime = "nodejs";

export async function GET() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    return Response.json({ notes: await listNotes() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return noteFailure(error);
  }
}

export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length")) > 1_000_000) throw new NoteError("This note is too large.");
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const note = await createNote({
      parentId: typeof body.parentId === "string" ? body.parentId : null,
      title: typeof body.title === "string" ? body.title : "",
      icon: typeof body.icon === "string" ? body.icon : "",
      content: typeof body.markdown === "string" ? markdownToDoc(body.markdown.slice(0, 50_000)) : body.content,
    });
    return Response.json({ note }, { status: 201 });
  } catch (error) {
    return noteFailure(error);
  }
}
