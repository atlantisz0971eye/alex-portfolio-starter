import { listMessages, MailAuthError, type MailSummary } from "../../../../lib/gmail";
import { mailGuard } from "../../../../lib/mailGuard";
import { readAccounts } from "../../../../lib/mailStore";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Merged inbox (or search) across connected accounts, newest first. `next` carries one page token per account. */
export async function GET(request: Request) {
  const denied = await mailGuard();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 300);
  const only = params.get("account");
  let tokens: Record<string, string> = {};
  try {
    const parsed = JSON.parse(params.get("next") ?? "{}");
    if (parsed && typeof parsed === "object") tokens = parsed as Record<string, string>;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const accounts = (await readAccounts()).filter((account) => !only || account.id === only);
    // After the first page, only accounts that still have a page token are asked again.
    const active = accounts.filter((account) => Object.keys(tokens).length === 0 || tokens[account.id]);
    const results = await Promise.all(active.map(async (account) => {
      try {
        return { account, ...(await listMessages(account, { q, pageToken: tokens[account.id], max: 15 })) };
      } catch (error) {
        return { account, messages: [] as MailSummary[], next: undefined, failure: error instanceof MailAuthError ? "reauth" : "failed" };
      }
    }));
    const messages = results.flatMap((result) => result.messages).sort((a, b) => b.date - a.date);
    const next: Record<string, string> = {};
    for (const result of results) if (result.next) next[result.account.id] = result.next;
    const failures = results.filter((result) => "failure" in result && result.failure).map((result) => ({ account: result.account.id, email: result.account.email, reason: (result as { failure: string }).failure }));
    return Response.json({ messages, next: Object.keys(next).length ? next : null, failures }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "mail_failed" }, { status: 502 });
  }
}
