import { quickDeepSeek } from "./workspaceDeepSeek";

type CardNode = { id?: unknown; type?: unknown; data?: { text?: unknown; kicker?: unknown; body?: unknown } };
type CardEdge = { source?: unknown; target?: unknown };

/** Turns a board into an indented outline: connected cards nest under their parent, the rest are listed as loose cards. */
export function outlineOfBoard(nodes: unknown[], edges: unknown[]) {
  const cards = new Map<string, string>();
  for (const node of nodes as CardNode[]) {
    if ((node.type === "text" || node.type === "block") && typeof node.id === "string" && typeof node.data?.text === "string" && node.data.text.trim()) {
      // A diagram block reads as its stereotype, name and details.
      const kicker = typeof node.data.kicker === "string" && node.data.kicker.trim() ? `«${node.data.kicker.trim()}» ` : "";
      const body = typeof node.data.body === "string" && node.data.body.trim() ? ` — ${node.data.body.trim().replace(/\s*\n\s*/g, "; ")}` : "";
      cards.set(node.id, `${kicker}${node.data.text.trim()}${body}`);
    }
  }
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const edge of edges as CardEdge[]) {
    if (typeof edge.source !== "string" || typeof edge.target !== "string" || !cards.has(edge.target)) continue;
    // A photo can be the source of a tree; it has no text, so its children become roots.
    if (cards.has(edge.source)) { children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]); hasParent.add(edge.target); }
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id) || depth > 6) return;
    seen.add(id);
    lines.push(`${"  ".repeat(depth)}- ${cards.get(id)!.replace(/\s*\n\s*/g, " / ")}`);
    (children.get(id) ?? []).forEach((child) => walk(child, depth + 1));
  };
  const roots = [...cards.keys()].filter((id) => !hasParent.has(id));
  const grouped = roots.filter((id) => (children.get(id) ?? []).length > 0);
  grouped.forEach((id) => walk(id, 0));
  const loose = roots.filter((id) => !seen.has(id));
  if (loose.length) { lines.push("", "（未连接的卡片）"); loose.forEach((id) => walk(id, 0)); }
  return { outline: lines.join("\n"), count: cards.size };
}

const NOTE_SYSTEM = `你是笔记串联助手。用户给你一块白板（思维导图）的大纲，缩进表示层级，“未连接的卡片”是没有连线的零散想法。
请把它汇总成一篇可以直接阅读和继续编辑的串联笔记，用 Markdown，不要任何解释：
- 第一行 “# 标题”，然后一段 2 到 3 句的概述。
- 按主题分成几个 “## 小节”，小节里用段落和列表把相关的卡片串联起来，点明它们之间的联系（因果、对比、先后）。
- 如果有待办事项、问题或值得追问的地方，最后加 “## 待办与问题”。
- 保持原文语言和措辞，不要添加大纲里没有的事实；不确定的联系用“可能”表达。`;

export async function summarizeBoard(title: string, outline: string) {
  const text = await quickDeepSeek(NOTE_SYSTEM, `白板标题：${title}\n\n大纲：\n${outline.slice(0, 9000)}`, 3000, 55_000);
  return text ? text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim() : null;
}
