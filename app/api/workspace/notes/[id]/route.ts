import { calendarGuard } from "../../../../lib/calendarGuard";
import { appendToNote, deleteForever, duplicateNote, NoteError, readNote, setTrashed, updateNote, validNoteId } from "../../../../lib/notesStore";
import { noteFailure } from "../../../../lib/notesHttp";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function id(context: Context) {
  const value = (await context.params).id;
  if (!validNoteId(value)) throw new NoteError("That note no longer exists.");
  return value;
}

export async function GET(_request: Request, context: Context) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const found = await readNote(await id(context));
    return found ? Response.json(found, { headers: { "Cache-Control": "private, no-store" } }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return noteFailure(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length")) > 1_000_000) throw new NoteError("This note is too large.");
    const note = await updateNote(await id(context), await request.json() as Record<string, unknown>);
    return Response.json({ note });
  } catch (error) {
    return noteFailure(error);
  }
}

/** Actions that are not plain edits: restore from the trash, or duplicate. */
export async function POST(request: Request, context: Context) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({})) as { action?: unknown; markdown?: unknown };
    const noteId = await id(context);
    if (body.action === "restore") { await setTrashed(noteId, false); return Response.json({ ok: true }); }
    if (body.action === "append" && typeof body.markdown === "string") return Response.json({ note: await appendToNote(noteId, body.markdown) });
    if (body.action === "duplicate") return Response.json({ note: await duplicateNote(noteId) }, { status: 201 });
    throw new NoteError("Unknown action.");
  } catch (error) {
    return noteFailure(error);
  }
}

/** Moves to the trash; `?permanent=1` removes it for good. */
export async function DELETE(request: Request, context: Context) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const noteId = await id(context);
    if (new URL(request.url).searchParams.get("permanent") === "1") await deleteForever(noteId);
    else await setTrashed(noteId, true);
    return Response.json({ ok: true });
  } catch (error) {
    return noteFailure(error);
  }
}
