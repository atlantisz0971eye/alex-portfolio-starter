import { calendarGuard } from "../../../lib/calendarGuard";
import { carcosaView, dream, eat } from "../../../lib/carcosa/state";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    return Response.json(await carcosaView(new URL(request.url).searchParams.get("fresh") === "1"), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "carcosa_failed" }, { status: 502 });
  }
}

/** "eat" marks items as read; "dream" asks for the day's rumination. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: { action?: unknown; ids?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 20_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    if (body.action === "eat" && Array.isArray(body.ids)) return Response.json({ changed: await eat(body.ids.filter((id): id is string => typeof id === "string").slice(0, 100)) });
    if (body.action === "dream") return Response.json({ dream: await dream() });
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch {
    return Response.json({ error: "carcosa_failed" }, { status: 502 });
  }
}
