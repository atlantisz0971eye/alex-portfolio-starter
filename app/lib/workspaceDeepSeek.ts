import { chargeAi, QuotaError } from "./aiQuota";

/** Charges the signed-in member for one AI call; a used-up allowance reads as status 599 so every caller reports it the same way. */
async function charge() {
  try { await chargeAi(); } catch (error) { if (error instanceof QuotaError) throw new DeepSeekError(599); throw error; }
}

export class DeepSeekError extends Error {
  /** `status` is DeepSeek's HTTP status, or 0 when the key is not configured here. */
  constructor(readonly status: number) {
    super("DeepSeek request failed");
  }
}

/** Maps an upstream status to the error code the client explains to the reader. */
export function deepSeekErrorCode(status: number) {
  if (status === 599) return "ai_quota";
  if (status === 0) return "ai_not_configured";
  if (status === 401) return "ai_auth";
  if (status === 402) return "ai_balance";
  if (status === 429) return "rate_limited";
  if (status === 504) return "ai_timeout";
  if (status === 400 || status === 404 || status === 422) return "ai_request";
  if (status === 500 || status === 502 || status === 503) return "ai_busy";
  return "assistant_failed";
}

const FIRST_TOKEN_MS = 35_000;
const IDLE_MS = 30_000;
const TOTAL_MS = 100_000;
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
// Any OpenAI-compatible host serving DeepSeek works, which helps when the official API is queued.
const ENDPOINT = `${(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "")}/chat/completions`;

type Chunk = { choices?: { delta?: { content?: string | null } }[] };

/**
 * Streams the answer as it is generated. Fails fast when DeepSeek stalls instead of
 * holding the request open until the platform times out.
 */
export async function* streamDeepSeek(system: string, user: string, maxTokens: number, signal?: AbortSignal): AsyncGenerator<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new DeepSeekError(0);
  await charge();
  const controller = new AbortController();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => { stalled = true; controller.abort(); }, ms);
  };
  const total = setTimeout(() => { stalled = true; controller.abort(); }, TOTAL_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  arm(FIRST_TOKEN_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        thinking: { type: "disabled" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.3,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || !response.body) {
      // The status and reason show up in the platform's runtime logs.
      console.error("DeepSeek request failed", response.status, MODEL, (await response.text().catch(() => "")).slice(0, 300));
      throw new DeepSeekError(response.status || 502);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        // Keep-alive comments only mean DeepSeek has queued the request, so only real data resets the clock.
        arm(IDLE_MS);
        try {
          const delta = (JSON.parse(data) as Chunk).choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Ignore keep-alive or partial frames.
        }
      }
    }
  } catch (error) {
    if (error instanceof DeepSeekError) throw error;
    throw new DeepSeekError(stalled ? 504 : 502);
  } finally {
    clearTimeout(timer);
    clearTimeout(total);
    signal?.removeEventListener("abort", onAbort);
    controller.abort();
  }
}

/** One short, non-streamed call, used to turn a question into search keywords. */
export async function quickDeepSeek(system: string, user: string, maxTokens: number, timeoutMs: number) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  // Callers of this helper treat "no answer" as a soft failure, so a used-up allowance reads the same way.
  try { await chargeAi(); } catch (error) { if (error instanceof QuotaError) return null; throw error; }
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        thinking: { type: "disabled" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const result = await response.json() as { choices?: { message?: { content?: string | null } }[] };
    return result.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export function guideExcerpt(text: string) {
  const limit = 30_000;
  if (text.length <= limit) return { excerpt: text, coverage: "full" as const };
  const first = text.slice(0, 14_000);
  const middleStart = Math.floor((text.length - 8_000) / 2);
  const middle = text.slice(middleStart, middleStart + 8_000);
  const last = text.slice(-8_000);
  return {
    excerpt: `[Beginning]\n${first}\n\n[Middle excerpt]\n${middle}\n\n[Ending]\n${last}`,
    coverage: "excerpts" as const,
  };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ToolCall = { id: string; name: string; args: string };
export type ChatPart = { kind: "text"; text: string } | { kind: "tool_calls"; calls: ToolCall[] };

type ToolChunk = { choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };

/**
 * One streamed model turn with tool support: yields text as it arrives, then any tool calls the model asked for.
 * Uses the same stall rules as streamDeepSeek so a queued request fails fast.
 */
export async function* streamChat(messages: ChatMessage[], tools: ToolSpec[], maxTokens: number, signal?: AbortSignal): AsyncGenerator<ChatPart> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new DeepSeekError(0);
  await charge();
  const controller = new AbortController();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; controller.abort(); }, ms); };
  const total = setTimeout(() => { stalled = true; controller.abort(); }, TOTAL_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  arm(FIRST_TOKEN_MS);
  const calls = new Map<number, ToolCall>();
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, thinking: { type: "disabled" }, messages, tools, temperature: 0.2, max_tokens: maxTokens, stream: true }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || !response.body) {
      console.error("DeepSeek request failed", response.status, MODEL, (await response.text().catch(() => "")).slice(0, 300));
      throw new DeepSeekError(response.status || 502);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    outer: for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") break outer;
        arm(IDLE_MS);
        try {
          const delta = (JSON.parse(data) as ToolChunk).choices?.[0]?.delta;
          if (delta?.content) yield { kind: "text", text: delta.content };
          for (const part of delta?.tool_calls ?? []) {
            const current = calls.get(part.index) ?? { id: "", name: "", args: "" };
            if (part.id) current.id = part.id;
            if (part.function?.name) current.name += part.function.name;
            if (part.function?.arguments) current.args += part.function.arguments;
            calls.set(part.index, current);
          }
        } catch {
          // Ignore keep-alive or partial frames.
        }
      }
    }
    if (calls.size) yield { kind: "tool_calls", calls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call], index) => ({ ...call, id: call.id || `call_${index}` })) };
  } catch (error) {
    if (error instanceof DeepSeekError) throw error;
    throw new DeepSeekError(stalled ? 504 : 502);
  } finally {
    clearTimeout(timer);
    clearTimeout(total);
    signal?.removeEventListener("abort", onAbort);
    controller.abort();
  }
}
