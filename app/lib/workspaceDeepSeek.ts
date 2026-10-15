export class DeepSeekError extends Error {
  constructor(readonly status: number) {
    super("DeepSeek request failed");
  }
}

const FIRST_TOKEN_MS = 30_000;
const IDLE_MS = 30_000;
const TOTAL_MS = 100_000;
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";

type Chunk = { choices?: { delta?: { content?: string | null } }[] };

/**
 * Streams the answer as it is generated. Fails fast when DeepSeek stalls instead of
 * holding the request open until the platform times out.
 */
export async function* streamDeepSeek(system: string, user: string, maxTokens: number, signal?: AbortSignal): AsyncGenerator<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new DeepSeekError(503);
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
    const response = await fetch("https://api.deepseek.com/chat/completions", {
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
    if (!response.ok || !response.body) throw new DeepSeekError(response.status || 502);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm(IDLE_MS);
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
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
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
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
