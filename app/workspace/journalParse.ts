import { strFromU8, unzipSync } from "fflate";

/**
 * Reads an Apple Journal export (or plain HTML, text and Markdown files) in the browser, so photos and recordings never
 * leave the device: only the text of each entry and the day it was written go to the server. The export's markup is not
 * documented, so this looks for the date and the text in several likely places rather than relying on one layout.
 */
export type Parsed = { at: string; text: string; title?: string };
export type Report = { pieces: Parsed[]; undated: number; files: number };

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const iso = (y: number, m: number, d: number) => (y >= 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00.000Z` : null);

/** The first date found in a piece of text, as noon UTC of that day. */
export function findDate(text: string): string | null {
  let m = text.match(/(\d{4})[-_./](\d{1,2})[-_./](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(new RegExp(`(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, "i"));
  if (m) return iso(+m[3], MONTHS.split("|").indexOf(m[1].toLowerCase()) + 1, +m[2]);
  m = text.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\.?,?\\s+(\\d{4})`, "i"));
  if (m) return iso(+m[3], MONTHS.split("|").indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return null;
}

function htmlToParsed(name: string, html: string): { at: string | null; text: string; title?: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,img,video,audio,svg").forEach((el) => el.remove());
  const byClass = (re: RegExp) => [...doc.querySelectorAll<HTMLElement>("[class]")].filter((el) => re.test(el.getAttribute("class") ?? ""));
  const dateEl = byClass(/(^|\s)(page)?(date|header)/i)[0];
  const titleEl = byClass(/(^|\s)title/i)[0] ?? doc.querySelector("h1");
  const title = titleEl?.textContent?.trim() || doc.title?.trim() || undefined;
  const bodyEl = byClass(/body|content|text/i).filter((el) => !el.querySelector("[class*=body],[class*=Body]"))[0] ?? doc.body;
  const clone = bodyEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll("p,div,li,h1,h2,h3,h4,tr").forEach((el) => el.append("\n"));
  const full = (clone.textContent ?? "").replace(/ /g, " ");
  const at = findDate(name) ?? (dateEl ? findDate(dateEl.textContent ?? "") : null) ?? findDate(doc.body?.textContent ?? "");
  let text = full;
  for (const drop of [dateEl?.textContent?.trim(), titleEl?.textContent?.trim()]) if (drop && text.trimStart().startsWith(drop)) text = text.trimStart().slice(drop.length);
  return { at, text: text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), title: title && title !== text.trim() ? title.slice(0, 120) : undefined };
}

function textToParsed(name: string, text: string) {
  const at = findDate(name) ?? findDate(text.slice(0, 200));
  return { at, text: text.replace(/\r\n/g, "\n").trim() };
}

export async function readJournalFiles(files: File[]): Promise<Report> {
  const sources: { name: string; body: string }[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      // Only text files are unpacked; photos and recordings in the archive are never opened.
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (info) => /\.(html?|txt|md|markdown)$/i.test(info.name) && info.originalSize < 2_000_000 && !/(^|\/)(__MACOSX|Resources)\//i.test(info.name) });
      for (const [name, bytes] of Object.entries(entries)) sources.push({ name, body: strFromU8(bytes) });
    } else if (/\.(html?|txt|md|markdown)$/i.test(file.name)) sources.push({ name: file.name, body: await file.text() });
  }
  const pieces: Parsed[] = []; let undated = 0;
  for (const source of sources) {
    const parsed = /\.html?$/i.test(source.name) || /^\s*<(!doctype|html)/i.test(source.body) ? htmlToParsed(source.name, source.body) : { ...textToParsed(source.name, source.body), title: undefined };
    if (!parsed.text) continue;
    if (!parsed.at) { undated += 1; continue; }
    pieces.push({ at: parsed.at, text: parsed.text, ...(parsed.title ? { title: parsed.title } : {}) });
  }
  return { pieces, undated, files: sources.length };
}
