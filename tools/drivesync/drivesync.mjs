#!/usr/bin/env node
// drivesync: keeps marked folders mirrored to Google Drive with rclone, and reports to the Workspace.
// No dependencies beyond Node 18+ and rclone. Run `drivesync help`.
import { spawn } from "node:child_process";
import http from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.2.0";
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
  uiPort: 47821, uiToken: "",
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
function runRclone(args, { echo = false, capture = null, timeoutMs = 6 * 3600_000 } = {}) {
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
      if (capture && capture.length < 400) capture.push(line);
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

async function syncFolder(folder, { reason, dry = false, force = false, echo = false, capture = null }) {
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
  const result = await runRclone(args, { echo: (echo || dry) && !capture, capture });
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
  if (result.problems.length || result.tail.length) log(`  rclone said: ${[...result.problems, ...result.tail.slice(-2)].slice(0, 3).join(" | ").slice(0, 400)}`);
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
const runtime = { lastBeatAt: 0, lastBeatStatus: null, setup: { at: 0, busy: false, checks: [] }, connect: { running: false, lines: [] }, dry: false, child: null, running: null, queue: [], dirty: new Map(), watchers: new Map(), events: [], acks: [], lastBeat: 0, lastOnline: { at: 0, value: false }, firstTick: true, stop: false, serverWarned: false };

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
    return { name: folder.name, path: folder.path, state: phase, mode, lastOk: st.lastOk, lastError: st.lastError, lastDurationMs: st.lastDurationMs, files: st.files, bytes: st.bytes, transferred: st.transferred, checklist: phase === "unmounted" ? [] : checklistOf(folder.path) };
  });
}

// Counts the "- [ ]" and "- [x]" boxes in a folder's own README, ROADMAP, TODO or PLAN, so the Workspace can say how far a local project is.
// Only the counts and the first few open items leave the computer, never the files. Re-read only when a file changes.
const checklistMemo = new Map();
function checklistOf(dir) {
  const out = [];
  for (const file of ["README.md", "ROADMAP.md", "TODO.md", "PLAN.md"]) {
    try {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 400_000) continue;
      const memo = checklistMemo.get(full);
      if (memo && memo.mtime === stat.mtimeMs) { if (memo.value) out.push(memo.value); continue; }
      let done = 0, total = 0, fenced = false; const open = [];
      for (const line of fs.readFileSync(full, "utf8").split("\n")) {
        if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
        if (fenced) continue;
        const m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/);
        if (!m) continue;
        total += 1;
        if (m[1] === " ") { if (open.length < 5 && m[2].trim()) open.push(m[2].replace(/\s+/g, " ").trim().slice(0, 100)); } else done += 1;
      }
      const value = total > 0 ? { file, done, total, open } : null;
      checklistMemo.set(full, { mtime: stat.mtimeMs, value });
      if (value) out.push(value);
    } catch { /* no such file */ }
  }
  return out;
}

async function heartbeat() {
  const cfg = config();
  if (!cfg.server || !cfg.token) { runtime.lastBeatStatus = null; if (!runtime.serverWarned) { runtime.serverWarned = true; log("no server/token in config: the Workspace will not see this computer (run drivesync init)"); } return; }
  const acks = runtime.acks.splice(0);
  try {
    const response = await fetch(`${cfg.server.replace(/\/$/, "")}/api/workspace/sync`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ device: cfg.device, name: cfg.deviceName, platform: process.platform, version: VERSION, paused: state().paused, folders: folderReport(), events: runtime.events, acks }),
    });
    runtime.lastBeatAt = Date.now(); runtime.lastBeatStatus = response.status;
    if (!response.ok) { runtime.acks.unshift(...acks); if (!runtime.beatFailed) log(`Workspace answered ${response.status}${response.status === 401 ? " (token does not match WORKSPACE_SYNC_TOKEN)" : response.status === 503 ? " (WORKSPACE_SYNC_TOKEN is not set on the server)" : ""}`); runtime.beatFailed = true; return; }
    runtime.beatFailed = false;
    const data = await response.json();
    for (const command of Array.isArray(data.commands) ? data.commands : []) { handle(command); runtime.acks.push(command.id); }
  } catch (error) { runtime.lastBeatStatus = 0; runtime.acks.unshift(...acks); if (!runtime.beatFailed) log(`cannot reach the Workspace: ${error.message}`); runtime.beatFailed = true; }
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
  // Nothing is uploaded until the person says so: a first run waits for Start (in the window, in the Workspace, or `drivesync resume`).
  if (!fs.existsSync(FILE.state)) { saveState({ folders: {}, paused: true, firstRun: true }); addEvent("Waiting for you to press Start"); }
  startUi();
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
  drivesync app                        build "Drive Sync.app" in ~/Applications (the window, no Terminal needed)
  drivesync pause | resume             stop / start syncing
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

/** Marks a folder. Throws a plain sentence when it should not be marked. Shared by the command line and the window. */
function addFolder({ target, name, copy = false, withMarker = false }) {
  if (!target) throw new Error("Give the folder: drivesync add /path/to/folder");
  const full = path.resolve(String(target).replace(/^~(?=$|\/)/, os.homedir()));
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error(`Not a folder: ${full}`);
  const home = os.homedir();
  if ([path.parse(full).root, home, path.join(home, "Library"), "/Users", "/Volumes", "/System", "/Applications", "/private"].includes(full)) throw new Error("That folder is too broad to sync. Pick one project folder instead.");
  const list = folders();
  const same = list.find((folder) => folder.path === full);
  if (same) return { already: true, name: same.name };
  const parent = list.find((folder) => full.startsWith(folder.path + path.sep));
  if (parent) throw new Error(`It is already inside "${parent.name}", which is being synced.`);
  const child = list.find((folder) => folder.path.startsWith(full + path.sep));
  if (child) throw new Error(`It contains "${child.name}", which is already marked. Unmark that one first.`);
  const base = (typeof name === "string" && name.trim() ? name : path.basename(full)).replace(/[\/\\:]/g, "-").trim() || "folder";
  let unique = base; let n = 2;
  while (list.some((folder) => folder.name === unique)) unique = `${base}-${n++}`;
  list.push({ name: unique, path: full, ...(copy ? { mode: "copy" } : {}) });
  writeJson(FILE.folders, list);
  // A marker file is only written on request: it would show up as an untracked file in a git repository.
  if (withMarker && !fs.existsSync(path.join(full, ".drivesync"))) { try { fs.writeFileSync(path.join(full, ".drivesync"), `${JSON.stringify({ mode: copy ? "copy" : "sync", exclude: [] }, null, 2)}\n`); } catch { /* read-only folder: the registry is enough */ } }
  return { name: unique, path: full, mode: copy ? "copy" : "sync" };
}

function removeFolder(key) {
  const list = folders();
  const keep = list.filter((folder) => folder.name !== key && folder.path !== path.resolve(String(key ?? "")));
  if (keep.length === list.length) throw new Error(`No marked folder "${key}".`);
  writeJson(FILE.folders, keep);
}

function add(args) {
  const name = flag(args, "--name");
  const copy = flag(args, "--copy") === true;
  const withMarker = flag(args, "--marker") === true;
  try {
    const result = addFolder({ target: args[0], name: typeof name === "string" ? name : undefined, copy, withMarker });
    console.log(result.already ? `Already marked: ${result.name}` : `Marked "${result.name}" → Drive/${config().root}/${result.name}   (${copy ? "copy only" : "mirror, deleted files are kept in the archive"})\nCheck first with: drivesync sync ${result.name} --dry-run`);
  } catch (error) { console.error(error.message); process.exit(1); }
}

function remove(args) {
  try { removeFolder(args[0]); console.log("Unmarked. The copy already on Drive is left as it is."); }
  catch (error) { console.error(`${error.message} See: drivesync list`); process.exit(1); }
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

const rcloneEnv = () => ({ ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` });
const rcloneOut = (args) => new Promise((resolve) => { const c = spawn(config().rclone, args, { stdio: ["ignore", "pipe", "ignore"], env: rcloneEnv() }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.on("close", () => resolve(out)); c.on("error", () => resolve("")); });

/** One health check per line: whether it passed, what it says, and what to do when it did not. */
async function doctorChecks() {
  const cfg = config();
  const out = [];
  const say = (id, ok, text, hint) => out.push({ id, ok, text, hint: ok ? undefined : hint });
  say("node", Number(process.versions.node.split(".")[0]) >= 18, `Node ${process.versions.node}`, "Install Node 18 or newer");
  const version = await runRclone(["version"], { timeoutMs: 15_000 });
  say("rclone", version.code === 0, version.code === 0 ? "rclone is installed" : "rclone is not installed", "brew install rclone");
  if (version.code === 0) {
    const has = (await rcloneOut(["listremotes"])).split("\n").some((line) => line.trim() === `${cfg.remote}:`);
    say("remote", has, `Drive remote "${cfg.remote}" exists`, `Connect Google Drive (or: rclone config → n → name ${cfg.remote} → storage "drive")`);
    if (has) { const probe = await runRclone(["lsd", `${cfg.remote}:`, "--max-depth", "1", "--use-json-log", "--log-level", "ERROR"], { timeoutMs: 40_000 }); say("drive", probe.code === 0, "Google Drive answers", explain(probe)); }
  }
  say("token", !!cfg.token, "Workspace token is set", "drivesync init");
  if (cfg.token && cfg.server) {
    try {
      const response = await fetch(`${cfg.server.replace(/\/$/, "")}/api/workspace/sync`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ device: cfg.device, name: cfg.deviceName, platform: process.platform, version: VERSION, folders: folderReport(), events: [] }) });
      say("workspace", response.ok, response.ok ? `Workspace at ${cfg.server} sees this computer` : `Workspace answered ${response.status}`, response.status === 503 ? "Add WORKSPACE_SYNC_TOKEN in Vercel and redeploy" : response.status === 401 ? "The token in Vercel differs from the one on this computer" : "Check the server address");
    } catch (error) { say("workspace", false, `Cannot reach ${cfg.server}`, error.message); }
  }
  for (const folder of folders()) say(`folder:${folder.name}`, fs.existsSync(folder.path), `Folder ${folder.name}: ${folder.path}`, "Connect the disk, or unmark the folder");
  return out;
}

async function doctor() {
  for (const check of await doctorChecks()) console.log(`${check.ok ? "✓" : "✗"} ${check.text}${check.hint ? `\n    → ${check.hint}` : ""}`);
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

const agentFile = () => path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const agentInstalled = () => fs.existsSync(agentFile());
// fileURLToPath, not .pathname: the app lives in "Drive Sync.app", and a space would arrive as %20.
const here = () => path.dirname(fileURLToPath(import.meta.url));

/** Copies the script (and the window's page) to the home folder, so it still starts when the project's disk is not connected. */
function copySelf() {
  fs.mkdirSync(path.join(HOME, "logs"), { recursive: true });
  for (const name of ["drivesync.mjs", "ui.html"]) {
    const from = path.join(here(), name);
    const to = path.join(HOME, name);
    if (fs.existsSync(from) && path.resolve(from) !== path.resolve(to)) fs.copyFileSync(from, to);
  }
}

/** Starts the background process at login. `handOver` is used by the window: this process steps aside so the new one can take the lock. */
function agentInstall({ handOver = false } = {}) {
  copySelf();
  fs.mkdirSync(path.dirname(agentFile()), { recursive: true });
  fs.writeFileSync(agentFile(), plist());
  const uid = process.getuid?.() ?? 501;
  const steps = `launchctl bootout gui/${uid}/${LABEL} 2>/dev/null; sleep 1; launchctl bootstrap gui/${uid} '${agentFile()}'`;
  if (handOver) { spawn("/bin/sh", ["-c", `sleep 1; ${steps}`], { detached: true, stdio: "ignore" }).unref(); return; }
  return steps;
}
function agentRemove({ handOver = false } = {}) {
  const uid = process.getuid?.() ?? 501;
  fs.rmSync(agentFile(), { force: true });
  const steps = `launchctl bootout gui/${uid}/${LABEL}`;
  if (handOver) { spawn("/bin/sh", ["-c", `sleep 1; ${steps}`], { detached: true, stdio: "ignore" }).unref(); return; }
  return steps;
}

async function install() {
  const steps = agentInstall();
  const uid = process.getuid?.() ?? 501;
  await run("launchctl", ["bootout", `gui/${uid}/${LABEL}`]);
  const code = await run("launchctl", ["bootstrap", `gui/${uid}`, agentFile()]);
  console.log(code === 0 ? `Installed. It starts at login and keeps running.\nTip: alias drivesync='node ${path.join(HOME, "drivesync.mjs")}'` : "launchctl refused; see the message above.");
  void steps;
}
async function uninstall() {
  agentRemove();
  const uid = process.getuid?.() ?? 501;
  await run("launchctl", ["bootout", `gui/${uid}/${LABEL}`]);
  console.log("Removed from login. Your folders and the copies on Drive are untouched.");
}

// ---------------------------------------------------------------------------------------------- the window
// The daemon serves a small page on 127.0.0.1 only. It needs the secret from the config (handed over by the app),
// the right Host header (against DNS rebinding) and, for changes, a custom header (browsers will not send it cross-site).
const uiFile = () => path.join(here(), "ui.html");
const sameToken = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && x.length > 0 && timingSafeEqual(new Uint8Array(x), new Uint8Array(y)); };

function ensureUiConfig() {
  const saved = readJson(FILE.config, {});
  if (!saved.uiToken) { saved.uiToken = randomBytes(24).toString("base64url"); writeJson(FILE.config, saved, 0o600); }
  return config();
}

function pickFolder() {
  if (process.env.DRIVESYNC_PICK) return Promise.resolve(process.env.DRIVESYNC_PICK);
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", "tell me to activate", "-e", 'POSIX path of (choose folder with prompt "Choose a folder to keep on Google Drive")'], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve(code === 0 && out.trim() ? out.trim().replace(/\/$/, "") : null));
    child.on("error", () => resolve(null));
  });
}

async function refreshSetup() {
  if (runtime.setup.busy) return;
  runtime.setup.busy = true;
  try { runtime.setup = { at: Date.now(), busy: true, checks: await doctorChecks() }; } catch (error) { log(`check failed: ${error.message}`); }
  runtime.setup.busy = false;
}

function connectDrive() {
  if (runtime.connect.running) return;
  const cfg = config();
  runtime.connect = { running: true, lines: [], startedAt: iso() };
  const child = spawn(cfg.rclone, ["config", "create", cfg.remote, "drive", "scope", "drive"], { stdio: ["ignore", "pipe", "pipe"], env: rcloneEnv() });
  const feed = (chunk) => {
    for (const raw of chunk.toString().split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      runtime.connect.lines.push(line.slice(0, 300));
      const link = line.match(/https?:\/\/127\.0\.0\.1:\d+\/auth\S*/);
      if (link) runtime.connect.url = link[0];
    }
    if (runtime.connect.lines.length > 30) runtime.connect.lines.splice(0, runtime.connect.lines.length - 30);
  };
  child.stdout.on("data", feed);
  child.stderr.on("data", feed);
  child.on("error", (error) => { runtime.connect = { ...runtime.connect, running: false, ok: false, error: error.code === "ENOENT" ? "rclone is not installed. Run: brew install rclone" : error.message }; });
  child.on("close", (code) => { runtime.connect.running = false; runtime.connect.ok = code === 0; if (code !== 0) runtime.connect.error = runtime.connect.lines.slice(-2).join(" ") || `rclone stopped with code ${code}`; setup(); });
  setTimeout(() => child.kill("SIGTERM"), 5 * 60_000).unref();
}
const setup = () => { void refreshSetup(); };

function uiState() {
  const cfg = config();
  const all = state();
  return {
    version: VERSION, device: cfg.deviceName, paused: !!all.paused, firstRun: !!all.firstRun,
    server: cfg.server, tokenSet: !!cfg.token, remote: cfg.remote, root: cfg.root, archive: cfg.archive,
    online: runtime.lastOnline.value || process.env.DRIVESYNC_ASSUME_ONLINE === "1",
    beat: { at: runtime.lastBeatAt || null, status: runtime.lastBeatStatus },
    folders: folderReport(), running: runtime.running?.name ?? null, queue: runtime.queue.map((item) => item.name),
    events: [...runtime.events].reverse(), setup: runtime.setup, connect: runtime.connect, dry: runtime.dry,
    login: { installed: agentInstalled(), underLaunchd: process.env.XPC_SERVICE_NAME === LABEL },
  };
}

function openThing(args) { spawn("open", args, { stdio: "ignore" }).on("error", () => undefined); }

async function uiApi(req, res, url, body) {
  const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  const route = `${req.method} ${url.pathname}`;
  if (route === "GET /api/state") return send(200, uiState());
  if (route === "GET /api/token") return send(200, { token: config().token });
  if (req.method === "POST") {
    if (url.pathname === "/api/folders/pick") return send(200, { path: await pickFolder() });
    if (url.pathname === "/api/folders") {
      try {
        const result = addFolder({ target: body.path, name: body.name, copy: body.copy === true });
        if (!result.already) addEvent(`Added ${result.name}`);
        return send(200, result);
      } catch (error) { return send(400, { error: error.message }); }
    }
    if (url.pathname === "/api/folders/remove") { try { removeFolder(body.name); addEvent(`Stopped syncing ${body.name}`); return send(200, { ok: true }); } catch (error) { return send(400, { error: error.message }); } }
    if (url.pathname === "/api/sync") { handle({ type: "sync", ...(body.name ? { folder: String(body.name) } : {}) }); return send(200, { ok: true }); }
    if (url.pathname === "/api/dry-run") {
      const folder = folders().find((item) => item.name === body.name);
      if (!folder) return send(404, { error: "No such folder." });
      if (runtime.running || runtime.dry) return send(409, { error: "A sync is running right now. Try again when it finishes." });
      runtime.dry = true;
      try {
        const lines = [];
        const result = await syncFolder(folder, { reason: "manual", dry: true, capture: lines });
        const moves = lines.filter((line) => /Skipped (copy|update|delete|move)|Would (copy|delete)/i.test(line));
        return send(200, { code: result.code ?? 0, skipped: result.skipped, error: result.error, lines: lines.slice(-200), copies: moves.filter((l) => /copy|update/i.test(l)).length, deletes: moves.filter((l) => /delete/i.test(l)).length });
      } finally { runtime.dry = false; }
    }
    if (url.pathname === "/api/pause" || url.pathname === "/api/resume") {
      const all = state(); all.paused = url.pathname === "/api/pause"; if (!all.paused) delete all.firstRun; saveState(all);
      addEvent(all.paused ? "Paused" : "Syncing started");
      return send(200, { ok: true });
    }
    if (url.pathname === "/api/open") {
      if (body.what === "drive") openThing(["https://drive.google.com/drive/my-drive"]);
      else if (body.what === "logs") openThing(["-R", FILE.log]);
      else { const folder = folders().find((item) => item.name === body.name); if (folder) openThing([folder.path]); }
      return send(200, { ok: true });
    }
    if (url.pathname === "/api/connect-drive") { connectDrive(); return send(200, { ok: true }); }
    if (url.pathname === "/api/check") { setup(); return send(200, { ok: true }); }
    if (url.pathname === "/api/test-workspace") { runtime.lastBeat = 0; await heartbeat(); return send(200, { status: runtime.lastBeatStatus }); }
    if (url.pathname === "/api/login") {
      if (body.on === true && !agentInstalled()) { agentInstall({ handOver: true }); setTimeout(() => process.kill(process.pid, "SIGTERM"), 500); return send(200, { ok: true, restarting: true }); }
      if (body.on === false && agentInstalled()) { agentRemove({ handOver: true }); return send(200, { ok: true, restarting: process.env.XPC_SERVICE_NAME === LABEL }); }
      return send(200, { ok: true });
    }
  }
  return send(404, { error: "not_found" });
}

function startUi() {
  const cfg = ensureUiConfig();
  const port = cfg.uiPort;
  const server = http.createServer(async (req, res) => {
    const reply = (status, type, text, headers = {}) => { res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...headers }); res.end(text); };
    try {
      const host = String(req.headers.host ?? "").toLowerCase();
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return reply(403, "text/plain", "Forbidden");
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (url.pathname === "/api/ping") return reply(200, "application/json", JSON.stringify({ ok: true, version: VERSION }));
      const token = readJson(FILE.config, {}).uiToken;
      if (url.pathname === "/" && sameToken(url.searchParams.get("t") ?? "", token)) return reply(302, "text/plain", "", { Location: "/", "Set-Cookie": `ds=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
      const cookie = Object.fromEntries(String(req.headers.cookie ?? "").split(";").map((part) => part.trim().split("=")).filter((pair) => pair[0]));
      if (!sameToken(cookie.ds ?? "", token)) return reply(401, "text/html; charset=utf-8", "<meta charset=utf-8><body style='font:16px system-ui;padding:40px'>Open <b>Drive Sync</b> from your Applications folder to use this window.</body>");
      if (req.method === "GET" && url.pathname === "/") return reply(200, "text/html; charset=utf-8", fs.readFileSync(uiFile(), "utf8"));
      let body = {};
      if (req.method === "POST") {
        if (req.headers["x-drivesync"] !== "1" || !String(req.headers["content-type"] ?? "").includes("application/json")) return reply(403, "application/json", JSON.stringify({ error: "forbidden" }));
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 20_000) return reply(413, "application/json", "{}"); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { return reply(400, "application/json", "{}"); }
      }
      await uiApi(req, res, url, body);
    } catch (error) { log(`window error: ${error.message}`); if (!res.headersSent) reply(500, "application/json", JSON.stringify({ error: "failed" })); }
  });
  server.requestTimeout = 0;
  server.on("error", (error) => log(`window server: ${error.message} (the sync keeps running; the window will not open)`));
  server.listen(port, "127.0.0.1", () => { log(`window at http://127.0.0.1:${port}`); setup(); });
}

// ---------------------------------------------------------------------------------------------- opening the window
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const readPid = () => { const pid = Number(fs.existsSync(FILE.pid) ? fs.readFileSync(FILE.pid, "utf8") : 0); return pid && pidAlive(pid) ? pid : 0; };
const dialog = (text, buttons) => new Promise((resolve) => {
  if (process.env.DRIVESYNC_NO_OPEN === "1") { console.log(`[dialog] ${text}`); resolve(null); return; }
  const child = spawn("osascript", ["-e", `display dialog "${text.replace(/"/g, "'")}" with title "Drive Sync" buttons {${buttons.map((b) => `"${b}"`).join(", ")}} default button "${buttons[buttons.length - 1]}"`], { stdio: ["ignore", "pipe", "ignore"] });
  let out = ""; child.stdout.on("data", (d) => { out += d; });
  child.on("close", (code) => resolve(code === 0 ? out.replace(/.*button returned:/s, "").trim() : null));
  child.on("error", () => resolve(null));
});

/** The window as an app-style Chrome window when a Chromium browser is installed, otherwise a normal browser tab. */
function openWindow(target) {
  if (process.env.DRIVESYNC_NO_OPEN === "1") { console.log(target); return; }
  const browsers = ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium"];
  const dirs = ["/Applications", path.join(os.homedir(), "Applications")];
  const found = browsers.find((name) => dirs.some((dir) => fs.existsSync(path.join(dir, `${name}.app`))));
  if (found) spawn("open", ["-na", found, "--args", `--app=${target}`, "--window-size=1040,800"], { stdio: "ignore" }).unref();
  else spawn("open", [target], { stdio: "ignore" }).unref();
}

async function ui() {
  const cfg = ensureUiConfig();
  const base = `http://127.0.0.1:${cfg.uiPort}`;
  const ping = async () => { try { return (await fetch(`${base}/api/ping`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
  const waitUp = async (seconds = 20) => { for (let i = 0; i < seconds * 4; i += 1) { if (await ping()) return true; await sleep(250); } return false; };
  if (!(await ping())) {
    const pid = readPid();
    if (pid) {
      // A background process from an older version is running without the window. Replace it, with the person's say-so.
      const answer = process.env.DRIVESYNC_YES === "1" ? "Update" : await dialog("Drive Sync needs a one-time update to show this window. It restarts in a few seconds; anything being uploaded carries on afterwards.", ["Not now", "Update"]);
      if (answer !== "Update") return;
      copySelf();
      if (agentInstalled()) {
        const uid = process.getuid?.() ?? 501;
        fs.writeFileSync(agentFile(), plist());
        await run("launchctl", ["bootout", `gui/${uid}/${LABEL}`]);
        await run("launchctl", ["bootstrap", `gui/${uid}`, agentFile()]);
      } else {
        try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
        await sleep(1200);
        spawn(process.execPath, [path.join(HOME, "drivesync.mjs"), "daemon"], { detached: true, stdio: "ignore" }).unref();
      }
    } else {
      copySelf();
      spawn(process.execPath, [path.join(HOME, "drivesync.mjs"), "daemon"], { detached: true, stdio: "ignore" }).unref();
    }
    if (!(await waitUp())) { await dialog("Drive Sync could not start. Open Terminal and run: drivesync logs", ["OK"]); return; }
  }
  openWindow(`${base}/?t=${ensureUiConfig().uiToken}`);
}

function setPaused(on) {
  const all = state();
  all.paused = on; if (!on) delete all.firstRun;
  saveState(all);
  console.log(on ? "Paused. Syncing is off until you resume." : "Syncing is on.");
}

// ---------------------------------------------------------------------------------------------- the app
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4ff2a"/><stop offset="1" stop-color="#2fd2a1"/></linearGradient></defs><rect x="64" y="64" width="896" height="896" rx="200" fill="url(#g)"/><path d="M330 690a140 140 0 0 1 20-278 190 190 0 0 1 356 36 120 120 0 0 1-12 242z" fill="#0b0c06" opacity=".9"/><path d="M512 640V470m0 0-70 70m70-70 70 70" fill="none" stroke="#d4ff2a" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_SWIFT = `import AppKit
let size: CGFloat = 1024
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext
ctx.translateBy(x: 0, y: size); ctx.scaleBy(x: 1, y: -1)
ctx.saveGState()
ctx.addPath(CGPath(roundedRect: CGRect(x: 64, y: 64, width: 896, height: 896), cornerWidth: 200, cornerHeight: 200, transform: nil)); ctx.clip()
let colors = [CGColor(srgbRed: 0.83, green: 1.0, blue: 0.16, alpha: 1), CGColor(srgbRed: 0.18, green: 0.82, blue: 0.63, alpha: 1)] as CFArray
ctx.drawLinearGradient(CGGradient(colorsSpace: srgb, colors: colors, locations: [0, 1])!, start: CGPoint(x: 64, y: 64), end: CGPoint(x: 960, y: 960), options: [])
ctx.restoreGState()
ctx.saveGState()
ctx.clip(to: CGRect(x: 0, y: 0, width: size, height: 690))
let cloud = CGMutablePath()
for (cx, cy, r) in [(355.0, 555.0, 135.0), (520.0, 495.0, 190.0), (690.0, 570.0, 120.0)] { cloud.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r)) }
cloud.addRect(CGRect(x: 355, y: 555, width: 335, height: 135))
ctx.setFillColor(CGColor(srgbRed: 0.04, green: 0.05, blue: 0.02, alpha: 1))
ctx.addPath(cloud); ctx.fillPath()
ctx.restoreGState()
ctx.setStrokeColor(CGColor(srgbRed: 0.83, green: 1.0, blue: 0.16, alpha: 1)); ctx.setLineWidth(44); ctx.setLineCap(.round); ctx.setLineJoin(.round)
ctx.move(to: CGPoint(x: 512, y: 640)); ctx.addLine(to: CGPoint(x: 512, y: 470))
ctx.move(to: CGPoint(x: 442, y: 540)); ctx.addLine(to: CGPoint(x: 512, y: 470)); ctx.addLine(to: CGPoint(x: 582, y: 540))
ctx.strokePath()
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
`;
const quiet = (cmd, args) => new Promise((resolve) => { const c = spawn(cmd, args, { stdio: "ignore" }); c.on("close", resolve); c.on("error", () => resolve(1)); });

/** The app icon: drawn with Swift (transparent corners); Quick Look on an SVG is the fallback. */
async function makeIcon(resources) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "drivesync-icon-"));
  try {
    const png = path.join(work, "icon.png");
    fs.writeFileSync(path.join(work, "icon.swift"), ICON_SWIFT);
    if ((await quiet("swift", [path.join(work, "icon.swift"), png])) !== 0 || !fs.existsSync(png)) {
      fs.writeFileSync(path.join(work, "icon.svg"), ICON_SVG);
      await quiet("qlmanage", ["-t", "-s", "1024", "-o", work, path.join(work, "icon.svg")]);
      fs.renameSync(path.join(work, "icon.svg.png"), png);
    }
    const set = path.join(work, "AppIcon.iconset");
    fs.mkdirSync(set);
    for (const [size, name] of [[16, "icon_16x16"], [32, "icon_16x16@2x"], [32, "icon_32x32"], [64, "icon_32x32@2x"], [128, "icon_128x128"], [256, "icon_128x128@2x"], [256, "icon_256x256"], [512, "icon_256x256@2x"], [512, "icon_512x512"], [1024, "icon_512x512@2x"]]) {
      await quiet("sips", ["-z", String(size), String(size), png, "--out", path.join(set, `${name}.png`)]);
    }
    return (await quiet("iconutil", ["-c", "icns", set, "-o", path.join(resources, "AppIcon.icns")])) === 0;
  } catch { return false; } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

async function buildApp(args) {
  const to = flag(args, "--to");
  const dest = typeof to === "string" ? path.resolve(to) : path.join(os.homedir(), "Applications");
  const app = path.join(dest, "Drive Sync.app");
  const resources = path.join(app, "Contents", "Resources");
  fs.rmSync(app, { recursive: true, force: true });
  fs.mkdirSync(path.join(app, "Contents", "MacOS"), { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  for (const name of ["drivesync.mjs", "ui.html"]) fs.copyFileSync(path.join(here(), name), path.join(resources, name));
  fs.writeFileSync(path.join(app, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Drive Sync</string>
  <key>CFBundleDisplayName</key><string>Drive Sync</string>
  <key>CFBundleIdentifier</key><string>space.alexprojects.drivesync.app</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAppleEventsUsageDescription</key><string>Drive Sync asks you to pick folders and shows short messages.</string>
</dict></plist>
`);
  const launcher = path.join(app, "Contents", "MacOS", "launcher");
  fs.writeFileSync(launcher, `#!/bin/bash
# Opens the Drive Sync window (starting the background process first if needed).
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
NODE=""
for candidate in "$(command -v node)" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then NODE="$candidate"; break; fi
done
if [ -z "$NODE" ]; then
  osascript -e 'display dialog "Drive Sync needs Node.js. Install it from nodejs.org, then open Drive Sync again." with title "Drive Sync" buttons {"OK"} default button "OK"'
  exit 1
fi
exec "$NODE" "$DIR/drivesync.mjs" ui
`, { mode: 0o755 });
  const icon = await makeIcon(resources);
  await quiet("touch", [app]);
  console.log(`Built ${app}${icon ? "" : " (without a custom icon)"}\nOpen it from Finder, or drag it to the Dock.`);
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
  case "ui": await ui(); break;
  case "app": await buildApp(rest); break;
  case "pause": setPaused(true); break;
  case "resume": setPaused(false); break;
  case "uninstall": await uninstall(); break;
  case "logs": process.stdout.write(fs.existsSync(FILE.log) ? fs.readFileSync(FILE.log, "utf8").split("\n").slice(-60).join("\n") : "No log yet.\n"); break;
  default: console.log(usage);
}
