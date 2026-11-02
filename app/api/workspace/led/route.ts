import { listOccurrences } from "../../../lib/calendarStore";
import { parseOps, DIRECTOR_SYSTEM } from "../../../lib/led/director";
import { sanitize } from "../../../lib/led/ops";
import { listDevices } from "../../../lib/syncStore";
import { workspaceUser } from "../../../lib/workspaceAuth";
import { runAs } from "../../../lib/workspaceScope";
import { quickDeepSeek } from "../../../lib/workspaceDeepSeek";
import { workspaceStorageConfigured } from "../../../lib/workspaceStore";

export const runtime = "nodejs";
export const maxDuration = 90;

const calls = new Map<string, { count: number; until: number }>();

/** The facts the director may use. Gathered here, on the server, so what reaches the model is exactly what this person may see. */
async function facts(owner: boolean) {
  const now = Date.now();
  const ZONE = "Europe/London";
  const local = (value: number | string) => new Date(value).toLocaleString("en-GB", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const data: Record<string, unknown> = { timeZone: ZONE, now: local(now), note: "All times are already local; copy them as given." };
  try {
    const { occurrences } = await listOccurrences(now - 3_600_000, now + 7 * 86_400_000);
    data.calendar = occurrences.slice(0, 30).map((event) => ({ from: event.allDay ? local(event.start).slice(0, -6) : local(event.start), until: event.allDay ? undefined : local(event.end), title: event.title, allDay: event.allDay || undefined, location: event.location || undefined }));
  } catch { /* the calendar is optional */ }
  if (owner) {
    try {
      data.sync = (await listDevices()).map((device) => ({
        device: device.name, lastSeen: local(device.lastSeen), paused: device.paused,
        folders: device.folders.map((folder) => ({ name: folder.name, state: folder.state, files: folder.files, bytes: folder.bytes, lastOk: folder.lastOk ? local(folder.lastOk) : undefined, lastError: folder.lastError })),
      }));
    } catch { /* so is sync */ }
  }
  return data;
}

export async function POST(request: Request) {
  const user = await workspaceUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  let prompt = "";
  try {
    if (Number(request.headers.get("content-length")) > 2000) throw new Error("too large");
    const body = await request.json() as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 300) : "";
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!prompt) return Response.json({ error: "invalid_request" }, { status: 400 });
  const now = Date.now();
  const previous = calls.get(user.id);
  const count = previous && previous.until > now ? previous.count : 0;
  if (count >= 12) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set(user.id, { count: count + 1, until: previous && previous.until > now ? previous.until : now + 60_000 });
  try {
    const data = await runAs(user, () => facts(user.role === "owner"));
    const reply = await runAs(user, () => quickDeepSeek(DIRECTOR_SYSTEM, `REQUEST: ${prompt}\n\nDATA:\n${JSON.stringify(data)}`, 4000, 70_000));
    if (!reply) return Response.json({ error: "ai_unavailable" }, { status: 502 });
    const ops = sanitize(parseOps(reply));
    if (!ops.length) return Response.json({ error: "no_picture" }, { status: 502 });
    return Response.json({ ops }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "director_failed" }, { status: 502 });
  }
}
