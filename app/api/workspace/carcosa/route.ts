import { calendarGuard } from "../../../lib/calendarGuard";
import { saveCheckin, setRest, wipeNotes } from "../../../lib/carcosa/checkins";
import { workDay } from "../../../lib/carcosa/ledger";
import { takeReading, writeReading } from "../../../lib/carcosa/reading";
import { carcosaView, dream } from "../../../lib/carcosa/state";
import { currentUser } from "../../../lib/workspaceScope";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    return Response.json(await carcosaView(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "carcosa_failed" }, { status: 502 });
  }
}


/**
 * "checkin" saves today's mood, energy, sleep and word; "rest" marks today or tomorrow as a rest day; "reading" writes
 * today's reading (a few times a day at most); "dream" the day's rumination; "wipe" deletes every check-in.
 */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 4_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const today = workDay(Date.now());
  try {
    if (body.action === "checkin") { await saveCheckin(today, body); return Response.json(await carcosaView()); }
    if (body.action === "rest") {
      const day = body.when === "tomorrow" ? new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : today;
      await setRest(day, body.on !== false);
      return Response.json(await carcosaView());
    }
    if (body.action === "reading") {
      const user = await currentUser();
      if (user.role !== "owner") return Response.json({ error: "forbidden" }, { status: 403 });
      // kept in storage, so a new server instance does not hand out four more
      if (!(await takeReading(today))) return Response.json({ error: "rate_limited", message: "今天已经读过几次了，明天再来。" }, { status: 429 });
      await writeReading();
      return Response.json(await carcosaView());
    }
    if (body.action === "dream") return Response.json({ dream: await dream() });
    if (body.action === "wipe") { await wipeNotes(); return Response.json(await carcosaView()); }
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch {
    return Response.json({ error: "carcosa_failed" }, { status: 502 });
  }
}
