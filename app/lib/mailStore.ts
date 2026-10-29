import { get, put } from "@vercel/blob";
import { scopeRoot } from "./workspaceScope";

export type MailAccount = {
  id: string;
  email: string;
  /** Encrypted refresh token; see mailCrypto. */
  tokenEnc: string;
  connectedAt: string;
  /** Scopes granted at consent time. */
  scopes?: string[];
};

// Each person connects their own mailbox; the tokens never leave their folder.
const accountsPath = async () => `${await scopeRoot()}mail/accounts.json`;
export const MAX_ACCOUNTS = 2;

export async function readAccounts(): Promise<MailAccount[]> {
  const result = await get(await accountsPath(), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return [];
  return JSON.parse(await new Response(result.stream).text()) as MailAccount[];
}

export async function writeAccounts(accounts: MailAccount[]) {
  await put(await accountsPath(), JSON.stringify(accounts), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export type PublicAccount = Pick<MailAccount, "id" | "email" | "connectedAt">;
export const publicAccount = ({ id, email, connectedAt }: MailAccount): PublicAccount => ({ id, email, connectedAt });
