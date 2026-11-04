"use client";

import { CalendarCheck, Check, Loader2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { parseResponse } from "./api";
import { zone } from "./calendarFormat";
import { Sheet } from "./Sheet";

type Candidate = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  timeKnown: boolean;
  why: string;
  source: { account: string; id: string; from: string; subject: string };
  conflicts: string[];
  existing?: string;
};
type Row = Candidate & { picked: boolean; state: "idle" | "adding" | "added" | "failed"; error?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const nextDay = (key: string) => {
  const date = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const plusHour = (local: string) => {
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return local;
  date.setHours(date.getHours() + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Lists the events DeepSeek found in recent mail. Nothing reaches the calendar until the person ticks an event,
 * checks its time and presses Add; the add goes through the ordinary calendar endpoint.
 */
export function MailSchedule({ open, onClose, onError }: { open: boolean; onClose: () => void; onError: (message: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [failed, setFailed] = useState("");

  const scan = useCallback(async () => {
    setRows(null);
    setFailed("");
    try {
      const data = await parseResponse<{ candidates: Candidate[]; scanned: number }>(await fetch("/api/workspace/mail/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone: zone() }) }));
      setScanned(data.scanned);
      setRows(data.candidates.map((item) => ({ ...item, picked: false, state: "idle" })));
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "Could not read your mail.");
    }
  }, []);

  useEffect(() => { if (open) void scan(); }, [open, scan]);

  const patch = (index: number, change: Partial<Row>) => setRows((current) => current && current.map((row, i) => i === index ? { ...row, ...(row.state === "failed" && !change.state ? { state: "idle" as const, error: undefined } : {}), ...change } : row));

  const picked = rows?.filter((row) => row.picked && row.state !== "added") ?? [];
  const busy = rows?.some((row) => row.state === "adding") ?? false;

  async function addPicked() {
    if (!rows) return;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.picked || row.state === "added") continue;
      patch(index, { state: "adding" });
      const event = {
        title: row.title.trim(),
        allDay: row.allDay,
        start: row.allDay ? row.start.slice(0, 10) : row.start,
        // The calendar stores an all-day end as the day after the last day.
        end: row.allDay ? nextDay((row.end || row.start).slice(0, 10)) : row.end,
        location: row.location.trim(),
        notes: `From email: ${row.source.subject} (${row.source.from})`,
      };
      try {
        await parseResponse(await fetch("/api/workspace/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, zone: zone(), by: "agent" }) }));
        setRows((current) => current && current.map((item, i) => i === index ? { ...item, state: "added", picked: false } : item));
      } catch (cause) {
        setRows((current) => current && current.map((item, i) => i === index ? { ...item, state: "failed", error: cause instanceof Error ? cause.message : "Could not add it." } : item));
      }
    }
  }

  const added = rows?.filter((row) => row.state === "added").length ?? 0;
  const primary = { label: busy ? "Adding…" : picked.length ? `Add ${picked.length}` : "Add", onClick: () => void addPicked(), disabled: busy || picked.length === 0 };

  return <Sheet open={open} onClose={onClose} title="Events in your mail" size="tall" primary={primary}>
    {failed ? <div className="ws-card ws-card--error"><p>{failed}</p><button type="button" className="ws-pill" onClick={() => void scan()}>Try again</button></div>
      : rows === null ? <p className="ms-scan__wait"><Loader2 className="ws-spin" size={18} /> Reading the last two weeks of mail…</p>
      : <>
        <p className="ws-note">DeepSeek read {scanned} recent email{scanned === 1 ? "" : "s"}{rows.length ? ` and found ${rows.length} possible event${rows.length === 1 ? "" : "s"}` : " and found nothing with a date"}. Tick the ones you want, check the times, then press Add. Nothing is added before that.{added ? ` Added ${added}.` : ""}</p>
        <ul className="ms-scan">
          {rows.map((row, index) => <li key={index} className={`ms-scan__item is-${row.state}${row.picked ? " is-picked" : ""}`}>
            <label className="ms-scan__pick">
              {row.state === "added" ? <Check size={18} aria-label="Added" /> : <input type="checkbox" checked={row.picked} disabled={row.state === "adding"} onChange={(event) => patch(index, { picked: event.target.checked })} aria-label={`Add ${row.title}`} />}
            </label>
            <div className="ms-scan__body">
              <input className="ms-scan__title" value={row.title} maxLength={200} disabled={row.state === "added"} onChange={(event) => patch(index, { title: event.target.value })} aria-label="Title" />
              <div className="ef__group">
                <label className="ef__row"><span>All-day</span><input type="checkbox" className="ef__switch" checked={row.allDay} disabled={row.state === "added"} onChange={(event) => {
                  const allDay = event.target.checked;
                  const day = row.start.slice(0, 10);
                  patch(index, allDay ? { allDay, start: day, end: day } : { allDay, start: `${day}T09:00`, end: `${day}T10:00` });
                }} /></label>
                <label className="ef__row"><span>{row.allDay ? "Date" : "Starts"}</span><input type={row.allDay ? "date" : "datetime-local"} value={row.allDay ? row.start.slice(0, 10) : row.start} disabled={row.state === "added"} onChange={(event) => {
                  const start = event.target.value;
                  if (!start) return;
                  patch(index, row.allDay ? { start, end: row.end < start ? start : row.end, timeKnown: true } : { start, end: row.end && new Date(row.end) > new Date(start) ? row.end : plusHour(start), timeKnown: true });
                }} /></label>
                <label className="ef__row"><span>{row.allDay ? "Last day" : "Ends"}</span><input type={row.allDay ? "date" : "datetime-local"} value={row.allDay ? (row.end || row.start).slice(0, 10) : row.end} min={row.allDay ? row.start.slice(0, 10) : row.start} disabled={row.state === "added"} onChange={(event) => event.target.value && patch(index, { end: event.target.value })} /></label>
                <label className="ef__row"><span>Location</span><input value={row.location} placeholder="None" disabled={row.state === "added"} onChange={(event) => patch(index, { location: event.target.value })} /></label>
              </div>
              {!row.timeKnown && row.state !== "added" && <p className="ms-scan__warn"><TriangleAlert size={14} /> {row.allDay ? "The email gives no exact time. Turn off All-day to set one, or keep it as an all-day item." : "The email gives no exact time; 09:00 is only a placeholder. Set the real time."}</p>}
              {row.existing && row.state !== "added" && <p className="ms-scan__warn"><CalendarCheck size={14} /> Looks like it is already in your calendar as “{row.existing}”.</p>}
              {row.conflicts.length > 0 && row.state !== "added" && <p className="ms-scan__warn"><TriangleAlert size={14} /> Overlaps with {row.conflicts.join(", ")}</p>}
              {row.error && <p className="ms-scan__warn ms-scan__warn--error">{row.error}</p>}
              <p className="ms-scan__source">{row.why && <>{row.why}<br /></>}From {row.source.from}: {row.source.subject}</p>
            </div>
          </li>)}
        </ul>
        <button type="button" className="ws-text-button" onClick={() => void scan()} disabled={busy}>Scan again</button>
      </>}
  </Sheet>;
}
