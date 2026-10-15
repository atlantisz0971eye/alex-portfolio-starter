import { runAgentLoop } from "../../../lib/agentLoop";
import { agentSystem } from "../../../lib/agentPrompt";
import type { Proposal } from "../../../lib/agentTools";
import { calendarGuard } from "../../../lib/calendarGuard";
import { validZone } from "../../../lib/calendarTime";
import type { ChatMessage } from "../../../lib/workspaceDeepSeek";
import { ndjson } from "../../../lib/workspaceStream";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_STEPS = 6;
const calls = new Map<string, { count: number; until: number }>();

/**
 * The global assistant. It can read the calendar, Gmail and the library through tools, and it can
 * propose calendar changes, but it never writes: every proposal is confirmed by the reader.
 */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const key = request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  const previous = calls.get(key);
  const count = previous && previous.until > now ? previous.count : 0;
  if (count >= 15) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set(key, { count: count + 1, until: now + 60_000 });

  let body: { message?: unknown; history?: unknown; zone?: unknown; context?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 14_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 1 || message.length > 2000) return Response.json({ error: "invalid_question" }, { status: 400 });
  const zone = validZone(body.zone);
  const screen = ["library", "mail", "calendar"].includes(String(body.context)) ? String(body.context) : "";
  const history: ChatMessage[] = Array.isArray(body.history)
    ? body.history.slice(-8).filter((item): item is { role: string; content: string } => !!item && typeof item === "object" && typeof (item as { content?: unknown }).content === "string")
        .map((item) => ({ role: item.role === "assistant" ? "assistant" as const : "user" as const, content: item.content.slice(0, 2500) }))
    : [];

  let system: string;
  try {
    system = await agentSystem(zone, screen);
  } catch {
    return Response.json({ error: "calendar_failed" }, { status: 502 });
  }

  return ndjson(async (send) => {
    send({ t: "start" });
    const proposals: Proposal[] = [];
    const messages: ChatMessage[] = [{ role: "system", content: system }, ...history, { role: "user", content: message }];
    await runAgentLoop(messages, { zone, proposals }, {
      signal: request.signal,
      onText: (delta) => send({ t: "delta", v: delta }),
      onTool: (name, label) => send({ t: "tool", name, label }),
    }, MAX_STEPS);
    if (request.signal.aborted) return;
    if (proposals.length) send({ t: "actions", actions: proposals.slice(0, 12) });
    send({ t: "done" });
  });
}
