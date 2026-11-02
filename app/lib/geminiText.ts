import { chargeAi, QuotaError } from "./aiQuota";
import { GeminiError } from "./gemini";

/**
 * One JSON answer from Gemini for a system prompt and some data. There is no fallback to another model: private writing
 * is only ever sent where the person chose, so a missing key or a failed call is an error, not a quiet switch.
 */
export async function geminiJson(system: string, user: string, maxTokens: number, timeoutMs: number, attempt = 1): Promise<Record<string, unknown>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("gemini_not_configured");
  try { await chargeAi(); } catch (error) { if (error instanceof QuotaError) throw new GeminiError("ai_quota"); throw error; }
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  }).catch(() => null);
  if (!response) throw new GeminiError("gemini_failed");
  const data = await response.json().catch(() => ({})) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string }; error?: { message?: string } };
  if (!response.ok) {
    console.error("Gemini request failed", response.status, data.error?.message?.slice(0, 200));
    if (response.status === 402) throw new GeminiError("gemini_billing");
    throw new GeminiError([400, 401, 403, 429].includes(response.status) ? "gemini_forbidden" : "gemini_failed");
  }
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  try { return JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as Record<string, unknown>; }
  catch {
    // Only the reason is logged, never the text: it is made from private writing.
    const reason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? "none";
    console.error("Gemini returned unreadable output", { reason, chars: raw.length, attempt, maxTokens });
    // Thinking tokens count against the limit, so a long answer can be cut off. Once more with room to spare.
    if (reason === "MAX_TOKENS" && attempt < 2) return geminiJson(system, user, Math.min(maxTokens * 2, 32_000), timeoutMs, attempt + 1);
    throw new GeminiError("gemini_failed");
  }
}
