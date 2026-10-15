import { get, put } from "@vercel/blob";

export type MailAccount = {
  id: string;
  email: string;
  /** Encrypted refresh token; see mailCrypto. */
  tokenEnc: string;
  connectedAt: string;
  /** Scopes granted at consent time; accounts connected before calendar support lack the calendar scope. */
  scopes?: string[];
};

const ACCOUNTS_PATH = "workspace/mail/accounts.json";
export const MAX_ACCOUNTS = 2;

export async function readAccounts(): Promise<MailAccount[]> {
  const result = await get(ACCOUNTS_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return [];
  return JSON.parse(await new Response(result.stream).text()) as MailAccount[];
}

export async function writeAccounts(accounts: MailAccount[]) {
  await put(ACCOUNTS_PATH, JSON.stringify(accounts), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export type PublicAccount = Pick<MailAccount, "id" | "email" | "connectedAt"> & { calendar: boolean };
export const publicAccount = ({ id, email, connectedAt, scopes }: MailAccount): PublicAccount => ({ id, email, connectedAt, calendar: !!scopes?.includes("https://www.googleapis.com/auth/calendar.readonly") });
