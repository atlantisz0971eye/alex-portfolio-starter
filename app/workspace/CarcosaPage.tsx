"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { parseResponse } from "./api";
import { notice } from "./notice";

/**
 * Projects → Alignment: what really happened in development. It puts the three sources side by side (the working
 * folders as Drive Sync sees them, GitHub, production), lists what does not line up, the last days, and what the
 * agents did.
 */
type Alignment = { repo: string; local?: { device: string; folder: string; branch: string; head: string; dirty: number; ahead: number; behind: number; seen: string }; main?: string; prod?: { sha: string; at: string }; lastDeploy?: { sha: string; state: string; at: string }; aligned: boolean };
type Issue = { repo: string; kind: string; text: string; day?: string };
type Day = { day: string; key: string; label: string; repo?: string; syncs: number; changed: number; ticks: number; commits: number; withClaude: number; deploysOk: number; deploysFailed: number; devlog: boolean };
type Audit = { at: string; actor: string; action: string; detail: string };
type View = { polledAt: string | null; syncVersion: string | null; alignment: Alignment[]; issues: Issue[]; days: Day[]; audit: Audit[]; written?: string[] };

const short = (sha?: string) => (sha ? sha.slice(0, 7) : "—");
const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function CarcosaNow({ onError }: { onError: (message: string) => void }) {
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState("");
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try { setView(await parseResponse<View>(await fetch("/api/workspace/carcosa/ledger", { cache: "no-store" }))); setFailed(""); }
    catch (cause) { setFailed(cause instanceof Error ? cause.message : "Could not read the ledger."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function check() {
    if (checking) return;
    setChecking(true);
    try {
      const data = await parseResponse<View>(await fetch("/api/workspace/carcosa/ledger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }) }));
      setView(data);
      if (data.written?.length) notice(`Carcosa wrote: ${data.written.join(", ")}`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not check now."); }
    finally { setChecking(false); }
  }

  if (failed) return <section className="is-embedded"><p className="carcosa-muted">{failed}</p></section>;
  if (!view) return <section className="is-embedded"><p className="carcosa-muted"><Loader2 className="ws-spin" size={14} /> Reading the ledger…</p></section>;

  return <section className="is-embedded carcosa-now">
    <div className="carcosa-row">
      <h2 className="section-label">three sources</h2>
      <button type="button" className="ws-text-button" onClick={() => void check()} disabled={checking}>{checking ? <Loader2 className="ws-spin" size={14} /> : <RefreshCw size={14} />} check now</button>
    </div>
    <p className="carcosa-muted">Your folders as Drive Sync sees them, GitHub, and production, compared by commit.{view.polledAt ? ` GitHub read ${when.format(new Date(view.polledAt))}.` : ""}</p>
    <div className="carcosa-align">
      <div className="carcosa-align__head"><span>repository</span><span>local</span><span>GitHub</span><span>production</span></div>
      {view.alignment.map((a) => <div key={a.repo} className="carcosa-align__row" data-aligned={a.aligned || undefined}>
        <span>{a.aligned ? "■" : "□"} {a.repo.split("/")[1]}</span>
        <span>{a.local ? <>{short(a.local.head)}{a.local.branch && !["main", "master"].includes(a.local.branch) ? ` (${a.local.branch})` : ""}{a.local.dirty ? ` · ${a.local.dirty} uncommitted` : ""}{a.local.ahead ? ` · ${a.local.ahead} unpushed` : ""}</> : <em>{view.syncVersion && view.syncVersion.localeCompare("1.3.0", undefined, { numeric: true }) >= 0 ? "no synced folder" : "needs drivesync 1.3"}</em>}</span>
        <span>{short(a.main)}</span>
        <span>{a.prod || a.lastDeploy ? <>{short(a.prod?.sha)}{a.lastDeploy && a.lastDeploy.state !== "success" ? ` · last ${a.lastDeploy.state}` : ""}</> : a.main ? <em>no deploy records</em> : "—"}</span>
      </div>)}
    </div>

    <h2 className="section-label">not lining up</h2>
    {view.issues.length === 0 ? <p className="carcosa-muted">Everything lines up.</p> : <ul className="carcosa-issues">{view.issues.map((i, n) => <li key={n} data-kind={i.kind}>{i.text}</li>)}</ul>}

    <h2 className="section-label">last days</h2>
    <p className="carcosa-muted">A work day starts at 05:00, so a late night stays with the day before.</p>
    <div className="carcosa-days">
      <div className="carcosa-days__head"><span>day</span><span>where</span><span>synced</span><span>commits</span><span>deploys</span><span>devlog</span></div>
      {view.days.slice(0, 14).map((d) => <div key={`${d.day}|${d.key}`} className="carcosa-days__row">
        <span>{d.day.slice(5)}</span><span>{d.label}</span>
        <span>{d.syncs ? `${d.syncs}× · ${d.changed} files` : "—"}{d.ticks ? ` · ✓${d.ticks}` : ""}</span>
        <span>{d.commits ? `${d.commits}${d.withClaude ? ` (${d.withClaude} with Claude)` : ""}` : "—"}</span>
        <span>{d.deploysOk || d.deploysFailed ? `${d.deploysOk ? `✓${d.deploysOk}` : ""}${d.deploysFailed ? ` ✗${d.deploysFailed}` : ""}` : "—"}</span>
        <span>{d.repo && d.commits ? (d.devlog ? "■" : "□ missing") : ""}</span>
      </div>)}
    </div>

    <h2 className="section-label">agents</h2>
    {view.audit.length === 0 ? <p className="carcosa-muted">No agent has written anything yet.</p> : <ul className="carcosa-audit">{view.audit.slice(0, 8).map((r, n) => <li key={n}><time>{when.format(new Date(r.at))}</time> <b>{r.actor}</b> {r.action}: {r.detail}</li>)}</ul>}
  </section>;
}
