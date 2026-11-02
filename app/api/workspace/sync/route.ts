import { createHash, timingSafeEqual } from "node:crypto";
import { workspaceUser } from "../../../lib/workspaceAuth";
import { workspaceStorageConfigured } from "../../../lib/workspaceStore";
import { cleanReport, deleteCommands, listCommands, listDevices, pushCommand, readDevice, validDevice, writeDevice, type SyncCommand, type SyncDevice } from "../../../lib/syncStore";

export const runtime = "nodejs";

const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();
const calls = new Map<string, { count: number; until: number }>();
/** A computer that has not been heard from for this long counts as offline. It calls in every 90 seconds. */
const ONLINE_SECONDS = 4 * 60;

function tokenOk(request: Request) {
  const token = clean(process.env.WORKSPACE_SYNC_TOKEN ?? "");
  if (token.length < 32) return "not_configured" as const;
  const given = clean((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b)) ? ("ok" as const) : ("denied" as const);
}

/** The computer reports in (authenticated by its own token, not a browser session) and receives its waiting commands. */
export async function POST(request: Request) {
  if (request.headers.get("origin")) return Response.json({ error: "forbidden" }, { status: 403 });
  const auth = tokenOk(request);
  if (auth === "not_configured") return Response.json({ error: "sync_not_configured" }, { status: 503 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 60_000) throw new Error("too large");
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!validDevice(body.device)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const now = Date.now();
  const previous = calls.get(body.device);
  const count = previous && previous.until > now ? previous.count : 0;
  if (count >= 120) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set(body.device, { count: count + 1, until: now + 60_000 });
  try {
    const report = cleanReport(body);
    const device: SyncDevice = { device: body.device, name: report.name, platform: report.platform, version: report.version, rclone: report.rclone, paused: report.paused, lastSeen: new Date().toISOString(), folders: report.folders, events: report.events, commands: [] };
    await writeDevice(device);
    // Commands stay queued until the computer acknowledges them, so an answer that got lost is simply sent again.
    await deleteCommands(body.device, report.acks);
    const waiting = (await listCommands(body.device)).filter((command) => !report.acks.includes(command.id));
    return Response.json({ commands: waiting, serverTime: device.lastSeen }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

async function ownerOnly() {
  const user = await workspaceUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return Response.json({ error: "forbidden" }, { status: 403 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  return null;
}

/** Status for the owner's Workspace: each computer, whether it is online, and what it is doing. */
export async function GET() {
  const denied = await ownerOnly();
  if (denied) return denied;
  try {
    const now = Date.now();
    const devices = (await listDevices()).map((device) => {
      const age = Math.max(0, Math.round((now - Date.parse(device.lastSeen)) / 1000));
      return { ...device, ageSeconds: age, online: age <= ONLINE_SECONDS };
    });
    return Response.json({ configured: clean(process.env.WORKSPACE_SYNC_TOKEN ?? "").length >= 32, devices }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

/** Queues a command ("sync now", pause, resume); the computer picks it up on its next call. */
export async function PATCH(request: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { device?: unknown; type?: unknown; folder?: unknown } | null;
  if (!body || !validDevice(body.device) || !["sync", "pause", "resume"].includes(String(body.type))) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    if (!(await readDevice(body.device))) return Response.json({ error: "not_found" }, { status: 404 });
    const folder = typeof body.folder === "string" && body.folder ? body.folder.slice(0, 80) : undefined;
    await pushCommand(body.device, body.type as SyncCommand["type"], folder);
    return Response.json({ ok: true, commands: await listCommands(body.device) });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
