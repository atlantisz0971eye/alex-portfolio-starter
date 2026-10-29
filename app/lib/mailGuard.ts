import { workspaceUser } from "./workspaceAuth";
import { googleConfigured } from "./gmail";
import { mailKeyConfigured } from "./mailCrypto";
import { readAccounts, type MailAccount } from "./mailStore";
import { workspaceStorageConfigured } from "./workspaceStore";

export const OAUTH_COOKIE = "ws_mail_oauth";

export const mailConfigured = () => googleConfigured() && mailKeyConfigured();

/** Names (never values) of the mail settings that are missing or unusable. */
export function mailMissing() {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!process.env.MAIL_TOKEN_KEY) missing.push("MAIL_TOKEN_KEY");
  else if (!mailKeyConfigured()) missing.push("MAIL_TOKEN_KEY (needs at least 32 characters)");
  return missing;
}

/** Common checks for the mail endpoints; returns a response to send when access is denied. */
export async function mailGuard(): Promise<Response | null> {
  const user = await workspaceUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!user.features.mail) return Response.json({ error: "member_feature_off" }, { status: 403 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  if (!mailConfigured()) return Response.json({ error: "mail_not_configured" }, { status: 503 });
  return null;
}

export async function findAccount(id: string | null): Promise<MailAccount | null> {
  if (!id) return null;
  return (await readAccounts()).find((account) => account.id === id) ?? null;
}
