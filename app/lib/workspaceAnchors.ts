import type { Chapter } from "./workspaceOutline";

/**
 * Places in a book that the guide and the answers can point to. A reference is a real position in the stored text
 * (a paragraph start), found by the server; the model only chooses among numbered passages and never writes an offset.
 */
export type PassageRef = { offset: number; page?: number; snippet: string };
export type Refs = Record<string, PassageRef>;
type Passage = { offset: number; page: number | null; text: string };

const flat = (value: string) => value.replace(/\[Page \d+\]/g, " ").replace(/\s+/g, " ").trim();

/** The printed page a position falls on, from the last page marker before it. */
export function pageAt(text: string, offset: number): number | null {
  const at = text.lastIndexOf("[Page ", Math.max(0, offset));
  if (at < 0) return null;
  const match = /^\[Page (\d+)\]/.exec(text.slice(at, at + 16));
  return match ? Number(match[1]) : null;
}

/** The text as passages of about 300 to 1100 characters, each starting at a paragraph. */
export function passagesOf(text: string, min = 300, max = 1100): Passage[] {
  const out: Passage[] = [];
  const breaks = /\n{2,}/g;
  let cursor = 0;
  let current: Passage | null = null;
  const flush = () => { if (current && current.text.length > 40) out.push(current); current = null; };
  const take = (start: number, raw: string) => {
    const cleaned = flat(raw);
    if (!cleaned) return;
    const lead = raw.length - raw.replace(/^\s+/, "").length;
    const offset = start + lead + (raw.replace(/^\s+/, "").match(/^(?:\[Page \d+\]\s*)+/)?.[0].length ?? 0);
    if (!current) current = { offset, page: pageAt(text, offset), text: cleaned };
    else current.text += ` ${cleaned}`;
    if (current.text.length >= min) flush();
  };
  for (let match = breaks.exec(text); match; match = breaks.exec(text)) {
    take(cursor, text.slice(cursor, match.index));
    cursor = match.index + match[0].length;
  }
  take(cursor, text.slice(cursor));
  flush();
  // A passage that grew past the limit is cut at a sentence end so a reference stays close to what it quotes.
  return out.map((passage) => passage.text.length <= max ? passage : { ...passage, text: `${passage.text.slice(0, max).replace(/[^.!?。！？]*$/, "") || passage.text.slice(0, max)}` });
}

/** Passages for the guide: all of a short book, or a spread across a long one (chapter openings first), with numbers the model can cite. */
export function guideSample(text: string, outline: Chapter[] | undefined) {
  const BUDGET = 30_000;
  const passages = passagesOf(text);
  const full = text.length <= BUDGET;
  let chosen: number[];
  if (full) chosen = passages.map((_, index) => index);
  else {
    const picks = new Set<number>();
    const at = (offset: number) => { const index = passages.findIndex((passage) => passage.offset >= offset); return index < 0 ? passages.length - 1 : index; };
    [0, 1, 2, passages.length - 3, passages.length - 2, passages.length - 1].forEach((index) => { if (index >= 0 && index < passages.length) picks.add(index); });
    for (const chapter of (outline ?? []).slice(0, 30)) picks.add(at(chapter.offset));
    const rest = 36 - picks.size;
    for (let i = 0; i < rest; i += 1) picks.add(Math.min(passages.length - 1, Math.floor(((i + 0.5) / Math.max(1, rest)) * passages.length)));
    chosen = [...picks].sort((a, b) => a - b);
  }
  const each = full ? 1100 : Math.max(380, Math.min(900, Math.floor(BUDGET / chosen.length)));
  const refs: Refs = {};
  const lines = chosen.map((index, n) => {
    const passage = passages[index];
    const id = String(n + 1);
    refs[id] = { offset: passage.offset, ...(passage.page ? { page: passage.page } : {}), snippet: passage.text.slice(0, 90) };
    return `[§${id}]${passage.page ? ` (p.${passage.page})` : ""} ${passage.text.slice(0, each)}`;
  });
  return { excerpt: lines.join("\n\n"), refs, coverage: full ? ("full" as const) : ("excerpts" as const) };
}

/**
 * Keeps only the [§n] marks that point at a passage the model was really given, and the references they use.
 * Anything the model made up is removed from the text.
 */
export function settleRefs(answer: string, given: Refs): { text: string; refs: Refs } {
  const refs: Refs = {};
  const text = answer.replace(/\[§\s*(\d{1,3})\s*\]/g, (_match, id: string) => {
    if (!given[id]) return "";
    refs[id] = given[id];
    return `[§${id}]`;
  }).replace(/[ \t]+([，。；,.;])/g, "$1")
    // A long run of marks is noise; the first two are kept.
    .replace(/(?:\[§\d+\]){4,}/g, (run) => run.match(/\[§\d+\]/g)!.slice(0, 2).join(""));
  const used = new Set(text.match(/\[§\d+\]/g)?.map((mark) => mark.slice(2, -1)));
  for (const id of Object.keys(refs)) if (!used.has(id)) delete refs[id];
  return { text, refs };
}

/** Of the paragraphs in a chunk, where the one that best matches the question starts. */
export function bestStart(chunk: string, base: number, terms: string[]) {
  if (!terms.length) return base;
  const lower = chunk.toLowerCase();
  let best = base; let bestScore = 0; let cursor = 0;
  for (const part of lower.split(/\n{2,}/)) {
    let score = 0;
    for (const term of terms) if (part.includes(term)) score += 1;
    const lead = part.length - part.replace(/^\s+/, "").length;
    const skip = part.replace(/^\s+/, "").match(/^(?:\[page \d+\]\s*)+/)?.[0].length ?? 0;
    if (score > bestScore) { best = base + cursor + lead + skip; bestScore = score; }
    cursor += part.length + 2;
  }
  return best;
}
