"use client";

import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { parseResponse } from "./api";
import { Sheet } from "./Sheet";

type Member = {
  id: string; name: string; disabled?: boolean; createdAt: string; keyHint: string;
  features: { mail: boolean; today: boolean };
  limits: { aiPerDay: number; documents: number };
  aiToday: number; files: number; bytes: number;
};
type Issued = { name: string; key: string };

const json = { "Content-Type": "application/json" };
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** The owner's place to hand out keys: one key opens one person's own, separate workspace. */
export function Members({ open, onClose, onError }: { open: boolean; onClose: () => void; onError: (message: string) => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try { setMembers((await parseResponse<{ members: Member[] }>(await fetch("/api/workspace/admin/members", { cache: "no-store" }))).members); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Could not load the members."); setMembers([]); }
  }, [onError]);
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  const call = async (label: string, request: () => Promise<Response>) => {
    setBusy(label);
    try { const data = await parseResponse<{ key?: string; member?: Member }>(await request()); await refresh(); return data; }
    catch (cause) { onError(cause instanceof Error ? cause.message : "That did not work."); return null; }
    finally { setBusy(null); }
  };

  const create = async () => {
    const data = await call("create", () => fetch("/api/workspace/admin/members", { method: "POST", headers: json, body: JSON.stringify({ name }) }));
    if (data?.key && data.member) { setIssued({ name: data.member.name, key: data.key }); setName(""); setCopied(false); }
  };
  const patch = (id: string, body: Record<string, unknown>) => call(id, () => fetch("/api/workspace/admin/members", { method: "PATCH", headers: json, body: JSON.stringify({ id, ...body }) }));
  const newKey = async (member: Member) => {
    if (!window.confirm(`Make a new key for ${member.name}? The old key stops working and they are signed out.`)) return;
    const data = await patch(member.id, { rotateKey: true });
    if (data?.key) { setIssued({ name: member.name, key: data.key }); setCopied(false); }
  };
  const remove = async (member: Member) => {
    if (!window.confirm(`Delete ${member.name} and erase everything they stored (notes, boards, library, mail connection)? This cannot be undone.`)) return;
    await call(member.id, () => fetch(`/api/workspace/admin/members?id=${member.id}&purge=1`, { method: "DELETE" }));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(issued?.key ?? ""); setCopied(true); } catch { onError("Copy the key by hand."); } };

  return <Sheet open={open} onClose={onClose} title="Members" size="tall">
    <div className="mem">
      <p className="ws-note">Give a friend a key and they get a workspace of their own: separate notes, boards, library, calendar and mail. AI calls use your keys, up to each person&rsquo;s daily limit. You can reach their files in storage, so only invite people you trust.</p>

      {issued && <div className="mem__issued" role="status">
        <strong>Key for {issued.name}</strong>
        <code>{issued.key}</code>
        <p>This is the only time it is shown. Send it to them privately; they enter it at {typeof window !== "undefined" ? `${window.location.origin}/workspace` : "/workspace"}.</p>
        <div className="mem__row">
          <button type="button" className="ws-pill" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy key"}</button>
          <button type="button" className="ws-text-button" onClick={() => setIssued(null)}>Done</button>
        </div>
      </div>}

      <form className="mem__add" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void create(); }}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name, e.g. Mia" maxLength={60} aria-label="New member's name" />
        <button type="submit" className="ws-pill ws-pill--solid" disabled={!name.trim() || busy === "create"}>{busy === "create" ? <Loader2 size={16} className="ws-spin" /> : <Plus size={16} />} Create key</button>
      </form>

      {members === null && <p className="ws-note"><Loader2 size={14} className="ws-spin" /> Loading…</p>}
      {members?.length === 0 && <p className="ws-note">No one yet. You are the only person with access.</p>}
      <ul className="mem__list">
        {members?.map((member) => <li key={member.id} className={member.disabled ? "is-off" : ""}>
          <header>
            <div><strong>{member.name}</strong>{member.disabled && <span className="mem__tag">Disabled</span>}<small>key …{member.keyHint} · added {new Date(member.createdAt).toLocaleDateString()}</small></div>
            {busy === member.id && <Loader2 size={16} className="ws-spin" />}
          </header>
          <p className="mem__stats">AI today {member.aiToday} / {member.limits.aiPerDay} · {member.files} files · {size(member.bytes)}</p>
          <div className="mem__controls">
            <label><input type="checkbox" checked={member.features.mail} onChange={(event) => void patch(member.id, { features: { mail: event.target.checked } })} /> Can connect mail</label>
            <label><input type="checkbox" checked={member.features.today} onChange={(event) => void patch(member.id, { features: { today: event.target.checked } })} /> Daily plan in the background</label>
            <label>AI calls a day <input type="number" min={0} step={50} defaultValue={member.limits.aiPerDay} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value !== member.limits.aiPerDay) void patch(member.id, { limits: { aiPerDay: value } }); }} /></label>
            <label>Books <input type="number" min={0} step={5} defaultValue={member.limits.documents} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value !== member.limits.documents) void patch(member.id, { limits: { documents: value } }); }} /></label>
          </div>
          <div className="mem__row">
            <button type="button" className="ws-text-button" onClick={() => void newKey(member)}><KeyRound size={15} /> New key</button>
            <button type="button" className="ws-text-button" onClick={() => void patch(member.id, { signOut: true })}>Sign out everywhere</button>
            <button type="button" className="ws-text-button" onClick={() => void patch(member.id, { disabled: !member.disabled })}>{member.disabled ? "Enable" : "Disable"}</button>
            <button type="button" className="ws-text-button mem__danger" onClick={() => void remove(member)}><Trash2 size={15} /> Delete</button>
          </div>
        </li>)}
      </ul>
    </div>
  </Sheet>;
}
