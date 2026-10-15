import { revokeToken } from "../../../../lib/gmail";
import { decryptToken } from "../../../../lib/mailCrypto";
import { mailConfigured, mailGuard, mailMissing } from "../../../../lib/mailGuard";
import { MAX_ACCOUNTS, publicAccount, readAccounts, writeAccounts } from "../../../../lib/mailStore";
import { workspaceAuthorized } from "../../../../lib/workspaceAuth";
import { workspaceStorageConfigured } from "../../../../lib/workspaceStore";

export const runtime = "nodejs";

export async function GET() {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!mailConfigured()) return Response.json({ configured: false, missing: mailMissing(), accounts: [], max: MAX_ACCOUNTS });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  try {
    return Response.json({ configured: true, accounts: (await readAccounts()).map(publicAccount), max: MAX_ACCOUNTS }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

/** Disconnecting removes the stored token and revokes it at Google. */
export async function DELETE(request: Request) {
  const denied = await mailGuard();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  try {
    const accounts = await readAccounts();
    const target = accounts.find((account) => account.id === id);
    if (!target) return Response.json({ error: "not_found" }, { status: 404 });
    await writeAccounts(accounts.filter((account) => account.id !== id));
    await revokeToken(decryptToken(target.tokenEnc)).catch(() => undefined);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
