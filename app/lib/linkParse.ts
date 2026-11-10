/**
 * What can be told from pasted text alone, with no network: the link inside it, which platform it is, what the share
 * text says (apps wrap a link in a sentence that carries the title), and, where the platform's ids encode it, when
 * the post was made. Pure, so the browser shows it while the person is still typing and the server stores the same.
 */
export type Platform = "x" | "douyin" | "tiktok" | "xiaohongshu" | "bilibili" | "youtube" | "weibo" | "github" | "arxiv" | "web";
export type Shared = { title?: string; author?: string };
export type Parsed = { url: string | null; platform: Platform | null; shared: Shared; postedAt: string | null };

export const PLATFORM_LABEL: Record<Platform, string> = { x: "X", douyin: "抖音", tiktok: "TikTok", xiaohongshu: "小红书", bilibili: "哔哩哔哩", youtube: "YouTube", weibo: "微博", github: "GitHub", arxiv: "arXiv", web: "网页" };

const URL_PATTERN = /https?:\/\/[^\s<>"'`，。；！？、】）》]+/i;

/** The first link in the text, without the punctuation a sentence leaves on its end. */
export function findUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[.,;:!?)\]}]+$/, ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}

const HOSTS: [RegExp, Platform][] = [
  [/(^|\.)(x|twitter)\.com$/, "x"],
  [/(^|\.)(douyin|iesdouyin)\.com$/, "douyin"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(xiaohongshu\.com|xhslink\.com)$/, "xiaohongshu"],
  [/(^|\.)(bilibili\.com|b23\.tv)$/, "bilibili"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(weibo\.com|weibo\.cn)$/, "weibo"],
  [/(^|\.)github\.com$/, "github"],
  [/(^|\.)arxiv\.org$/, "arxiv"],
];

export function platformOf(url: string): Platform {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return "web"; }
  return HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? "web";
}

const X_EPOCH = 1288834974657n;
const sane = (ms: number, now: number) => ms > Date.UTC(2010, 10, 1) && ms < now + 86_400_000;

/**
 * When the post was made, read from its id. X ids are snowflakes (milliseconds since its epoch in the high bits);
 * TikTok and Douyin video ids carry Unix seconds in their high 32 bits. A result outside any plausible range means the
 * id is not of that shape, and nothing is claimed.
 */
export function postedFromId(url: string, platform: Platform, now = Date.now()): string | null {
  let path = "";
  try { path = new URL(url).pathname; } catch { return null; }
  try {
    if (platform === "x") {
      const id = path.match(/\/status(?:es)?\/(\d{6,20})/)?.[1];
      if (!id) return null;
      const ms = Number((BigInt(id) >> 22n) + X_EPOCH);
      // ids from before snowflakes (late 2010) are small counters and decode to the epoch itself
      return BigInt(id) >> 22n > 0n && sane(ms, now) ? new Date(ms).toISOString() : null;
    }
    if (platform === "tiktok" || platform === "douyin") {
      const id = path.match(/\/(?:video|note)\/(\d{15,20})/)?.[1];
      if (!id) return null;
      const ms = Number(BigInt(id) >> 32n) * 1000;
      return ms > Date.UTC(2016, 0, 1) && sane(ms, now) ? new Date(ms).toISOString() : null;
    }
  } catch { /* not a number after all */ }
  return null;
}

const BOILERPLATE = [
  /复制(打开|此链接|本条信息)[^，。！\s]*[，。！]?/g,
  /打开(Dou音|抖音|【?小红书】?\s*App?)[^，。！\s]*[，。！]?/gi,
  /(直接)?(观看视频|查看精彩内容)[！!，,]?/g,
  /^\s*\d+(\.\d+)?\s+/,
  /\b[A-Za-z]{2,4}:\/\s*/g,
  /\s\d{2}\/\d{2}\s*/g,
  /[a-zA-Z]@[a-zA-Z]\.[a-zA-Z]{2}\s*/g,
];

/** The words an app wrapped around the link: usually the post's title, and for Douyin whose post it is. */
export function sharedText(text: string, url: string | null): Shared {
  let rest = (url ? text.replace(url, " ") : text).replace(URL_PATTERN, " ");
  const author = rest.match(/【(.{1,40}?)的(?:作品|图文作品|视频)】/)?.[1]?.trim();
  rest = rest.replace(/(?:看看)?\s*【.{1,40}?的(?:作品|图文作品|视频)】/, " ").replace(/【小红书】/g, " ");
  for (const pattern of BOILERPLATE) rest = rest.replace(pattern, " ");
  const title = rest.replace(/\s+/g, " ").trim();
  return { ...(title.length >= 2 ? { title: [...title].slice(0, 300).join("") } : {}), ...(author ? { author } : {}) };
}

export function parsePasted(text: string, now = Date.now()): Parsed {
  const url = findUrl(text);
  if (!url) return { url: null, platform: null, shared: {}, postedAt: null };
  const platform = platformOf(url);
  // a bare link has no share text; whatever else was typed around a link is kept as the title the app gave it
  return { url, platform, shared: sharedText(text, url), postedAt: postedFromId(url, platform, now) };
}

/** "3 小时后" / "2 天后": how long after it was posted the person came across it. */
export function lagText(postedAt: string, seenAt: string) {
  const ms = Date.parse(seenAt) - Date.parse(postedAt);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `发出 ${Math.max(1, minutes)} 分钟后看到`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `发出 ${hours} 小时后看到`;
  return `发出 ${Math.round(hours / 24)} 天后看到`;
}
