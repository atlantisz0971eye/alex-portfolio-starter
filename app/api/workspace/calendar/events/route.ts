import { calendarGuard } from "../../../../lib/calendarGuard";
import { CalendarInputError, createEvent, deleteEvent, listOccurrences, updateEvent } from "../../../../lib/calendarStore";
import { validZone } from "../../../../lib/calendarTime";

export const runtime = "nodejs";

const MAX_RANGE = 100 * 86_400_000;

function fail(error: unknown) {
  if (error instanceof CalendarInputError) return Response.json({ error: "invalid_event", message: error.message }, { status: 400 });
  return Response.json({ error: "calendar_failed" }, { status: 502 });
}

async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 20_000) throw new CalendarInputError("The request is too large.");
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    throw new CalendarInputError("The request was not valid.");
  }
}

export async function GET(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const from = Date.parse(params.get("from") ?? "");
  const to = Date.parse(params.get("to") ?? "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > MAX_RANGE) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const { occurrences, categories } = await listOccurrences(from, to);
    return Response.json({ events: occurrences, categories }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const data = await body(request);
    if (!data.event || typeof data.event !== "object") throw new CalendarInputError("Missing event.");
    const event = await createEvent(data.event as Record<string, unknown>, validZone(data.zone), data.by === "agent" ? "agent" : "user");
    return Response.json({ event }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const data = await body(request);
    if (typeof data.id !== "string" || !data.event || typeof data.event !== "object") throw new CalendarInputError("Missing event.");
    const event = await updateEvent(data.id, data.event as Record<string, unknown>, data.scope === "this" ? "this" : "all", typeof data.occurrenceDate === "string" ? data.occurrenceDate : undefined, validZone(data.zone), data.by === "agent" ? "agent" : "user");
    return Response.json({ event });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    await deleteEvent(id, params.get("scope") === "this" ? "this" : "all", params.get("occurrence") ?? undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
