import { calendarGuard } from "../../../lib/calendarGuard";
import { validZone } from "../../../lib/calendarTime";
import { MailAuthError } from "../../../lib/gmail";
import { DeepSeekError, deepSeekErrorCode } from "../../../lib/workspaceDeepSeek";
import { checkToday, resolveProposal, todayView } from "../../../lib/today";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const zone = new URL(request.url).searchParams.get("zone");
  try {
    return Response.json(await todayView(zone ? validZone(zone) : undefined), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "today_failed" }, { status: 502 });
  }
}

/** "check" looks for new mail (and plans if there is some); "refresh" always plans; "proposal" records a decision. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: { action?: unknown; zone?: unknown; index?: unknown; status?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 2000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    if (body.action === "proposal" && Number.isInteger(body.index) && (body.status === "applied" || body.status === "dismissed")) {
      await resolveProposal(body.index as number, body.status);
      return Response.json({ ok: true });
    }
    if (body.action === "check" || body.action === "refresh") {
      const result = await checkToday({ zone: typeof body.zone === "string" ? validZone(body.zone) : undefined, force: body.action === "refresh" });
      return Response.json(result);
    }
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    if (error instanceof DeepSeekError) return Response.json({ error: deepSeekErrorCode(error.status) }, { status: 502 });
    if (error instanceof MailAuthError) return Response.json({ error: "mail_reauth" }, { status: 401 });
    return Response.json({ error: "today_failed" }, { status: 502 });
  }
}
