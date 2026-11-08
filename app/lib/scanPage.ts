/**
 * Reads the real portfolio page that sits under the scan intro: every heading, line of text, card, media element
 * and section edge, as boxes in page coordinates. A scan row is then a thin horizontal band of the page: the boxes
 * it crosses become ASCII cells (edges as lines, text as its own letters, media as density) and musical features.
 */

export type BoxKind = "section" | "card" | "heading" | "text" | "link" | "media";
export type ScanBox = { kind: BoxKind; top: number; bottom: number; left: number; right: number; text: string; section: string; luma: number };
export type ScanSnapshot = { boxes: ScanBox[]; height: number; width: number; sections: { id: string; top: number; bottom: number }[] };

/** Cell styles, drawn in different colours. */
export const Ink = { Blank: 0, Edge: 1, Text: 2, Heading: 3, Media: 4, Rule: 5, Link: 6 } as const;
type InkValue = (typeof Ink)[keyof typeof Ink];

export type ScanRow = {
  index: number;
  y: number;
  section: string;
  chars: string;
  inks: Uint8Array;
  /** Columns where a vertical edge crosses this row, left to right. */
  edges: number[];
  textDensity: number;
  heading: boolean;
  links: number;
  media: number;
  sectionStart: boolean;
  empty: boolean;
};

/** The page height covered by one scan row. */
export const ROW_PX = 20;

const CARD_SELECTOR = [
  ".portfolio-glass-card",
  ".gallery-glass-card",
  ".project-card",
  ".workbench-cut",
  ".workbench-row",
  ".card",
  "header.section-head",
  ".section-head",
].join(",");

const SECTION_IDS = ["tian", "ren", "di", "development", "gallery", "workbench", "bio"];

const visible = (rect: DOMRect) => rect.width > 1 && rect.height > 1;

function luminance(colour: string) {
  const match = colour.match(/\d+(\.\d+)?/g);
  if (!match) return 0.5;
  const [r, g, b] = match.map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** One pass over the DOM. Runs when the intro opens and again when the layout changes. */
export function snapshotPage(root: HTMLElement): ScanSnapshot {
  const scrollY = window.scrollY;
  const width = document.documentElement.clientWidth;
  const boxes: ScanBox[] = [];
  const sections: ScanSnapshot["sections"] = [];

  const sectionOf = (element: Element) => element.closest("section[id]")?.id ?? "top";
  const push = (kind: BoxKind, rect: DOMRect, element: Element, text = "", luma = 0.5) => {
    boxes.push({ kind, top: rect.top + scrollY, bottom: rect.bottom + scrollY, left: Math.max(0, rect.left), right: Math.min(width, rect.right), text, section: sectionOf(element), luma });
  };

  for (const id of SECTION_IDS) {
    const element = document.getElementById(id);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (!visible(rect)) continue;
    sections.push({ id, top: rect.top + scrollY, bottom: rect.bottom + scrollY });
    push("section", rect, element);
  }

  root.querySelectorAll(CARD_SELECTOR).forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (visible(rect)) push("card", rect, element);
  });

  root.querySelectorAll("img, video, canvas, svg").forEach((element) => {
    // Backgrounds drawn on full-section canvases would fill everything; leave them out.
    if (element.matches(".gallery-veins, .workbench-mill, .dev-signal")) return;
    const rect = element.getBoundingClientRect();
    if (visible(rect) && rect.width > 24 && rect.height > 24) push("media", rect, element, "", luminance(getComputedStyle(element).color));
  });

  root.querySelectorAll("a, button").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (visible(rect) && (element.textContent ?? "").trim()) push("link", rect, element);
  });

  // Every line of text, with its own letters, so the scan shows what is really written there.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let lines = 0;
  for (let node = walker.nextNode(); node && lines < 6000; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    const parent = node.parentElement;
    if (!text || !parent || parent.closest("[aria-hidden='true'], script, style, .sr-only")) continue;
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter(visible);
    if (!rects.length) continue;
    const heading = !!parent.closest("h1, h2, h3");
    const total = rects.reduce((sum, rect) => sum + rect.width, 0);
    let offset = 0;
    for (const rect of rects) {
      // Share the node's letters among its line boxes by width: close enough for a scan.
      const count = Math.max(1, Math.round((rect.width / total) * text.length));
      push(heading ? "heading" : "text", rect, parent, text.slice(offset, offset + count));
      offset += count;
      lines += 1;
    }
  }

  boxes.sort((a, b) => a.top - b.top);
  return { boxes, height: document.documentElement.scrollHeight, width, sections };
}

const DENSITY = " .:-=+*#%@";

/** The ASCII and the features of one scan row of the page. */
export function readRow(snapshot: ScanSnapshot, index: number, cols: number): ScanRow {
  const y0 = index * ROW_PX;
  const y1 = y0 + ROW_PX;
  const chars = new Array<string>(cols).fill(" ");
  const inks = new Uint8Array(cols);
  const edgeSet = new Set<number>();
  const col = (x: number) => Math.max(0, Math.min(cols - 1, Math.floor((x / snapshot.width) * cols)));
  const set = (c: number, ch: string, ink: InkValue) => {
    chars[c] = ch;
    inks[c] = ink;
  };

  const section = snapshot.sections.find((s) => y0 >= s.top && y0 < s.bottom)?.id ?? "top";
  let sectionStart = false;
  let heading = false;
  let links = 0;
  let mediaCells = 0;
  let textCells = 0;

  // The boxes are sorted by top; stop as soon as they start below this row.
  const crossing: ScanBox[] = [];
  for (const box of snapshot.boxes) {
    if (box.top >= y1) break;
    if (box.bottom > y0) crossing.push(box);
  }

  const order: BoxKind[] = ["media", "card", "link", "text", "heading", "section"];
  for (const kind of order) {
    for (const box of crossing) {
      if (box.kind !== kind) continue;
      const c0 = col(box.left);
      const c1 = col(box.right - 1);
      const startsHere = box.top >= y0 && box.top < y1;
      const endsHere = box.bottom > y0 && box.bottom <= y1;
      if (kind === "media") {
        // A full-width background (a theme video) is only hinted at with sparse dots, so it never drowns the rest.
        const backdrop = box.right - box.left > snapshot.width * 0.6;
        for (let c = c0; c <= c1; c += 1) {
          const n = Math.abs((Math.sin(c * 12.9898 + index * 78.233) * 43758.5453) % 1);
          if (backdrop) {
            if (n > 0.93) set(c, n > 0.985 ? ":" : "·", Ink.Media);
            continue;
          }
          set(c, DENSITY[Math.min(DENSITY.length - 1, Math.floor(n * 4 + box.luma * 5))], Ink.Media);
          mediaCells += 1;
        }
      } else if (kind === "card") {
        if (startsHere || endsHere) {
          for (let c = c0; c <= c1; c += 1) set(c, "─", Ink.Edge);
          set(c0, startsHere ? "┌" : "└", Ink.Edge);
          set(c1, startsHere ? "┐" : "┘", Ink.Edge);
        } else {
          set(c0, "│", Ink.Edge);
          set(c1, "│", Ink.Edge);
        }
        edgeSet.add(c0);
        edgeSet.add(c1);
      } else if (kind === "link") {
        links += 1;
        if (endsHere) for (let c = c0; c <= c1; c += 1) if (chars[c] === " ") set(c, "_", Ink.Link);
      } else if (kind === "text" || kind === "heading") {
        // A line of text belongs to the row its middle falls in, so each line is written once.
        const middle = (box.top + box.bottom) / 2;
        if (middle < y0 || middle >= y1) continue;
        // One letter per column, spread over the line's width: big type gets gaps, small type is sampled.
        const span = c1 - c0 + 1;
        const length = box.text.length;
        for (let i = 0; i < length; i += 1) {
          const ch = box.text[i];
          const c = c0 + Math.floor((i * span) / length);
          if (ch === " " || c > c1) continue;
          set(c, ch, kind === "heading" ? Ink.Heading : Ink.Text);
          textCells += 1;
        }
        if (kind === "heading") heading = true;
      } else if (kind === "section" && startsHere) {
        sectionStart = true;
        const label = ` §${box.section.toUpperCase()} `;
        for (let c = 0; c < cols; c += 1) set(c, "━", Ink.Rule);
        for (let i = 0; i < label.length && 4 + i < cols; i += 1) set(4 + i, label[i], Ink.Rule);
      }
    }
  }

  const edges = Array.from(edgeSet).sort((a, b) => a - b);
  return {
    index,
    y: y0,
    section,
    chars: chars.join(""),
    inks,
    edges,
    textDensity: textCells / cols,
    heading,
    links,
    media: mediaCells / cols,
    sectionStart,
    empty: !edges.length && !textCells && !mediaCells && !sectionStart,
  };
}
