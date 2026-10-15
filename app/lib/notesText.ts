/** Helpers over the editor's JSON document, shared by the server (previews, search) and the client (export). */

export type JSONNode = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: JSONNode[] };

const CONTAINERS = new Set(["doc", "bulletList", "orderedList", "taskList", "blockquote", "listItem", "taskItem"]);

/** Plain text of a document, with a newline between blocks. */
export function jsonToText(node: JSONNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const parts = (node.content ?? []).map(jsonToText);
  return CONTAINERS.has(node.type ?? "") ? parts.filter(Boolean).join("\n") : parts.join("");
}

const escapeMarkdown = (text: string) => text.replace(/([\\*_`~])/g, "\\$1");

function inline(node: JSONNode): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type !== "text") return (node.content ?? []).map(inline).join("");
  let text = node.text ?? "";
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === "code")) return `\`${text}\``;
  text = escapeMarkdown(text);
  for (const mark of marks) {
    if (mark.type === "bold") text = `**${text}**`;
    else if (mark.type === "italic") text = `*${text}*`;
    else if (mark.type === "strike") text = `~~${text}~~`;
    else if (mark.type === "highlight") text = `==${text}==`;
    else if (mark.type === "link" && typeof mark.attrs?.href === "string") text = `[${text}](${mark.attrs.href})`;
  }
  return text;
}

function block(node: JSONNode, depth = 0): string {
  const children = node.content ?? [];
  switch (node.type) {
    case "heading": return `${"#".repeat(Math.min(6, Number(node.attrs?.level) || 1))} ${children.map(inline).join("")}\n`;
    case "paragraph": return `${children.map(inline).join("")}\n`;
    case "blockquote": return children.map((child) => block(child, depth)).join("").split("\n").filter((line, i, all) => line || i < all.length - 1).map((line) => `> ${line}`).join("\n") + "\n";
    case "codeBlock": return `\`\`\`${typeof node.attrs?.language === "string" ? node.attrs.language : ""}\n${children.map((child) => child.text ?? "").join("")}\n\`\`\`\n`;
    case "horizontalRule": return "---\n";
    case "bulletList": return children.map((item) => listItem(item, depth, "- ")).join("");
    case "orderedList": return children.map((item, index) => listItem(item, depth, `${index + 1}. `)).join("");
    case "taskList": return children.map((item) => listItem(item, depth, `- [${item.attrs?.checked ? "x" : " "}] `)).join("");
    default: return children.map((child) => block(child, depth)).join("") || (node.text ? `${inline(node)}\n` : "");
  }
}

function listItem(item: JSONNode, depth: number, marker: string): string {
  const lines: string[] = [];
  for (const child of item.content ?? []) {
    if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") lines.push(block(child, depth + 1).trimEnd());
    else lines.push(block(child, depth).trimEnd());
  }
  const [first = "", ...rest] = lines;
  return `${"  ".repeat(depth)}${marker}${first}\n${rest.map((line) => (line.startsWith("  ") || /^\s*([-*]|\d+\.)\s/.test(line) ? line : `${"  ".repeat(depth + 1)}${line}`)).join("\n")}${rest.length ? "\n" : ""}`;
}

/** Markdown for a note, for export. */
export function jsonToMarkdown(title: string, doc: JSONNode | null | undefined) {
  const body = (doc?.content ?? []).map((node) => block(node)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return `${title ? `# ${title}\n\n` : ""}${body}\n`;
}

// ---- Markdown -> document (used when the assistant writes a note) ---------------

type Mark = { type: string; attrs?: Record<string, unknown> };

/** Inline Markdown (**bold**, *italic*, `code`, ~~strike~~, [text](url)) to text nodes with marks. */
function inlineNodes(text: string): JSONNode[] {
  const nodes: JSONNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) nodes.push({ type: "text", text: text.slice(last, match.index) });
    const marks: Mark[] = match[2] ? [{ type: "bold" }] : match[3] ? [{ type: "italic" }] : match[4] ? [{ type: "code" }] : match[5] ? [{ type: "strike" }] : [{ type: "link", attrs: { href: match[7] } }];
    nodes.push({ type: "text", text: match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6], marks });
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes.filter((node) => node.text);
}

const paragraph = (text: string): JSONNode => { const content = inlineNodes(text); return content.length ? { type: "paragraph", content } : { type: "paragraph" }; };

/** A small, forgiving Markdown parser: headings, lists, tasks, quotes, code fences, rules and paragraphs. */
export function markdownToDoc(markdown: string): JSONNode {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const content: JSONNode[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (/^```/.test(line)) {
      const code: string[] = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i]); i += 1) code.push(lines[i]);
      content.push({ type: "codeBlock", attrs: { language: line.slice(3).trim() || null }, content: code.length ? [{ type: "text", text: code.join("\n") }] : undefined });
    } else if (heading) {
      content.push({ type: "heading", attrs: { level: heading[1].length }, content: inlineNodes(heading[2]) });
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      content.push({ type: "horizontalRule" });
    } else if (/^\s*[-*]\s+\[[ xX]\]\s+/.test(line)) {
      const items: JSONNode[] = [];
      for (; i < lines.length && /^\s*[-*]\s+\[[ xX]\]\s+/.test(lines[i]); i += 1) {
        const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(lines[i])!;
        items.push({ type: "taskItem", attrs: { checked: task[1].toLowerCase() === "x" }, content: [paragraph(task[2])] });
      }
      i -= 1;
      content.push({ type: "taskList", content: items });
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: JSONNode[] = [];
      for (; i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*[-*]\s+\[[ xX]\]\s+/.test(lines[i]); i += 1) items.push({ type: "listItem", content: [paragraph(lines[i].replace(/^\s*[-*]\s+/, ""))] });
      i -= 1;
      content.push({ type: "bulletList", content: items });
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: JSONNode[] = [];
      for (; i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]); i += 1) items.push({ type: "listItem", content: [paragraph(lines[i].replace(/^\s*\d+[.)]\s+/, ""))] });
      i -= 1;
      content.push({ type: "orderedList", content: items });
    } else if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i += 1) quote.push(lines[i].replace(/^>\s?/, ""));
      i -= 1;
      content.push({ type: "blockquote", content: [paragraph(quote.join(" "))] });
    } else if (line.trim()) {
      content.push(paragraph(line.trim()));
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
