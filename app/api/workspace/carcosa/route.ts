import { calendarGuard } from "../../../lib/calendarGuard";
import { carcosaView, dream } from "../../../lib/carcosa/state";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    return Response.json(await carcosaView(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "carcosa_failed" }, { status: 502 });
  }
}

/** "dream" asks for the day's rumination. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: { action?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 2_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    if (body.action === "dream") return Response.json({ dream: await dream() });
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch {
    return Response.json({ error: "carcosa_failed" }, { status: 502 });
  }
}
