import { calendarGuard } from "../../../lib/calendarGuard";
import { validZone } from "../../../lib/calendarTime";
import { MailAuthError } from "../../../lib/gmail";
import { DeepSeekError, deepSeekErrorCode } from "../../../lib/workspaceDeepSeek";
import { checkToday, discussProposal, resolveProposal, todayView } from "../../../lib/today";
import { ndjson } from "../../../lib/workspaceStream";

/**
 * Planning and answering a card take the model several look-ups, so they answer as a stream: a "tool" event for each
 * look-up, then "result" with the outcome and "done".
 */
function streamed(work: (onTool: (name: string, label: string) => void) => Promise<Record<string, unknown>>) {
  return ndjson(async (send) => {
    send({ t: "start" });
    try {
      const result = await work((_name, label) => send({ t: "tool", label }));
      send({ t: "result", ...result });
      send({ t: "done" });
    } catch (error) {
      // The stream reports DeepSeek failures itself; the others are named here.
      if (error instanceof DeepSeekError) throw error;
      send({ t: "error", code: error instanceof MailAuthError ? "mail_reauth" : "today_failed" });
    }
  });
}

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

/** "check" looks for new mail (and plans if there is some); "refresh" always plans; "proposal" records a decision; "discuss" answers a card in words. "refresh" and "discuss" answer as a stream. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: { action?: unknown; zone?: unknown; pid?: unknown; status?: unknown; message?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 4000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const pid = typeof body.pid === "string" && body.pid.length <= 80 ? body.pid : "";
  const zone = typeof body.zone === "string" ? validZone(body.zone) : undefined;
  try {
    if (body.action === "proposal" && pid && (body.status === "applied" || body.status === "dismissed")) {
      await resolveProposal(pid, body.status);
      return Response.json({ ok: true });
    }
    if (body.action === "discuss" && pid && typeof body.message === "string" && body.message.trim()) {
      const message = body.message;
      return streamed((onTool) => discussProposal(pid, message, zone, onTool));
    }
    if (body.action === "refresh") return streamed((onTool) => checkToday({ zone, force: true, onTool }));
    if (body.action === "check") return Response.json(await checkToday({ zone }));
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    if (error instanceof DeepSeekError) return Response.json({ error: deepSeekErrorCode(error.status) }, { status: 502 });
    if (error instanceof MailAuthError) return Response.json({ error: "mail_reauth" }, { status: 401 });
    return Response.json({ error: "today_failed" }, { status: 502 });
  }
}
