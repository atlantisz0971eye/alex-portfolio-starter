#!/usr/bin/env node
// drivesync: keeps marked folders mirrored to Google Drive with rclone, and reports to the Workspace.
// No dependencies beyond Node 18+ and rclone. Run `drivesync help`.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "1.0.0";
const HOME = process.env.DRIVESYNC_HOME || path.join(os.homedir(), ".drivesync");
const FAST = process.env.DRIVESYNC_FAST === "1"; // seconds instead of minutes, for tests
const FILE = {
  config: path.join(HOME, "config.json"),
  folders: path.join(HOME, "folders.json"),
  state: path.join(HOME, "state.json"),
  pid: path.join(HOME, "daemon.pid"),
  log: path.join(HOME, "logs", "drivesync.log"),
  filters: path.join(HOME, "filters"),
};
const LABEL = "space.alexprojects.drivesync";

const DEFAULTS = {
  remote: "gdrive", root: "Sync", archive: "Sync-Archive", gitRoot: "Sync-Git", keepDays: 30,
  rclone: "rclone", server: "https://www.alexprojects.space", token: "", device: "", deviceName: "",
  intervalMinutes: 30, debounceSeconds: 60, heartbeatSeconds: 90, dailyAt: "03:00", maxDeletePercent: 30,
};

// What is never worth keeping a copy of: it can be rebuilt, or it is a secret.
const DIR_EXCLUDES = ["node_modules", ".git", ".next", ".next-dev", ".vercel", ".turbo", ".venv", "__pycache__", ".cache", "$RECYCLE.BIN", "System Volume Information", ".Trash", ".Spotlight-V100", ".fseventsd"];
const FILE_EXCLUDES = [".drivesync", ".DS_Store", "._*", "Thumbs.db", "*.pyc", ".env", ".env.local", ".env.*.local", ".env.production", ".env.development", "*.pem", "id_rsa*", "*.p12"];

// ---------------------------------------------------------------------------------------------- small helpers
const now = () => new Date();
const iso = () => now().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "computer";
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const writeJson = (file, value, mode) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), mode ? { mode } : undefined); };
const today = () => { const d = now(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const human = (bytes = 0) => (bytes < 1024 ** 2 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : bytes < 1024 ** 3 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${(bytes / 1024 ** 3).toFixed(1)} GB`);

function log(line) {
  const text = `${iso()} ${line}\n`;
  try {
    fs.mkdirSync(path.dirname(FILE.log), { recursive: true });
    if (fs.existsSync(FILE.log) && fs.statSync(FILE.log).size > 2_000_000) fs.renameSync(FILE.log, `${FILE.log}.1`);
    fs.appendFileSync(FILE.log, text);
  } catch { /* logging must never stop the sync */ }
  if (process.stdout.isTTY) process.stdout.write(text);
}

const config = () => ({ ...DEFAULTS, device: slug(os.hostname()), deviceName: os.hostname().replace(/\.local$/, ""), ...readJson(FILE.config, {}) });
const folders = () => readJson(FILE.folders, []);
const state = () => readJson(FILE.state, { folders: {}, paused: false });
const saveState = (value) => writeJson(FILE.state, value);

/** A folder's own settings: an optional `.drivesync` file inside it, JSON like {"exclude":["*.tmp"],"mode":"copy"}. */
function marker(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, ".drivesync"), "utf8") || "{}"); } catch { return {}; }
}
const settingsOf = (folder) => { const m = marker(folder.path); return { mode: folder.mode === "copy" || m.mode === "copy" ? "copy" : "sync", exclude: Array.isArray(m.exclude) ? m.exclude.filter((x) => typeof x === "string" && x && !x.includes("\n")) : [] }; };

function filterFile(folder) {
  const lines = [];
  for (const d of DIR_EXCLUDES) lines.push(`- ${d}/**`, `- **/${d}/**`);
  for (const f of FILE_EXCLUDES) lines.push(`- ${f}`);
  for (const x of settingsOf(folder).exclude) lines.push(`- ${x}`);
  const file = path.join(FILE.filters, `${folder.name}.txt`);
  fs.mkdirSync(FILE.filters, { recursive: true });
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

const globToRegExp = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
const FILE_PATTERNS = FILE_EXCLUDES.map(globToRegExp);
/** Same rules as the rclone filter, for counting files and for ignoring change events inside excluded folders. */
function excluded(rel, extra = []) {
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.some((part) => DIR_EXCLUDES.includes(part))) return true;
  const name = parts[parts.length - 1] ?? "";
  return FILE_PATTERNS.some((re) => re.test(name)) || extra.some((x) => globToRegExp(x).test(name));
}

/** Files and bytes that will be mirrored, counted the way the filter will see them. */
async function measure(dir, extra) {
  let files = 0;
  let bytes = 0;
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try { entries = await fs.promises.readdir(path.join(dir, rel), { withFileTypes: true }); } catch { continue; }
    await Promise.all(entries.map(async (entry) => {
      const next = path.join(rel, entry.name);
      if (excluded(next, extra)) return;
      if (entry.isDirectory()) stack.push(next);
      else if (entry.isFile()) { files += 1; try { bytes += (await fs.promises.stat(path.join(dir, next))).size; } catch { /* vanished */ } }
    }));
  }
  return { files, bytes };
}

// ---------------------------------------------------------------------------------------------- rclone
function runRclone(args, { echo = false, timeoutMs = 6 * 3600_000 } = {}) {
  const cfg = config();
  return new Promise((resolve) => {
    const child = spawn(cfg.rclone, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` } });
    runtime.child = child;
    let stats = null;
    const problems = [];
    const tail = [];
    const onLine = (line) => {
      if (!line.trim()) return;
      if (echo) { process.stdout.write(`${line}\n`); }
      try {
        const entry = JSON.parse(line);
        if (entry.stats) stats = entry.stats;
        if (/error|critical|fatal/i.test(entry.level ?? "") && entry.msg) problems.push(String(entry.msg));
        else if (entry.msg) tail.push(String(entry.msg));
      } catch { tail.push(line); }
    };
    let buffer = "";
    const feed = (chunk) => { buffer += chunk.toString(); let at; while ((at = buffer.indexOf("\n")) !== -1) { onLine(buffer.slice(0, at)); buffer = buffer.slice(at + 1); } };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); runtime.child = null; resolve({ code: -1, stats, problems: [error.code === "ENOENT" ? "rclone is not installed (brew install rclone)" : error.message], tail }); });
    child.on("close", (code) => { clearTimeout(timer); runtime.child = null; if (buffer) onLine(buffer); resolve({ code: code ?? -1, stats, problems, tail }); });
  });
}

/** Turns what rclone said into one sentence a person can act on. */
function explain(result) {
  const text = [...result.problems, ...result.tail.slice(-3)].join(" | ");
  if (/not installed/.test(text)) return "rclone is not installed. Run: brew install rclone";
  if (/didn't find section in config file|not found in config|remote .* not found/i.test(text)) return `The Drive remote "${config().remote}" is not set up. Run: rclone config`;
  if (/max-delete|too many deletes|delete limit/i.test(text)) return "Safety stop: this would delete far more files from Drive than usual. If that is expected, run: drivesync sync NAME --force";
  if (/invalid_grant|token expired|oauth2/i.test(text)) return "Google sign-in expired. Run: rclone config reconnect gdrive:";
  if (/quota|rateLimit|userRateLimit|storageQuotaExceeded|upload limit/i.test(text)) return "Google Drive refused for now (quota or rate limit). It will retry later.";
  if (/couldn't connect|no such host|dial tcp|i\/o timeout|network is unreachable/i.test(text)) return "No internet connection. It will retry.";
  return (result.problems[0] ?? result.tail.slice(-1)[0] ?? `rclone stopped with code ${result.code}`).slice(0, 300);
}

// ---------------------------------------------------------------------------------------------- one folder
async function gitBundle(folder, dest, st) {
  if (!fs.existsSync(path.join(folder.path, ".git"))) return;
  const refs = await new Promise((resolve) => { const c = spawn("git", ["-C", folder.path, "for-each-ref", "--format=%(objectname) %(refname)"], { stdio: ["ignore", "pipe", "ignore"] }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.on("close", () => resolve(out)); c.on("error", () => resolve("")); });
  if (!refs.trim()) return;
  const hash = createHash("sha1").update(refs).digest("hex");
  if (st.lastRefs === hash) return;
  const cfg = config();
  const tmp = path.join(os.tmpdir(), `drivesync-${folder.name}.bundle`);
  const made = await new Promise((resolve) => { const c = spawn("git", ["-C", folder.path, "bundle", "create", tmp, "--all"], { stdio: "ignore" }); c.on("close", (code) => resolve(code === 0)); c.on("error", () => resolve(false)); });
  if (!made) return;
  const sent = await runRclone(["copyto", tmp, `${cfg.remote}:${cfg.gitRoot}/${folder.name}.bundle`, "--use-json-log", "--log-level", "ERROR"]);
  fs.rmSync(tmp, { force: true });
  if (sent.code === 0) { st.lastRefs = hash; addEvent(`Saved the git history of ${folder.name}`); }
}

async function syncFolder(folder, { reason, dry = false, force = false, echo = false }) {
  const cfg = config();
  const st = { ...(state().folders[folder.name] ?? {}) };
  // Saves this folder's record on top of whatever is on disk now, so a pause or a new folder set meanwhile is not undone.
  const commit = () => { const fresh = state(); fresh.folders[folder.name] = { ...fresh.folders[folder.name], ...st }; saveState(fresh); };
  const started = Date.now();
  if (!fs.existsSync(folder.path)) return { skipped: "unmounted" };
  const { mode, exclude } = settingsOf(folder);
  const measured = await measure(folder.path, exclude);
  // An empty source is almost always a disk that did not mount properly. Never mirror that onto Drive.
  if (measured.files === 0) { st.lastError = "The folder looks empty, so nothing was synced (a mirror of nothing would erase the copy on Drive)."; st.failedAt = Date.now(); st.failures = (st.failures ?? 0) + 1; commit(); return { error: st.lastError }; }
  const limit = force ? -1 : Math.max(20, Math.ceil((measured.files * cfg.maxDeletePercent) / 100));
  const dest = `${cfg.remote}:${cfg.root}/${folder.name}`;
  const args = [mode, folder.path, dest, "--backup-dir", `${cfg.remote}:${cfg.archive}/${folder.name}/${today()}`, "--filter-from", filterFile(folder),
    "--transfers", "4", "--checkers", "8", "--tpslimit", "8", "--drive-chunk-size", "64M", "--drive-stop-on-upload-limit", "--create-empty-src-dirs"];
  if (mode === "sync") args.push("--max-delete", String(limit));
  if (dry) args.push("--dry-run", "-v");
  else args.push("--use-json-log", "--stats", "15s", "--stats-log-level", "NOTICE", "--log-level", "NOTICE");
  log(`sync ${folder.name} (${reason}${dry ? ", dry run" : ""}): ${measured.files} files`);
  const result = await runRclone(args, { echo: echo || dry });
  if (dry) return { dry: true, code: result.code };
  st.lastDurationMs = Date.now() - started;
  st.files = measured.files;
  st.bytes = measured.bytes;
  if (result.code === 0) {
    st.lastOk = iso(); st.lastError = undefined; st.failures = 0; st.failedAt = undefined;
    st.transferred = result.stats?.transfers ?? 0;
    if ((reason === "daily" || reason === "manual" || reason === "startup") && mode === "sync") await gitBundle(folder, dest, st).catch((error) => log(`git bundle failed for ${folder.name}: ${error.message}`));
    commit();
    if (st.transferred || result.stats?.deletes) addEvent(`Synced ${folder.name}: ${st.transferred ?? 0} changed${result.stats?.deletes ? `, ${result.stats.deletes} removed` : ""} (${measured.files.toLocaleString()} files, ${human(measured.bytes)})`);
    return { ok: true };
  }
  st.lastError = explain(result);
  st.failedAt = Date.now();
  st.failures = (st.failures ?? 0) + 1;
  log(`sync ${folder.name} failed: ${st.lastError}`);
  addEvent(`Could not sync ${folder.name}: ${st.lastError}`);
  notify(folder.name, st);
  commit();
  return { error: st.lastError };
}

/** At most one macOS notification per folder every three hours. */
function notify(name, st) {
  if (st.notifiedAt && Date.now() - st.notifiedAt < 3 * 3600_000) return;
  st.notifiedAt = Date.now();
  if (process.platform !== "darwin") return;
  const message = `${name}: ${st.lastError}`.replace(/["\\]/g, "").slice(0, 180);
  spawn("osascript", ["-e", `display notification "${message}" with title "Drive sync"`], { stdio: "ignore" }).on("error", () => undefined);
}

async function prune() {
  const cfg = config();
  await runRclone(["delete", `${cfg.remote}:${cfg.archive}`, "--min-age", `${cfg.keepDays}d`, "--use-json-log", "--log-level", "CRITICAL"]);
  await runRclone(["rmdirs", `${cfg.remote}:${cfg.archive}`, "--leave-root", "--use-json-log", "--log-level", "CRITICAL"]);
}

// ---------------------------------------------------------------------------------------------- daemon
const runtime = { child: null, running: null, queue: [], dirty: new Map(), watchers: new Map(), events: [], acks: [], lastBeat: 0, lastOnline: { at: 0, value: false }, firstTick: true, stop: false, serverWarned: false };

function addEvent(text) { runtime.events.push({ at: iso(), text }); if (runtime.events.length > 20) runtime.events.shift(); log(text); }

async function online() {
  if (process.env.DRIVESYNC_ASSUME_ONLINE === "1") return true;
  if (Date.now() - runtime.lastOnline.at < 25_000) return runtime.lastOnline.value;
  let value = false;
  try { await fetch("https://www.googleapis.com/generate_204", { method: "HEAD", signal: AbortSignal.timeout(4000) }); value = true; } catch { value = false; }
  runtime.lastOnline = { at: Date.now(), value };
  return value;
}

function enqueue(name, reason, { manual = false, front = false } = {}) {
  const queued = runtime.queue.find((item) => item.name === name);
  if (queued) { if (manual) queued.manual = true; return; }
  if (runtime.running?.name === name) return;
  const item = { name, reason, manual };
  if (front) runtime.queue.unshift(item); else runtime.queue.push(item);
}

function watch(folder) {
  if (runtime.watchers.has(folder.name) || !fs.existsSync(folder.path)) return;
  try {
    const extra = settingsOf(folder).exclude;
    const watcher = fs.watch(folder.path, { recursive: true }, (_event, file) => {
      if (!file || excluded(String(file), extra)) return;
      const entry = runtime.dirty.get(folder.name);
      runtime.dirty.set(folder.name, { first: entry?.first ?? Date.now(), last: Date.now() });
    });
    watcher.on("error", () => { watcher.close(); runtime.watchers.delete(folder.name); });
    runtime.watchers.set(folder.name, watcher);
  } catch (error) { log(`cannot watch ${folder.name}: ${error.message} (it will still sync on the schedule)`); }
}

function folderReport() {
  const all = state();
  return folders().map((folder) => {
    const st = all.folders[folder.name] ?? {};
    const { mode } = settingsOf(folder);
    let phase = "idle";
    if (!fs.existsSync(folder.path)) phase = "unmounted";
    else if (runtime.running?.name === folder.name) phase = "syncing";
    else if (runtime.queue.some((item) => item.name === folder.name)) phase = "queued";
    else if (st.lastError && st.failedAt) phase = "error";
    else if (all.paused) phase = "paused";
    return { name: folder.name, path: folder.path, state: phase, mode, lastOk: st.lastOk, lastError: st.lastError, lastDurationMs: st.lastDurationMs, files: st.files, bytes: st.bytes, transferred: st.transferred };
  });
}

async function heartbeat() {
  const cfg = config();
  if (!cfg.server || !cfg.token) { if (!runtime.serverWarned) { runtime.serverWarned = true; log("no server/token in config: the Workspace will not see this computer (run drivesync init)"); } return; }
  const acks = runtime.acks.splice(0);
  try {
    const response = await fetch(`${cfg.server.replace(/\/$/, "")}/api/workspace/sync`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ device: cfg.device, name: cfg.deviceName, platform: process.platform, version: VERSION, paused: state().paused, folders: folderReport(), events: runtime.events, acks }),
    });
    if (!response.ok) { runtime.acks.unshift(...acks); if (!runtime.beatFailed) log(`Workspace answered ${response.status}${response.status === 401 ? " (token does not match WORKSPACE_SYNC_TOKEN)" : response.status === 503 ? " (WORKSPACE_SYNC_TOKEN is not set on the server)" : ""}`); runtime.beatFailed = true; return; }
    runtime.beatFailed = false;
    const data = await response.json();
    for (const command of Array.isArray(data.commands) ? data.commands : []) { handle(command); runtime.acks.push(command.id); }
  } catch (error) { runtime.acks.unshift(...acks); if (!runtime.beatFailed) log(`cannot reach the Workspace: ${error.message}`); runtime.beatFailed = true; }
}

function handle(command) {
  const all = state();
  if (command.type === "pause" || command.type === "resume") { all.paused = command.type === "pause"; saveState(all); addEvent(all.paused ? "Paused from the Workspace" : "Resumed from the Workspace"); return; }
  if (command.type === "sync") {
    const targets = command.folder ? folders().filter((folder) => folder.name === command.folder) : folders();
    if (command.folder && !targets.length) { addEvent(`Asked to sync "${command.folder}", which is not a marked folder`); return; }
    addEvent(`Sync requested from the Workspace${command.folder ? `: ${command.folder}` : ""}`);
    for (const folder of targets) enqueue(folder.name, "manual", { manual: true, front: true });
  }
}

async function tick() {
  const cfg = config();
  const all = state();
  const list = folders();
  const sec = FAST ? 1000 : 60_000;
  for (const folder of list) watch(folder);
  for (const name of [...runtime.watchers.keys()]) if (!list.some((folder) => folder.name === name)) { runtime.watchers.get(name).close(); runtime.watchers.delete(name); }

  if (!all.paused) {
    const t = Date.now();
    const d = new Date();
    const [hh, mm] = cfg.dailyAt.split(":").map(Number);
    const dailyDue = all.lastDaily !== today() && (d.getHours() > hh || (d.getHours() === hh && d.getMinutes() >= mm));
    for (const folder of list) {
      const st = all.folders[folder.name] ?? {};
      const dirty = runtime.dirty.get(folder.name);
      const quiet = dirty && (t - dirty.last >= cfg.debounceSeconds * (FAST ? 1000 : 1000) || t - dirty.first >= 10 * sec);
      const last = st.lastOk ? Date.parse(st.lastOk) : 0;
      const backoff = st.failedAt ? Math.min(60, 5 * 2 ** Math.min(4, (st.failures ?? 1) - 1)) * sec : 0;
      if (st.failedAt && t - st.failedAt < backoff) continue;
      if (runtime.firstTick) enqueue(folder.name, "startup");
      else if (st.failedAt && t - st.failedAt >= backoff) enqueue(folder.name, "retry");
      else if (dailyDue) enqueue(folder.name, "daily");
      else if (quiet) { runtime.dirty.delete(folder.name); enqueue(folder.name, "changed"); }
      else if (t - last >= cfg.intervalMinutes * sec) enqueue(folder.name, "scheduled");
    }
    if (dailyDue) { const fresh = state(); fresh.lastDaily = today(); saveState(fresh); runtime.pruneDue = true; }
  }
  runtime.firstTick = false;

  if (!runtime.running && runtime.queue.length && (await online())) {
    const index = runtime.queue.findIndex((item) => item.manual || !state().paused);
    if (index !== -1) {
      const [item] = runtime.queue.splice(index, 1);
      const folder = folders().find((f) => f.name === item.name);
      if (folder) {
        runtime.running = item;
        syncFolder(folder, { reason: item.reason, force: false }).catch((error) => log(`sync crashed: ${error.message}`)).finally(() => { runtime.running = null; });
      }
    }
  }
  if (runtime.pruneDue && !runtime.running && !runtime.queue.length && (await online())) { runtime.pruneDue = false; runtime.running = { name: "(archive)" }; prune().catch(() => undefined).finally(() => { runtime.running = null; }); }

  if (Date.now() - runtime.lastBeat >= cfg.heartbeatSeconds * (FAST ? 1000 : 1000)) { runtime.lastBeat = Date.now(); await heartbeat(); }
}

async function daemon() {
  fs.mkdirSync(HOME, { recursive: true });
  const other = Number(fs.existsSync(FILE.pid) ? fs.readFileSync(FILE.pid, "utf8") : 0);
  if (other && other !== process.pid) { try { process.kill(other, 0); console.error(`drivesync is already running (pid ${other}).`); process.exit(1); } catch { /* stale pid file */ } }
  fs.writeFileSync(FILE.pid, String(process.pid));
  const quit = () => { runtime.stop = true; runtime.child?.kill("SIGTERM"); fs.rmSync(FILE.pid, { force: true }); process.exit(0); };
  process.on("SIGTERM", quit);
  process.on("SIGINT", quit);
  log(`drivesync ${VERSION} started on ${config().deviceName}`);
  addEvent("drivesync started");
  while (!runtime.stop) {
    try { await tick(); } catch (error) { log(`tick failed: ${error.stack ?? error.message}`); }
    await sleep(FAST ? 500 : 5000);
  }
}

// ---------------------------------------------------------------------------------------------- commands
const usage = `drivesync ${VERSION}: mirror marked folders to Google Drive

  drivesync init [--server URL]        create the config and a sync token for the Workspace
  drivesync add PATH [--name N] [--copy] [--marker]   mark a folder (--copy: never delete anything on Drive;
                                       --marker: also write a .drivesync file where you can list extra excludes)
  drivesync remove NAME|PATH           unmark a folder (its copy on Drive is left alone)
  drivesync list                       marked folders
  drivesync status                     how each folder is doing
  drivesync sync [NAME] [--dry-run] [--force]   sync now (dry run shows what would change)
  drivesync doctor                     check rclone, Drive, the Workspace link and the folders
  drivesync install | uninstall        run in the background from login (launchd)
  drivesync logs                       the last log lines
  drivesync daemon                     the background process (started by launchd)
`;

function flag(args, name) { const i = args.indexOf(name); if (i === -1) return undefined; const value = args[i + 1]; args.splice(i, value && !value.startsWith("--") ? 2 : 1); return value && !value.startsWith("--") ? value : true; }

function init(args) {
  const server = flag(args, "--server");
  const cfg = readJson(FILE.config, {});
  if (!cfg.token) cfg.token = randomBytes(30).toString("base64url");
  if (typeof server === "string") cfg.server = server;
  cfg.server ||= DEFAULTS.server;
  writeJson(FILE.config, cfg, 0o600);
  console.log(`Config: ${FILE.config}\n\nSet this in Vercel (Project → Settings → Environment Variables, Sensitive, Production) and redeploy:\n\n  WORKSPACE_SYNC_TOKEN=${cfg.token}\n\nThen: rclone config   (new remote named "${DEFAULTS.remote}", type drive, scope drive)\n      drivesync doctor\n      drivesync add /path/to/folder\n      drivesync install`);
}

function add(args) {
  const name = flag(args, "--name");
  const copy = flag(args, "--copy") === true;
  const withMarker = flag(args, "--marker") === true;
  const target = args[0];
  if (!target) { console.error("Give the folder: drivesync add /path/to/folder"); process.exit(1); }
  const full = path.resolve(target.replace(/^~(?=$|\/)/, os.homedir()));
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) { console.error(`Not a folder: ${full}`); process.exit(1); }
  const list = folders();
  if (list.some((folder) => folder.path === full)) { console.log(`Already marked: ${full}`); return; }
  const base = (typeof name === "string" ? name : path.basename(full)).replace(/[\/\\:]/g, "-").trim() || "folder";
  let unique = base; let n = 2;
  while (list.some((folder) => folder.name === unique)) unique = `${base}-${n++}`;
  list.push({ name: unique, path: full, ...(copy ? { mode: "copy" } : {}) });
  writeJson(FILE.folders, list);
  // A marker file is only written on request: it would show up as an untracked file in a git repository.
  if (withMarker && !fs.existsSync(path.join(full, ".drivesync"))) { try { fs.writeFileSync(path.join(full, ".drivesync"), `${JSON.stringify({ mode: copy ? "copy" : "sync", exclude: [] }, null, 2)}\n`); } catch { /* read-only folder: the registry is enough */ } }
  console.log(`Marked "${unique}" → Drive/${config().root}/${unique}   (${copy ? "copy only" : "mirror, deleted files are kept in the archive"})\nCheck first with: drivesync sync ${unique} --dry-run`);
}

function remove(args) {
  const key = args[0];
  const list = folders();
  const keep = list.filter((folder) => folder.name !== key && folder.path !== path.resolve(key ?? ""));
  if (keep.length === list.length) { console.error(`No marked folder "${key}". See: drivesync list`); process.exit(1); }
  writeJson(FILE.folders, keep);
  console.log("Unmarked. The copy already on Drive is left as it is.");
}

function status() {
  const all = state();
  const list = folders();
  if (!list.length) { console.log("No folders yet. Mark one: drivesync add /path/to/folder"); return; }
  console.log(all.paused ? "PAUSED\n" : "");
  for (const folder of list) {
    const st = all.folders[folder.name] ?? {};
    const where = fs.existsSync(folder.path) ? "" : "  [disk not connected]";
    console.log(`${folder.name.padEnd(28)} ${st.lastError ? "ERROR  " : st.lastOk ? "ok     " : "new    "} ${st.lastOk ? `synced ${st.lastOk}` : "never synced"}${st.files ? `  ${st.files} files ${human(st.bytes)}` : ""}${where}\n${"".padEnd(28)} ${folder.path}${st.lastError ? `\n${"".padEnd(28)} ${st.lastError}` : ""}`);
  }
  const alive = fs.existsSync(FILE.pid) && (() => { try { process.kill(Number(fs.readFileSync(FILE.pid, "utf8")), 0); return true; } catch { return false; } })();
  console.log(`\nBackground process: ${alive ? "running" : "not running (drivesync install)"}`);
}

async function syncCommand(args) {
  const dry = flag(args, "--dry-run") === true;
  const force = flag(args, "--force") === true;
  const list = folders();
  const targets = args[0] ? list.filter((folder) => folder.name === args[0]) : list;
  if (!targets.length) { console.error(args[0] ? `No marked folder "${args[0]}".` : "No folders yet."); process.exit(1); }
  for (const folder of targets) {
    const result = await syncFolder(folder, { reason: "manual", dry, force, echo: true });
    console.log(result.skipped ? `${folder.name}: skipped (${result.skipped})` : result.error ? `${folder.name}: ${result.error}` : `${folder.name}: ${dry ? "dry run finished" : "done"}`);
  }
}

async function doctor() {
  const cfg = config();
  const say = (ok, text, hint) => console.log(`${ok ? "✓" : "✗"} ${text}${!ok && hint ? `\n    → ${hint}` : ""}`);
  say(Number(process.versions.node.split(".")[0]) >= 18, `Node ${process.versions.node}`, "Install Node 18 or newer");
  const version = await runRclone(["version"], { timeoutMs: 15_000 });
  say(version.code === 0, version.code === 0 ? "rclone is installed" : "rclone is not installed", "brew install rclone");
  if (version.code === 0) {
    const remotes = await new Promise((resolve) => { const c = spawn(cfg.rclone, ["listremotes"], { stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` } }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.on("close", () => resolve(out)); });
    const has = remotes.split("\n").some((line) => line.trim() === `${cfg.remote}:`);
    say(has, `Drive remote "${cfg.remote}" exists`, `rclone config → n → name ${cfg.remote} → storage "drive" → follow the browser sign-in`);
    if (has) { const probe = await runRclone(["lsd", `${cfg.remote}:`, "--max-depth", "1", "--use-json-log", "--log-level", "ERROR"], { timeoutMs: 40_000 }); say(probe.code === 0, "Google Drive answers", explain(probe)); }
  }
  say(!!cfg.token, "Workspace token is set", "drivesync init");
  if (cfg.token && cfg.server) {
    try {
      const response = await fetch(`${cfg.server.replace(/\/$/, "")}/api/workspace/sync`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ device: cfg.device, name: cfg.deviceName, platform: process.platform, version: VERSION, folders: folderReport(), events: [] }) });
      say(response.ok, response.ok ? `Workspace at ${cfg.server} sees this computer` : `Workspace answered ${response.status}`, response.status === 503 ? "Add WORKSPACE_SYNC_TOKEN in Vercel and redeploy" : response.status === 401 ? "The token in Vercel differs from ~/.drivesync/config.json" : "Check the server address");
    } catch (error) { say(false, `Cannot reach ${cfg.server}`, error.message); }
  }
  for (const folder of folders()) say(fs.existsSync(folder.path), `Folder ${folder.name}: ${folder.path}`, "Connect the disk or run: drivesync remove " + folder.name);
}

function plist() {
  const script = path.join(HOME, "drivesync.mjs");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${script}</string><string>daemon</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>${path.join(HOME, "logs", "launchd.out")}</string>
  <key>StandardErrorPath</key><string>${path.join(HOME, "logs", "launchd.err")}</string>
</dict></plist>
`;
}
const run = (cmd, args) => new Promise((resolve) => { const c = spawn(cmd, args, { stdio: "inherit" }); c.on("close", resolve); c.on("error", () => resolve(1)); });

async function install() {
  fs.mkdirSync(path.join(HOME, "logs"), { recursive: true });
  // Run from a copy in the home folder, so it still starts when the project's disk is not connected.
  const self = new URL(import.meta.url).pathname;
  if (path.resolve(self) !== path.join(HOME, "drivesync.mjs")) fs.copyFileSync(self, path.join(HOME, "drivesync.mjs"));
  const agent = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
  fs.mkdirSync(path.dirname(agent), { recursive: true });
  fs.writeFileSync(agent, plist());
  const uid = process.getuid?.() ?? 501;
  await run("launchctl", ["bootout", `gui/${uid}/${LABEL}`]);
  const code = await run("launchctl", ["bootstrap", `gui/${uid}`, agent]);
  console.log(code === 0 ? `Installed. It starts at login and keeps running.\nTip: alias drivesync='node ${path.join(HOME, "drivesync.mjs")}'` : "launchctl refused; see the message above.");
}
async function uninstall() {
  const uid = process.getuid?.() ?? 501;
  await run("launchctl", ["bootout", `gui/${uid}/${LABEL}`]);
  fs.rmSync(path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`), { force: true });
  console.log("Removed from login. Your folders and the copies on Drive are untouched.");
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "init": init(rest); break;
  case "add": add(rest); break;
  case "remove": remove(rest); break;
  case "list": for (const folder of folders()) console.log(`${folder.name.padEnd(28)} ${folder.path}${folder.mode === "copy" ? "  (copy only)" : ""}`); break;
  case "status": status(); break;
  case "sync": await syncCommand(rest); break;
  case "daemon": await daemon(); break;
  case "doctor": await doctor(); break;
  case "install": await install(); break;
  case "uninstall": await uninstall(); break;
  case "logs": process.stdout.write(fs.existsSync(FILE.log) ? fs.readFileSync(FILE.log, "utf8").split("\n").slice(-60).join("\n") : "No log yet.\n"); break;
  default: console.log(usage);
}
