import { calendarGuard } from "../../../../lib/calendarGuard";
import { ledgerView, pollRepos, readAudit } from "../../../../lib/carcosa/ledger";
import { writeDevlog } from "../../../../lib/carcosa/scribe";
import { currentUser } from "../../../../lib/workspaceScope";

export const runtime = "nodejs";
export const maxDuration = 120;

async function ownerOnly() {
  const denied = await calendarGuard();
  if (denied) return denied;
  return (await currentUser()).role === "owner" ? null : Response.json({ error: "forbidden" }, { status: 403 });
}

/** The ledger: the three sources side by side, what does not line up, and what the agents did. */
export async function GET() {
  const denied = await ownerOnly();
  if (denied) return denied;
  try {
    const [view, rows] = await Promise.all([ledgerView(14), readAudit()]);
    return Response.json({ ...view, audit: rows.slice(0, 20) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "ledger_failed" }, { status: 502 });
  }
}

/** "check" polls GitHub now and lets the scribe write, instead of waiting for the next ten minutes. */
export async function POST(request: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  if (body.action !== "check") return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    await pollRepos(true);
    const { written } = await writeDevlog(3);
    const [view, rows] = await Promise.all([ledgerView(14), readAudit()]);
    return Response.json({ ...view, audit: rows.slice(0, 20), written });
  } catch {
    return Response.json({ error: "ledger_failed" }, { status: 502 });
  }
}
