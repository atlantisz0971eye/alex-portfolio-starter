import { randomBytes } from "node:crypto";
import { authUrl, pkcePair } from "../../../../lib/gmail";
import { mailGuard, OAUTH_COOKIE } from "../../../../lib/mailGuard";
import { MAX_ACCOUNTS, readAccounts } from "../../../../lib/mailStore";
import { workspaceSign } from "../../../../lib/workspaceAuth";

export const runtime = "nodejs";

/** Starts the Google consent flow. The session cookie is checked here; the callback relies on the signed state. */
export async function GET(request: Request) {
  const denied = await mailGuard();
  if (denied) return denied;
  const url = new URL(request.url);
  const accounts = await readAccounts();
  const hint = url.searchParams.get("hint") ?? undefined;
  if (accounts.length >= MAX_ACCOUNTS && !accounts.some((account) => account.email === hint)) {
    return Response.redirect(`${url.origin}/workspace?mail=error&reason=too_many_accounts`, 302);
  }
  const nonce = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const location = authUrl({ state: workspaceSign(nonce), challenge, redirectUri: `${url.origin}/api/workspace/mail/callback`, loginHint: hint });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Lax so the cookie comes back on Google's top-level redirect; scoped to the mail routes.
      "Set-Cookie": `${OAUTH_COOKIE}=${nonce}.${verifier}; HttpOnly; SameSite=Lax; Path=/api/workspace/mail; Max-Age=600${secure}`,
      "Cache-Control": "no-store",
    },
  });
}
