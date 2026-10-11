import type { Language } from "../types/project";
import type { EntanglementSelection } from "./entanglement";

export type EntanglementNarrativePrompt = {
  system: string;
  user: string;
};

// The server route uses this prompt; the UI keeps a separate local fallback.
export function buildEntanglementNarrativePrompt(
  selections: EntanglementSelection[],
  lang: Language,
): EntanglementNarrativePrompt {
  const works = selections.map(({ category, work }) => ({
    category,
    title: work.title,
    creator: work.creator ?? null,
    description: work.note,
    keywords: work.keywords,
  }));

  const system = lang === "zh"
    ? [
      "你为艺术家网站的 Entanglement 交互创作简短 narrative。",
      "输入包含任意三个已选条目，可能全部来自同一类别。类别分别是艺术家自己的作品、欣赏的他人作品、工作之外感兴趣的书或影像。",
      "寻找三者之间具体且有张力的概念联系。如果包含艺术家自己的作品，可以从它出发；不要假设每类都有作品。",
      "关键词是创作线索，不是必须逐一罗列的标签。只使用输入中有依据的概念，不编造作品情节、创作意图或艺术家经历。",
      "写成一段自然、克制的中文，约 80–120 字。避免套话、空泛赞美与三件作品的流水账简介。只返回正文。",
    ].join("\n")
    : [
      "Write a short narrative for an artist website's Entanglement interaction.",
      "The input contains any three selected items. They may all come from the same category: the artist's own work, an admired work by another artist, or a book or film of interest outside work.",
      "Find a specific, productive conceptual relationship between all three selections. If the artist's own work is present, it may provide a starting point. Do not assume every category is represented.",
      "Keywords are creative cues, not a checklist to reproduce. Use only concepts supported by the input; do not invent plot details, intentions, or biographical claims.",
      "Write one restrained, natural English paragraph of about 50–80 words. Avoid generic praise and three separate mini-summaries. Return only the paragraph.",
    ].join("\n");

  return {
    system,
    user: JSON.stringify({ selectedWorks: works }, null, 2),
  };
}
