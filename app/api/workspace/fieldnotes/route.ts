import { calendarGuard } from "../../../lib/calendarGuard";
import { addAddendum, addNote, attachCapture, exportMarkdown, FieldnoteError, fieldView, findNote, setWithdrawn } from "../../../lib/fieldnotes";
import { fetchLink, labelLink } from "../../../lib/linkFetch";

export const runtime = "nodejs";
export const maxDuration = 60;

const RETRY_AFTER_MS = 60_000;

/** The Fieldnotes page, or with `?export=md` everything as one Markdown file. */
export async function GET(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("export") === "md") {
      const body = await exportMarkdown(params.get("withdrawn") === "1");
      return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="fieldnotes-${new Date().toISOString().slice(0, 10)}.md"`, "Cache-Control": "private, no-store" } });
    }
    return Response.json(await fieldView(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("fieldnotes read failed", error);
    return Response.json({ error: "fieldnotes_failed" }, { status: 502 });
  }
}

/**
 * "add" saves a note as written. "enrich" reads the link of a saved note once and labels it; the note is already safe
 * by then, so a slow or blocked site costs nothing. "addendum" adds a dated second thought; "withdraw" sets a note
 * aside or brings it back. Nothing here edits what was written.
 */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 200_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    if (body.action === "add") return Response.json({ note: await addNote(body) });
    const id = typeof body.id === "string" ? body.id : "";
    if (body.action === "addendum") return Response.json({ note: await addAddendum(id, body.text) });
    if (body.action === "withdraw") return Response.json({ note: await setWithdrawn(id, body.on !== false) });
    if (body.action === "enrich") {
      const note = await findNote(id);
      const capture = note?.capture;
      if (!note || !capture?.url) return Response.json({ error: "invalid_fieldnote" }, { status: 400 });
      const last = capture.fetched;
      if (last?.status === "ok" || (last && Date.now() - Date.parse(last.at) < RETRY_AFTER_MS)) return Response.json({ note });
      const fetched = await fetchLink(capture.url);
      const label = await labelLink(capture, fetched);
      return Response.json({ note: await attachCapture(id, fetched, label) });
    }
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    if (error instanceof FieldnoteError) return Response.json({ error: "invalid_fieldnote" }, { status: 400 });
    // the action and the failure only; what the person wrote never goes to the logs
    console.error("fieldnotes write failed", String(body.action), error);
    return Response.json({ error: "fieldnotes_failed" }, { status: 502 });
  }
}
