import { getMessage, MailAuthError } from "../../../../lib/gmail";
import { findAccount, mailGuard } from "../../../../lib/mailGuard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await mailGuard();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  if (!/^[0-9a-f]{8,32}$/i.test(id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const account = await findAccount(params.get("account"));
    if (!account) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ message: await getMessage(account, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return error instanceof MailAuthError ? Response.json({ error: "mail_reauth" }, { status: 401 }) : Response.json({ error: "mail_failed" }, { status: 502 });
  }
}
