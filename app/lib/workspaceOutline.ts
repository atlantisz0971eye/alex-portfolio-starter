export type Chapter = { title: string; offset: number };

const SEGMENT_TARGET = 30_000;
const MIN_CHAPTER = 800;
const NUMBER_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";

const HEADING_PATTERNS = [
  new RegExp(`^(chapter|part|book|section)\\s+(\\d{1,3}|[ivxlc]{1,7}|${NUMBER_WORDS})\\b[\\s.:\\-—–]*(.{0,70})$`, "i"),
  /^第\s*[零〇一二三四五六七八九十百千两0-9]+\s*[章节回部篇卷]\s*.{0,40}$/,
  /^(prologue|epilogue|introduction|preface|foreword|afterword|conclusion|acknowledg(?:e)?ments|appendix(?:\s+[a-z0-9]+)?|序言|前言|引言|后记|结语|尾声|序章|终章)\s*$/i,
];
const PAGE_MARKER = /^\[Page \d+\]$/;

type Line = { start: number; text: string };

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start <= text.length) {
    const end = text.indexOf("\n", start);
    const stop = end === -1 ? text.length : end;
    lines.push({ start, text: text.slice(start, stop).trim() });
    if (end === -1) break;
    start = end + 1;
  }
  return lines;
}

const isHeading = (line: string) => line.length >= 2 && line.length <= 80 && HEADING_PATTERNS.some((pattern) => pattern.test(line));

/** Heuristic chapter detection over extracted text. Returns [] when no reliable structure is found. */
export function detectChapters(text: string): Chapter[] {
  const lines = splitLines(text);
  let candidates: Chapter[] = [];
  let previous = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.text) {
      const afterBreak = previous === "" || PAGE_MARKER.test(previous);
      if (afterBreak && isHeading(line.text)) {
        let title = line.text.replace(/\s+/g, " ");
        const next = lines[i + 1]?.text ?? "";
        // "Chapter 3" alone on a line is usually followed by its title.
        const bare = /^(chapter|part|book|section)\s+\S+\.?$/i.test(title) || /^第\s*\S+?\s*[章节回部篇卷]$/.test(title);
        if (bare && next && next.length <= 70 && !/[.。]$/.test(next) && !isHeading(next) && !PAGE_MARKER.test(next)) {
          title = `${title} · ${next.replace(/\s+/g, " ")}`;
        }
        candidates.push({ title, offset: line.start });
      }
      previous = line.text;
    } else {
      previous = "";
    }
  }

  // A printed table of contents lists many headings within a few hundred characters.
  const clustered = new Set<number>();
  for (let i = 0; i < candidates.length;) {
    let j = i;
    while (j + 1 < candidates.length && candidates[j + 1].offset - candidates[j].offset < 300) j += 1;
    if (j - i + 1 >= 3) for (let k = i; k <= j; k += 1) clustered.add(k);
    i = j + 1;
  }
  candidates = candidates.filter((_, index) => !clustered.has(index));

  // Running page headers repeat the same heading; keep only the first.
  const seen = new Set<string>();
  candidates = candidates.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  candidates = candidates.filter((item, index) => {
    const next = candidates[index + 1]?.offset ?? text.length;
    return next - item.offset >= MIN_CHAPTER;
  });
  if (candidates.length < 2) return [];
  if (candidates[0].offset > 3000) candidates.unshift({ title: "Beginning", offset: 0 });
  return candidates;
}

function naturalCut(text: string, from: number, limit: number) {
  const window = text.slice(Math.max(from + 4000, limit - 8000), limit);
  const base = Math.max(from + 4000, limit - 8000);
  for (const marker of ["\n\n[Page ", "\n\n", "\n"]) {
    const found = window.lastIndexOf(marker);
    if (found > 0) return base + found + (marker === "\n" ? 1 : 2);
  }
  return limit;
}

/** Start offsets of reading segments: chapter starts when possible, otherwise page or paragraph breaks. */
export function buildSegments(text: string, chapters: Chapter[]) {
  const starts = [0];
  let position = 0;
  for (;;) {
    const limit = position + SEGMENT_TARGET;
    const chapter = chapters.find((item) => item.offset > position + 3000 && item.offset <= limit);
    const remaining = text.length - position;
    if (chapter) {
      position = chapter.offset;
    } else if (remaining > SEGMENT_TARGET * 1.15) {
      position = naturalCut(text, position, limit);
    } else {
      break;
    }
    starts.push(position);
  }
  return starts;
}

export function segmentIndexFor(starts: number[], offset: number) {
  let index = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= offset) index = i;
    else break;
  }
  return index;
}
