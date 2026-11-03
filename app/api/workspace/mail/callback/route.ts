import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { exchangeCode, profileEmail } from "../../../../lib/gmail";
import { encryptToken } from "../../../../lib/mailCrypto";
import { mailConfigured, OAUTH_COOKIE } from "../../../../lib/mailGuard";
import { MAX_ACCOUNTS, readAccounts, writeAccounts } from "../../../../lib/mailStore";
import { workspaceSignatureMatches } from "../../../../lib/workspaceAuth";
import { runAs } from "../../../../lib/workspaceScope";
import { findMember, ownerUser } from "../../../../lib/workspaceUsers";

export const runtime = "nodejs";

/**
 * Back from Google the browser holds back the session cookie (it is SameSite=Strict), so redirecting straight to the app would
 * land on the sign-in page. A small page that moves on by itself makes the last step start from this site, and the cookie goes with it.
 */
function finish(origin: string, query: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const target = `${origin}/workspace?${query}`;
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${target}"><title>Returning…</title><p><a href="${target}">Continue to the workspace</a></p>`, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": `${OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/workspace/mail; Max-Age=0${secure}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
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
  // Only a flow started from a signed-in session carries a cookie whose nonce matches the state, and the signed state names
  // the person who started it, so a mailbox can only be connected to the account that asked for it.
  const [stateId, stateNonce, mac] = state.split(".");
  if (!stateId || !stateNonce || !mac || !nonce || !verifier || stateNonce !== nonce || !workspaceSignatureMatches(`${stateId}.${stateNonce}`, mac)) return finish(url.origin, "mail=error&reason=invalid_state");
  const me = stateId === "owner" ? ownerUser() : await findMember(stateId);
  if (!me || me.disabled || !me.features.mail) return finish(url.origin, "mail=error&reason=invalid_state");
  if (url.searchParams.get("error") || !code) return finish(url.origin, "mail=error&reason=denied");
  return runAs(me, async () => {
  try {
    const tokens = await exchangeCode(code, verifier, `${url.origin}/api/workspace/mail/callback`);
    const email = await profileEmail(tokens.accessToken);
    const accounts = await readAccounts();
    const existing = accounts.find((account) => account.email.toLowerCase() === email.toLowerCase());
    if (!existing && accounts.length >= MAX_ACCOUNTS) return finish(url.origin, "mail=error&reason=too_many_accounts");
    const record = { id: existing?.id ?? randomUUID(), email, tokenEnc: encryptToken(tokens.refreshToken), connectedAt: new Date().toISOString(), scopes: tokens.scopes };
    await writeAccounts(existing ? accounts.map((account) => account.id === existing.id ? record : account) : [...accounts, record]);
    return finish(url.origin, "mail=connected");
  } catch (error) {
    console.error("Gmail connect failed:", error instanceof Error ? error.message : "unknown");
    return finish(url.origin, "mail=error&reason=failed");
  }
  });
}
