import { quickDeepSeek } from "./workspaceDeepSeek";

export type OrganizedItem = { text: string; parent: number | null };
export type Organized = { title: string; items: OrganizedItem[] };

const SYSTEM = `你是课堂笔记整理助手。用户给你一页手写或印刷笔记的 OCR 文本（可能中英混合，有错字和乱序）。
把它整理成思维导图的层级节点，只输出 JSON，不要任何解释，格式：
{"title":"这页笔记的标题（不超过 30 字）","items":[{"text":"节点文字","parent":null},{"text":"子节点","parent":0}]}
规则：
- items 按深度优先顺序排列；parent 是父节点在 items 数组里的下标，顶层节点为 null；父节点必须出现在子节点之前。
- 最多 24 个节点，层级不超过 3 层，每个节点不超过 120 字。
- 保持原文语言和措辞，不要翻译，不要添加原文没有的内容；只在非常明显时修正 OCR 错字。
- 待办事项、截止日期、人名、数字要保留，单独成节点。`;

export async function organizeNotes(text: string): Promise<Organized | null> {
  const raw = await quickDeepSeek(SYSTEM, `OCR 文本：\n${text.slice(0, 8000)}`, 2500, 55_000);
  if (!raw) return null;
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(json) as { title?: unknown; items?: unknown };
    if (!Array.isArray(parsed.items)) return null;
    const items: OrganizedItem[] = [];
    for (const item of parsed.items.slice(0, 24) as { text?: unknown; parent?: unknown }[]) {
      const value = typeof item?.text === "string" ? item.text.trim().slice(0, 120) : "";
      if (!value) continue;
      const parent = typeof item.parent === "number" && Number.isInteger(item.parent) && item.parent >= 0 && item.parent < items.length ? item.parent : null;
      items.push({ text: value, parent });
    }
    return items.length ? { title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 60) : "Notes", items } : null;
  } catch {
    return null;
  }
}
