export type Block = {
  /** Offset of the block's first character in the full document text. */
  offset: number;
  /** Source page (PDF) the block starts on, when known. */
  page: number | null;
  text: string;
  /** Set for chapter headings; `text` is empty. */
  heading?: string;
};

const PAGE_MARKER = /^\[Page (\d+)\]$/;
const CJK = /[㐀-鿿]/;
const SENTENCE_END = /[.!?。！？"”’)]$/;
const MAX_BLOCK = 1800;

function joinLines(lines: string[]) {
  let out = "";
  for (const line of lines) {
    if (!out) out = line;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line;
    else if (CJK.test(out.slice(-1)) && CJK.test(line[0])) out += line;
    else out += ` ${line}`;
  }
  return out;
}

function splitLong(text: string, offset: number, page: number | null): Block[] {
  if (text.length <= MAX_BLOCK) return [{ offset, page, text }];
  const sentences = text.split(/(?<=[.!?。！？])\s*/);
  const out: Block[] = [];
  let current = "";
  let consumed = 0;
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > 1200) {
      out.push({ offset: offset + consumed - current.length, page, text: current.trim() });
      current = "";
    }
    current += `${current ? " " : ""}${sentence}`;
    consumed += sentence.length + 1;
    while (current.length > MAX_BLOCK) {
      out.push({ offset: offset + consumed - current.length, page, text: current.slice(0, MAX_BLOCK) });
      current = current.slice(MAX_BLOCK);
    }
  }
  if (current.trim()) out.push({ offset: offset + consumed - current.length, page, text: current.trim() });
  return out;
}

/**
 * Turns one stored text segment into reading blocks. PDF extraction hard-wraps
 * lines, so `reflow` rejoins them into paragraphs; other formats keep their breaks.
 */
export function toBlocks(text: string, base: number, reflow: boolean, chapters: Map<number, string>): Block[] {
  const blocks: Block[] = [];
  let page: number | null = null;
  const chunks: { start: number; raw: string }[] = [];
  const breaks = /\n{2,}/g;
  let cursor = 0;
  for (let match = breaks.exec(text); match; match = breaks.exec(text)) {
    chunks.push({ start: cursor, raw: text.slice(cursor, match.index) });
    cursor = match.index + match[0].length;
  }
  chunks.push({ start: cursor, raw: text.slice(cursor) });

  for (const chunk of chunks) {
    const lines: { at: number; text: string }[] = [];
    let at = chunk.start;
    for (const raw of chunk.raw.split("\n")) {
      const trimmed = raw.trim();
      if (trimmed) lines.push({ at: at + (raw.length - raw.trimStart().length), text: trimmed });
      at += raw.length + 1;
    }
    const longest = Math.max(30, ...lines.map((line) => line.text.length));
    let group: { at: number; text: string }[] = [];
    const flush = () => {
      if (!group.length) return;
      const offset = base + group[0].at;
      const body = reflow ? joinLines(group.map((line) => line.text)) : group.map((line) => line.text).join("\n");
      blocks.push(...splitLong(body, offset, page));
      group = [];
    };
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const marker = PAGE_MARKER.exec(line.text);
      if (marker) {
        flush();
        page = Number(marker[1]);
        continue;
      }
      const title = chapters.get(base + line.at);
      if (title !== undefined) {
        flush();
        blocks.push({ offset: base + line.at, page, text: "", heading: title });
        if (title.includes(" · ")) i += 1;
        continue;
      }
      group.push(line);
      // Without blank lines, a short line that ends a sentence is the end of a paragraph.
      if (reflow && SENTENCE_END.test(line.text) && line.text.length < longest * 0.7) flush();
    }
    flush();
  }
  return blocks;
}
