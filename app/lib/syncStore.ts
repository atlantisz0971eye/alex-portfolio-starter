import { randomUUID } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";

/**
 * What the owner's computer reports about its Drive sync. The computer calls in (it opens every connection, nothing
 * reaches it from outside) and each answer carries the commands that were waiting for it.
 */
export type SyncState = "idle" | "syncing" | "queued" | "error" | "unmounted" | "paused";
export type SyncFolder = {
  name: string;
  path: string;
  state: SyncState;
  mode?: "sync" | "copy";
  lastOk?: string;
  lastError?: string;
  lastDurationMs?: number;
  files?: number;
  bytes?: number;
  transferred?: number;
  /** Boxes ticked in the folder's own README, ROADMAP, TODO or PLAN: counts and a few open items, never the files. */
  checklist?: { file: string; done: number; total: number; open: string[] }[];
  /** Where the folder's git repository stands (drivesync 1.3): the commit checked out and what is not yet committed or pushed. */
  git?: { branch: string; head: string; headAt?: string; dirty: number; ahead: number; behind: number; repo?: string };
};
export type SyncCommand = { id: string; type: "sync" | "pause" | "resume"; folder?: string; at: string };
export type SyncDevice = {
  device: string;
  name: string;
  platform?: string;
  version?: string;
  rclone?: string;
  paused?: boolean;
  lastSeen: string;
  folders: SyncFolder[];
  events: { at: string; text: string }[];
  commands: SyncCommand[];
};

const pathOf = (device: string) => `system/sync/${device}.json`;
export const validDevice = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,40}$/.test(value);
const STATES: SyncState[] = ["idle", "syncing", "queued", "error", "unmounted", "paused"];

export async function readDevice(device: string): Promise<SyncDevice | null> {
  if (!validDevice(device)) return null;
  const result = await get(pathOf(device), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return JSON.parse(await new Response(result.stream).text()) as SyncDevice;
}

export async function writeDevice(device: SyncDevice) {
  await put(pathOf(device.device), JSON.stringify(device), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export async function listDevices(): Promise<SyncDevice[]> {
  const page = await list({ prefix: "system/sync/", limit: 200 });
  // Status files sit directly in the folder; each waiting command is its own file below `<device>/cmd/`.
  const ids = page.blobs.map((blob) => blob.pathname.slice("system/sync/".length)).filter((name) => name.endsWith(".json") && !name.includes("/")).map((name) => name.replace(/\.json$/, ""));
  const devices = await Promise.all(ids.map(async (id) => { const device = await readDevice(id).catch(() => null); return device ? { ...device, commands: await listCommands(id).catch(() => []) } : null; }));
  return devices.filter((item): item is SyncDevice => !!item).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

// A command is a file whose name says everything: `<time>~<id>~<type>~<folder>`. Writing one never touches the status
// file and nothing else writes to it, so a command queued while the computer is reporting in cannot be lost.
const commandDir = (device: string) => `system/sync/${device}/cmd/`;

export async function pushCommand(device: string, type: SyncCommand["type"], folder?: string) {
  const waiting = await listCommands(device);
  if (waiting.length >= 20 || waiting.some((command) => command.type === type && command.folder === folder)) return;
  const id = randomUUID();
  await put(`${commandDir(device)}${Date.now()}~${id}~${type}~${encodeURIComponent(folder ?? "")}`, "1", { access: "private", allowOverwrite: true, contentType: "text/plain" });
}

export async function listCommands(device: string): Promise<SyncCommand[]> {
  const page = await list({ prefix: commandDir(device), limit: 50 });
  return page.blobs.flatMap((blob): SyncCommand[] => {
    const [time, id, type, ...folder] = blob.pathname.slice(commandDir(device).length).split("~");
    if (!time || !id || !["sync", "pause", "resume"].includes(type)) return [];
    const name = decodeURIComponent(folder.join("~"));
    return [{ id: `${time}~${id}`, type: type as SyncCommand["type"], ...(name ? { folder: name } : {}), at: new Date(Number(time)).toISOString() }];
  }).sort((a, b) => a.at.localeCompare(b.at));
}

export async function deleteCommands(device: string, ids: string[]) {
  if (!ids.length) return;
  const page = await list({ prefix: commandDir(device), limit: 50 });
  const gone = page.blobs.filter((blob) => ids.some((id) => blob.pathname.startsWith(`${commandDir(device)}${id}~`)));
  if (gone.length) await del(gone.map((blob) => blob.url));
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined);
const iso = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined);

/** Cleans what the computer sent: lengths capped, unknown values dropped. */
const cleanChecklist = (value: unknown) => (Array.isArray(value) ? value : []).slice(0, 4).flatMap((item) => {
  const c = (item ?? {}) as Record<string, unknown>;
  const file = text(c.file, 24), done = count(c.done), total = count(c.total);
  if (!file || done === undefined || total === undefined || total === 0 || done > total) return [];
  return [{ file, done, total, open: (Array.isArray(c.open) ? c.open : []).slice(0, 5).flatMap((line) => { const t = text(line, 100); return t ? [t] : []; }) }];
});

/** A folder's git state as reported, or nothing: a full sha, short text, small counts, an owner/name repository. */
function cleanGit(value: unknown): SyncFolder["git"] {
  if (!value || typeof value !== "object") return undefined;
  const g = value as Record<string, unknown>;
  const head = typeof g.head === "string" && /^[0-9a-f]{40}$/.test(g.head) ? g.head : null;
  if (!head) return undefined;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 100000) : 0);
  const repo = typeof g.repo === "string" && /^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(g.repo) ? g.repo : undefined;
  return { branch: text(g.branch, 60) ?? "", head, headAt: iso(g.headAt), dirty: n(g.dirty), ahead: n(g.ahead), behind: n(g.behind), repo };
}

export function cleanReport(body: Record<string, unknown>) {
  const folders = (Array.isArray(body.folders) ? body.folders : []).slice(0, 30).flatMap((item): SyncFolder[] => {
    const f = item as Record<string, unknown>;
    const name = text(f?.name, 80);
    const path = text(f?.path, 300);
    if (!name || !path || !STATES.includes(f.state as SyncState)) return [];
    return [{ name, path, state: f.state as SyncState, mode: f.mode === "copy" ? "copy" : "sync", lastOk: iso(f.lastOk), lastError: text(f.lastError, 400), lastDurationMs: count(f.lastDurationMs), files: count(f.files), bytes: count(f.bytes), transferred: count(f.transferred), checklist: cleanChecklist(f.checklist), git: cleanGit(f.git) }];
  });
  const events = (Array.isArray(body.events) ? body.events : []).slice(-20).flatMap((item) => {
    const e = item as Record<string, unknown>;
    const at = iso(e?.at);
    const line = text(e?.text, 200);
    return at && line ? [{ at, text: line }] : [];
  });
  const acks = (Array.isArray(body.acks) ? body.acks : []).filter((id): id is string => typeof id === "string").slice(0, 50);
  return { name: text(body.name, 60) ?? "Computer", platform: text(body.platform, 20), version: text(body.version, 20), rclone: text(body.rclone, 40), paused: body.paused === true, folders, events, acks };
}
