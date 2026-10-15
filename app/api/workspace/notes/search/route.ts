import { calendarGuard } from "../../../../lib/calendarGuard";
import { searchNotes } from "../../../../lib/notesStore";
import { noteFailure } from "../../../../lib/notesHttp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!q) return Response.json({ results: [] });
  try {
    return Response.json({ results: await searchNotes(q) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return noteFailure(error);
  }
}
