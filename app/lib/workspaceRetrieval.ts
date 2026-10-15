const CHUNK = 1400;
const FULL_LIMIT = 24_000;
const BUDGET = 13_000;
const STOP = new Set("the and for are but not you all can had her was one our out has have this that with from they will what when where which who how why about into your their there been were would could should does did than then them these those also just like some more most such only over under very".split(" "));

const CJK = /[㐀-鿿]/;

function chunkText(text: string) {
  const chunks: { start: number; text: string }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + CHUNK);
    if (end < text.length) {
      const newline = text.indexOf("\n", end);
      if (newline !== -1 && newline - end < 400) end = newline + 1;
    }
    chunks.push({ start, text: text.slice(start, end) });
    start = end;
  }
  return chunks;
}

export function queryTerms(question: string, extra = "") {
  const source = `${question} ${extra}`.toLowerCase();
  const terms = new Set<string>();
  for (const word of source.match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? []) if (!STOP.has(word)) terms.add(word);
  for (const run of source.match(/[㐀-鿿]+/g) ?? []) {
    if (run.length === 1) terms.add(run);
    for (let i = 0; i < run.length - 1; i += 1) terms.add(run.slice(i, i + 2));
  }
  return [...terms].slice(0, 40);
}

/** True when the question is Chinese but the book is mostly not, so keywords need translating first. */
export function needsEnglishKeywords(question: string, text: string) {
  return CJK.test(question) && (text.slice(0, 5000).match(/[㐀-鿿]/g)?.length ?? 0) < 100;
}

/**
 * Picks the passages most relevant to a question from the whole book, plus the
 * passage the reader is on, so answers do not depend on a fixed excerpt.
 */
export function retrieveContext(text: string, terms: string[], offset: number) {
  if (text.length <= FULL_LIMIT) return { context: text, coverage: "full" as const };
  const chunks = chunkText(text);
  const lower = chunks.map((chunk) => chunk.text.toLowerCase());
  const df = new Map<string, number>();
  const counts = lower.map((chunk) => {
    const row = new Map<string, number>();
    for (const term of terms) {
      let count = 0;
      for (let at = chunk.indexOf(term); at !== -1 && count < 20; at = chunk.indexOf(term, at + term.length)) count += 1;
      if (count) { row.set(term, count); df.set(term, (df.get(term) ?? 0) + 1); }
    }
    return row;
  });
  const scored = counts.map((row, index) => {
    let score = 0;
    for (const [term, count] of row) score += Math.log(1 + chunks.length / (df.get(term) ?? 1)) * (1 + Math.log(count));
    return { index, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);

  const picked = new Set<number>();
  const here = Math.max(0, chunks.findIndex((chunk, i) => chunk.start <= offset && (chunks[i + 1]?.start ?? Infinity) > offset));
  picked.add(here);
  let size = chunks[here].text.length;
  for (const item of scored) {
    if (size + chunks[item.index].text.length > BUDGET) break;
    if (!picked.has(item.index)) { picked.add(item.index); size += chunks[item.index].text.length; }
  }
  if (picked.size < 5) {
    // Little or no keyword signal: fall back to the passages around the reading position.
    for (const near of [here + 1, here - 1, here + 2, here - 2, 0]) {
      if (near >= 0 && near < chunks.length && size < BUDGET / 2 && !picked.has(near)) { picked.add(near); size += chunks[near].text.length; }
    }
  }
  const context = [...picked].sort((a, b) => a - b)
    .map((index) => `--- ${index === here ? "excerpt at the reader's current position" : "excerpt"} ---\n${chunks[index].text}`)
    .join("\n\n");
  return { context, coverage: "retrieved" as const };
}
