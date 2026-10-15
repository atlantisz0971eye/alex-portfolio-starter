import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { exchangeCode, profileEmail } from "../../../../lib/gmail";
import { encryptToken } from "../../../../lib/mailCrypto";
import { mailConfigured, OAUTH_COOKIE } from "../../../../lib/mailGuard";
import { MAX_ACCOUNTS, readAccounts, writeAccounts } from "../../../../lib/mailStore";
import { workspaceSignatureMatches } from "../../../../lib/workspaceAuth";

export const runtime = "nodejs";

function finish(origin: string, query: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/workspace?${query}`,
      "Set-Cookie": `${OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/workspace/mail; Max-Age=0${secure}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!mailConfigured()) return finish(url.origin, "mail=error&reason=not_configured");
  const cookie = (await cookies()).get(OAUTH_COOKIE)?.value ?? "";
  const [nonce, verifier] = cookie.split(".");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  // Only a flow started from a signed-in session carries a cookie whose nonce matches the state.
  if (!nonce || !verifier || !state || !workspaceSignatureMatches(nonce, state)) return finish(url.origin, "mail=error&reason=invalid_state");
  if (url.searchParams.get("error") || !code) return finish(url.origin, "mail=error&reason=denied");
  try {
    const tokens = await exchangeCode(code, verifier, `${url.origin}/api/workspace/mail/callback`);
    const email = await profileEmail(tokens.accessToken);
    const accounts = await readAccounts();
    const existing = accounts.find((account) => account.email.toLowerCase() === email.toLowerCase());
    if (!existing && accounts.length >= MAX_ACCOUNTS) return finish(url.origin, "mail=error&reason=too_many_accounts");
    const record = { id: existing?.id ?? randomUUID(), email, tokenEnc: encryptToken(tokens.refreshToken), connectedAt: new Date().toISOString() };
    await writeAccounts(existing ? accounts.map((account) => account.id === existing.id ? record : account) : [...accounts, record]);
    return finish(url.origin, "mail=connected");
  } catch {
    return finish(url.origin, "mail=error&reason=failed");
  }
}
