import { createHash, timingSafeEqual } from "node:crypto";
import { handleMessage } from "../../lib/mcp";

export const runtime = "nodejs";
export const maxDuration = 60;

const calls = new Map<string, { count: number; until: number }>();

// Pasting a secret into a form or a shell often adds a stray space, newline or pair of quotes; ignore those.
const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();

function authorized(request: Request) {
  const token = clean(process.env.WORKSPACE_MCP_TOKEN ?? "");
  if (token.length < 32) return "not_configured" as const;
  const given = clean((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token).digest();
  if (timingSafeEqual(new Uint8Array(a), new Uint8Array(b))) return "ok" as const;
  // Lengths only, never the values: enough to tell an empty or truncated key from a different one.
  console.error(`MCP auth failed: received ${given.length} characters, expected ${token.length}`);
  return "denied" as const;
}

/** MCP over Streamable HTTP: JSON-RPC in a POST body, answered with JSON. Browsers are refused (no Origin header allowed). */
export async function POST(request: Request) {
  if (request.headers.get("origin")) return Response.json({ error: "forbidden" }, { status: 403 });
  const auth = authorized(request);
  if (auth === "not_configured") return Response.json({ error: "mcp_not_configured" }, { status: 503 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

  const now = Date.now();
  const previous = calls.get("mcp");
  const count = previous && previous.until > now ? previous.count : 0;
  if (count >= 120) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set("mcp", { count: count + 1, until: now + 60_000 });

  if (Number(request.headers.get("content-length")) > 200_000) return Response.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as Record<string, unknown>[];
  const replies = (await Promise.all(messages.slice(0, 20).map((message) => (message && typeof message === "object" ? handleMessage(message) : Promise.resolve({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }))))).filter((reply): reply is Record<string, unknown> => reply !== null);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(batch ? replies : replies[0], { headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return new Response("Use POST.", { status: 405, headers: { Allow: "POST" } });
}
export const DELETE = GET;
