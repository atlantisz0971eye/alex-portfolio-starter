import { organizeNotes } from "../../../../lib/boardOrganize";
import { calendarGuard } from "../../../../lib/calendarGuard";
import { readNote, validNoteId } from "../../../../lib/notesStore";
import { jsonToMarkdown } from "../../../../lib/notesText";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Note → board: proposes a card tree for a note. The client lays it out and creates the board after review. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  if (!process.env.DEEPSEEK_API_KEY) return Response.json({ error: "ai_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { noteId?: unknown };
  if (typeof body.noteId !== "string" || !validNoteId(body.noteId)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const found = await readNote(body.noteId);
    if (!found) return Response.json({ error: "not_found" }, { status: 404 });
    const markdown = jsonToMarkdown(found.note.title, found.content);
    if (markdown.replace(/\s+/g, "").length < 20) return Response.json({ error: "note_empty" }, { status: 422 });
    const result = await organizeNotes(markdown);
    return result ? Response.json(result) : Response.json({ error: "organize_failed" }, { status: 502 });
  } catch {
    return Response.json({ error: "notes_failed" }, { status: 502 });
  }
}
