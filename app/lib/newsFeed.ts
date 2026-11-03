import { WIKIPEDIA_RANDOM, type Feed } from "./newsSources";

export type Story = { title: string; url: string; source: string; published: string | null; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Math.min(Number(code), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Math.min(parseInt(code, 16), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

/** Plain text from a feed field: markup removed, entities decoded, whitespace folded. */
export function plain(value: string, max: number) {
  const text = decode(decode(value).replace(/<[^>]*>/g, " ")).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  return [...text].slice(0, max).join("");
}

const field = (block: string, names: string[]) => {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
    if (match) return match[1];
  }
  return "";
};

function linkOf(block: string) {
  const atom = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  const rel = block.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i);
  const raw = rel?.[1] ?? field(block, ["link", "guid"]) ?? atom?.[1] ?? "";
  return decode(raw || atom?.[1] || "").trim();
}

const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
};

/** The stories in an RSS, RDF or Atom document, newest first as the feed gave them. Nothing is trusted: text is cut and links are checked. */
export function parseFeed(xml: string, source: string, limit = 30): Story[] {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? [];
  const stories: Story[] = [];
  for (const block of blocks) {
    const title = plain(field(block, ["title"]), 220);
    const url = safeUrl(plain(linkOf(block), 600));
    if (!title || !url) continue;
    const when = Date.parse(plain(field(block, ["pubDate", "published", "updated", "dc:date"]), 60));
    stories.push({
      title,
      url,
      source,
      published: Number.isFinite(when) ? new Date(when).toISOString() : null,
      text: plain(field(block, ["description", "summary", "content:encoded", "content"]), 500),
    });
    if (stories.length >= limit) break;
  }
  return stories;
}

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; AlexWorkspaceNews/1.0)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" };

/** One feed, or nothing: a slow or broken source must never hold up the page. */
export async function fetchFeed(feed: Feed, limit = 30): Promise<Story[]> {
  try {
    const response = await fetch(feed.url, { headers: HEADERS, signal: AbortSignal.timeout(9_000), cache: "no-store", redirect: "follow" });
    if (!response.ok) return [];
    const xml = (await response.text()).slice(0, 1_500_000);
    return parseFeed(xml, feed.source, limit);
  } catch { return []; }
}

/** One random Wikipedia article, as a story. */
export async function wikipediaRandom(): Promise<Story | null> {
  try {
    const response = await fetch(WIKIPEDIA_RANDOM, { headers: { ...HEADERS, Accept: "application/json" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
    const url = safeUrl(data.content_urls?.desktop?.page ?? "");
    const title = plain(data.title ?? "", 200);
    return url && title ? { title, url, source: "Wikipedia", published: null, text: plain(data.extract ?? "", 500) } : null;
  } catch { return null; }
}
