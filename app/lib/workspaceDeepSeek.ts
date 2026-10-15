type DeepSeekResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
};

export class DeepSeekError extends Error {
  constructor(readonly status: number) {
    super("DeepSeek request failed");
  }
}

export async function askDeepSeek(system: string, user: string, maxTokens = 1200) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new DeepSeekError(503);
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.3,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(105_000),
    cache: "no-store",
  });
  if (!response.ok) throw new DeepSeekError(response.status);
  const result = await response.json() as DeepSeekResponse;
  const choice = result.choices?.[0];
  const answer = choice?.message?.content?.trim();
  if (!answer || choice?.finish_reason === "length") throw new DeepSeekError(502);
  return answer;
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
