"use client";

import { CloudUpload, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SyncCommand, SyncDevice } from "../lib/syncStore";
import { parseResponse } from "./api";
import { Sheet } from "./Sheet";

type Device = SyncDevice & { online: boolean; ageSeconds: number };
type Status = { configured: boolean; devices: Device[] };

const json = { "Content-Type": "application/json" };

function ago(seconds: number) {
  if (seconds < 5) return "just now";
  if (seconds < 90) return `${Math.round(seconds)} s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}
const sinceIso = (iso?: string) => (iso ? ago((Date.now() - Date.parse(iso)) / 1000) : "never");
const size = (bytes?: number) => (bytes === undefined ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : bytes < 1024 ** 3 ? `${Math.round(bytes / 1024 / 1024)} MB` : `${(bytes / 1024 ** 3).toFixed(1)} GB`);

/** One word and one colour for how things stand: green all well, amber busy, red something failed, grey offline. */
function summary(status: Status | null): { tone: "off" | "ok" | "busy" | "bad"; label: string } {
  const device = status?.devices[0];
  if (!status || !device) return { tone: "off", label: status && !status.configured ? "Not set up" : "No computer yet" };
  if (!device.online) return { tone: "off", label: "Offline" };
  if (device.folders.some((folder) => folder.state === "error")) return { tone: "bad", label: "Needs attention" };
  if (device.paused) return { tone: "off", label: "Paused" };
  if (device.folders.some((folder) => folder.state === "syncing" || folder.state === "queued")) return { tone: "busy", label: "Syncing" };
  return { tone: "ok", label: "Up to date" };
}

/** The owner's view of the Drive sync running on their computer: is it online, and how is each folder doing. */
export function SyncButton({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try { setStatus(await parseResponse<Status>(await fetch("/api/workspace/sync", { cache: "no-store" }))); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the sync status."); }
  }, []);
  // A quiet check every minute while the page is visible, quicker while the sheet is open.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, open ? 10_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  const command = async (device: Device, type: SyncCommand["type"], folder?: string) => {
    const key = `${type}:${folder ?? ""}`;
    setBusy(key);
    try { await parseResponse(await fetch("/api/workspace/sync", { method: "PATCH", headers: json, body: JSON.stringify({ device: device.device, type, folder }) })); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That did not work."); }
    finally { setBusy(null); }
  };

  const { tone, label } = summary(status);
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)} aria-label={`Drive sync: ${label}`}>
      <CloudUpload size={15} /><span> Drive sync</span><i className={`syncdot syncdot--${tone}`} aria-hidden="true" />
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Drive sync" size="tall">
      <div className="sync">
        {error && <p className="sync__error" role="alert">{error}</p>}
        {status && !status.configured && <p className="ws-note">Add <code>WORKSPACE_SYNC_TOKEN</code> in Vercel (at least 32 characters, the same value as in <code>~/.drivesync/config.json</code> on your computer), then redeploy. The script on your computer reports here once it is set.</p>}
        {status?.configured && status.devices.length === 0 && <p className="ws-note">No computer has reported yet. On your computer run <code>drivesync doctor</code> and <code>drivesync install</code>.</p>}
        {status === null && !error && <p className="ws-note"><Loader2 size={14} className="ws-spin" /> Loading…</p>}
        {status?.devices.map((device) => <section key={device.device} className="sync__device">
          <header>
            <div>
              <strong><i className={`syncdot syncdot--${device.online ? (device.paused ? "off" : "ok") : "off"}`} aria-hidden="true" /> {device.name}</strong>
              <small>{device.online ? `Online · heard ${ago(device.ageSeconds)}` : `Offline · last seen ${ago(device.ageSeconds)}`}{device.platform ? ` · ${device.platform}` : ""}{device.version ? ` · drivesync ${device.version}` : ""}</small>
            </div>
            <div className="sync__actions">
              <button type="button" className="ws-pill" disabled={!device.online || busy === "sync:"} onClick={() => void command(device, "sync")}>{busy === "sync:" ? <Loader2 size={15} className="ws-spin" /> : <RefreshCw size={15} />} Sync now</button>
              <button type="button" className="ws-text-button" disabled={busy !== null} onClick={() => void command(device, device.paused ? "resume" : "pause")}>{device.paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}</button>
            </div>
          </header>
          {device.commands.length > 0 && <p className="sync__waiting">Waiting for the computer to pick up {device.commands.length} request{device.commands.length > 1 ? "s" : ""}…</p>}
          {!device.online && <p className="ws-note">Requests wait until the computer is back online and connected to the internet.</p>}
          <ul className="sync__folders">
            {device.folders.map((folder) => <li key={folder.name} className={`is-${folder.state}`}>
              <div>
                <strong>{folder.name}</strong>
                <span className={`sync__state sync__state--${folder.state}`}>{folder.state === "unmounted" ? "disk not connected" : folder.state}</span>
                <small>{folder.state === "error" ? folder.lastError ?? "Failed" : `Synced ${sinceIso(folder.lastOk)}${folder.files !== undefined ? ` · ${folder.files.toLocaleString()} files` : ""}${folder.bytes !== undefined ? ` · ${size(folder.bytes)}` : ""}${folder.transferred ? ` · ${folder.transferred} changed` : ""}`}</small>
                {folder.state === "error" && folder.lastOk && <small>Last good sync {sinceIso(folder.lastOk)}</small>}
                <small className="sync__path">{folder.path}{folder.mode === "copy" ? " · copy only, never deletes" : ""}</small>
              </div>
              <button type="button" className="ws-text-button" disabled={!device.online || busy === `sync:${folder.name}`} onClick={() => void command(device, "sync", folder.name)}>{busy === `sync:${folder.name}` ? <Loader2 size={14} className="ws-spin" /> : "Sync"}</button>
            </li>)}
          </ul>
          {device.events.length > 0 && <details className="sync__log"><summary>Recent activity</summary><ul>{[...device.events].reverse().map((event, index) => <li key={index}><time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time> {event.text}</li>)}</ul></details>}
        </section>)}
      </div>
    </Sheet>
  </>;
}
