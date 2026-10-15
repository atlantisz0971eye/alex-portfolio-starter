import { NoteError } from "./notesStore";

export function noteFailure(error: unknown) {
  if (error instanceof NoteError) return Response.json({ error: "invalid_note", message: error.message }, { status: 400 });
  return Response.json({ error: "notes_failed" }, { status: 502 });
}
