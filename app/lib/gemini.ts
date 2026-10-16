import type { Organized } from "./boardOrganize";

export class GeminiError extends Error {
  constructor(readonly code: "gemini_not_configured" | "gemini_forbidden" | "gemini_failed") {
    super(code);
  }
}

export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;
const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";

const PROMPT = `这是一页纸质笔记本的照片，书写可能潦草、中英混杂，页面里可能有箭头、圈注、括号、星号和连线。
请先忠实地誊写，再理解其结构，只输出 JSON：
{"transcript":"逐行誊写的文字，保持原有顺序和原文语言，不要翻译","title":"这页笔记的标题（30 字内）","items":[{"text":"节点文字","parent":null}]}
要求：
- transcript：看不清、只能靠上下文猜的词，在词后面加 [?]；完全无法辨认的写 [...]。不要把猜测当成确定的内容。
- items：把笔记整理成思维导图的层级节点，按深度优先排列；parent 是父节点在 items 里的下标，顶层为 null，父节点必须在子节点之前。
- 利用箭头、括号、缩进、星号来判断层级和关联；星号或圈注的内容是重点，保留。
- 最多 24 个节点，不超过 3 层，每个节点不超过 120 字；保持原文语言，不要添加页面上没有的内容；待办、日期、人名、数字单独成节点。
- 页面没有可读文字时，transcript 为空字符串，items 为空数组。`;

export type NotesReading = { text: string; draft: Organized | null };

/** Reads a photographed notebook page with Gemini: a faithful transcript plus a proposed card tree, in one call. */
export async function readNotesWithGemini(image: Uint8Array, mime: string): Promise<NotesReading> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("gemini_not_configured");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL())}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: Buffer.from(image).toString("base64") } }, { text: PROMPT }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(55_000),
    cache: "no-store",
  }).catch(() => null);
  if (!response) throw new GeminiError("gemini_failed");
  const data = await response.json().catch(() => ({})) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
  if (!response.ok) {
    console.error("Gemini request failed", response.status, data.error?.message?.slice(0, 300));
    throw new GeminiError(response.status === 400 || response.status === 401 || response.status === 403 || response.status === 429 ? "gemini_forbidden" : "gemini_failed");
  }
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { transcript?: unknown; title?: unknown; items?: unknown };
    const text = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
    const items: Organized["items"] = [];
    if (Array.isArray(parsed.items)) {
      for (const item of parsed.items.slice(0, 24) as { text?: unknown; parent?: unknown }[]) {
        const value = typeof item?.text === "string" ? item.text.trim().slice(0, 120) : "";
        if (!value) continue;
        items.push({ text: value, parent: typeof item.parent === "number" && Number.isInteger(item.parent) && item.parent >= 0 && item.parent < items.length ? item.parent : null });
      }
    }
    return { text, draft: items.length ? { title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 60) : "Notes", items } : null };
  } catch {
    console.error("Gemini returned unreadable output", raw.slice(0, 200));
    throw new GeminiError("gemini_failed");
  }
}
