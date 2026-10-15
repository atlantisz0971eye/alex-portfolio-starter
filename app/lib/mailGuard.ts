import { workspaceAuthorized } from "./workspaceAuth";
import { googleConfigured } from "./gmail";
import { mailKeyConfigured } from "./mailCrypto";
import { readAccounts, type MailAccount } from "./mailStore";
import { workspaceStorageConfigured } from "./workspaceStore";

export const OAUTH_COOKIE = "ws_mail_oauth";

export const mailConfigured = () => googleConfigured() && mailKeyConfigured();

/** Common checks for the mail endpoints; returns a response to send when access is denied. */
export async function mailGuard(): Promise<Response | null> {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  if (!mailConfigured()) return Response.json({ error: "mail_not_configured" }, { status: 503 });
  return null;
}

export async function findAccount(id: string | null): Promise<MailAccount | null> {
  if (!id) return null;
  return (await readAccounts()).find((account) => account.id === id) ?? null;
}
