import { createHash, timingSafeEqual } from "node:crypto";
import { handleMessage } from "../../lib/mcp";
import { identifyAccessKey } from "../../lib/workspaceAuth";
import { runAs } from "../../lib/workspaceScope";
import { ownerUser, type WorkspaceUser } from "../../lib/workspaceUsers";

export const runtime = "nodejs";
export const maxDuration = 60;

const calls = new Map<string, { count: number; until: number }>();

// Pasting a secret into a form or a shell often adds a stray space, newline or pair of quotes; ignore those.
const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();

/**
 * The owner connects with WORKSPACE_MCP_TOKEN; a member connects with their own access key and only ever sees their
 * own workspace. Returns who it is, or why not.
 */
async function authorized(request: Request): Promise<{ user: WorkspaceUser } | "not_configured" | "denied"> {
  const token = clean(process.env.WORKSPACE_MCP_TOKEN ?? "");
  const given = clean((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (token.length >= 32) {
    const a = createHash("sha256").update(given).digest();
    const b = createHash("sha256").update(token).digest();
    if (timingSafeEqual(new Uint8Array(a), new Uint8Array(b))) return { user: ownerUser() };
  }
  const member = given ? await identifyAccessKey(given) : null;
  // The owner's own access key is not accepted here: the owner uses the MCP token.
  if (member && member.role === "member") return { user: member };
  if (token.length < 32) return "not_configured";
  // Lengths only, never the values: enough to tell an empty or truncated key from a different one.
  console.error(`MCP auth failed: received ${given.length} characters, expected ${token.length}`);
  return "denied";
}

/** MCP over Streamable HTTP: JSON-RPC in a POST body, answered with JSON. Browsers are refused (no Origin header allowed). */
export async function POST(request: Request) {
  if (request.headers.get("origin")) return Response.json({ error: "forbidden" }, { status: 403 });
  const auth = await authorized(request);
  if (auth === "not_configured") return Response.json({ error: "mcp_not_configured" }, { status: 503 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

  const now = Date.now();
  const user = auth.user;
  const previous = calls.get(user.id);
  const count = previous && previous.until > now ? previous.count : 0;
  if (count >= 120) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set(user.id, { count: count + 1, until: now + 60_000 });

  if (Number(request.headers.get("content-length")) > 200_000) return Response.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as Record<string, unknown>[];
  const replies = (await Promise.all(messages.slice(0, 20).map((message) => (message && typeof message === "object" ? runAs(user, () => handleMessage(message, { mail: user.role === "owner" })) : Promise.resolve({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }))))).filter((reply): reply is Record<string, unknown> => reply !== null);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0], { headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return new Response("Use POST.", { status: 405, headers: { Allow: "POST" } });
}
export const DELETE = GET;
