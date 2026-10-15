import { createHash, randomBytes } from "node:crypto";
import { decryptToken } from "./mailCrypto";
import type { MailAccount } from "./mailStore";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class MailAuthError extends Error {
  constructor() { super("Gmail authorization expired"); }
}

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// ---- OAuth (authorization code + PKCE) ------------------------------------------

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authUrl(params: { state: string; challenge: string; redirectUri: string; loginHint?: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    // "consent" makes Google return a refresh token every time, not only on the first grant.
    prompt: "consent select_account",
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    state: params.state,
    ...(params.loginHint ? { login_hint: params.loginHint } : {}),
  }).toString();
  return url.toString();
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok) {
    if (data.error === "invalid_grant") throw new MailAuthError();
    throw new Error(`Google token request failed (${response.status})`);
  }
  return data;
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const data = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });
  if (!data.access_token || !data.refresh_token) throw new Error("Google did not return a refresh token");
  // Only the read-only scope is acceptable; refuse anything broader.
  if (data.scope && data.scope.split(" ").some((scope) => scope.startsWith("https://") && scope !== GMAIL_SCOPE)) throw new Error("Unexpected scope granted");
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function revokeToken(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

const accessCache = new Map<string, { token: string; expires: number }>();

export async function accessTokenFor(account: MailAccount) {
  const cached = accessCache.get(account.id);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptToken(account.tokenEnc) });
  if (!data.access_token) throw new Error("No access token");
  accessCache.set(account.id, { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3000) * 1000 });
  return data.access_token;
}

// ---- Gmail API ------------------------------------------------------------------

async function gmail<T>(token: string, path: string, params: Record<string, string | string[] | undefined> = {}): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (response.status === 401) throw new MailAuthError();
  if (!response.ok) throw new Error(`Gmail request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function profileEmail(token: string) {
  return (await gmail<{ emailAddress: string }>(token, "profile")).emailAddress;
}

type Header = { name: string; value: string };
type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[]; headers?: Header[] };
type RawMessage = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Part };

export type MailSummary = {
  id: string;
  threadId: string;
  account: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: number;
  unread: boolean;
};

const header = (message: RawMessage, name: string) => message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/** "Ada Lovelace <ada@example.com>" -> display name and address. */
export function parseSender(value: string) {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { name: decodeWords(match[1]).trim() || match[2], email: match[2] };
  return { name: value.trim(), email: value.trim() };
}

/** Decodes RFC 2047 encoded words such as =?UTF-8?B?...?= that appear in headers. */
export function decodeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_match, charset: string, encoding: string, text: string) => {
    try {
      const bytes = encoding.toUpperCase() === "B"
        ? Buffer.from(text, "base64")
        : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
      return new TextDecoder(charset.toLowerCase() === "utf-8" ? "utf-8" : charset).decode(bytes);
    } catch {
      return text;
    }
  }).replace(/\?=\s+=\?/g, "");
}

function summarize(message: RawMessage, account: MailAccount): MailSummary {
  const sender = parseSender(header(message, "From"));
  return {
    id: message.id,
    threadId: message.threadId,
    account: account.id,
    from: sender.name,
    fromEmail: sender.email,
    subject: decodeWords(header(message, "Subject")) || "(no subject)",
    snippet: decodeEntities(message.snippet ?? ""),
    date: Number(message.internalDate) || Date.parse(header(message, "Date")) || 0,
    unread: !!message.labelIds?.includes("UNREAD"),
  };
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await run(items[index]);
    }
  }));
  return out;
}

export async function listMessages(account: MailAccount, options: { q?: string; pageToken?: string; max?: number }) {
  const token = await accessTokenFor(account);
  const list = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token, "messages", {
    maxResults: String(options.max ?? 20),
    pageToken: options.pageToken,
    q: options.q || undefined,
    // Without a search, show the inbox; a search covers all mail except spam and trash.
    labelIds: options.q ? undefined : ["INBOX"],
  });
  const messages = await mapLimit(list.messages ?? [], 8, (item) =>
    gmail<RawMessage>(token, `messages/${item.id}`, { format: "metadata", metadataHeaders: ["From", "Subject", "Date"] }));
  return { messages: messages.map((message) => summarize(message, account)), next: list.nextPageToken };
}

// ---- Message bodies -------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Reduces HTML mail to readable text. Nothing from the message is ever rendered as HTML. */
export function htmlToText(html: string) {
  return decodeEntities(html
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return /^https?:/i.test(href) && text && !text.includes(href) ? `${text} (${href})` : text || href;
    })
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/table)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const decodeBody = (data?: string) => data ? Buffer.from(data, "base64url").toString("utf8") : "";

function collect(part: Part, out: { plain: string[]; html: string[]; attachments: { name: string; size: number }[] }) {
  if (part.filename) out.attachments.push({ name: part.filename, size: part.body?.size ?? 0 });
  else if (part.mimeType === "text/plain") out.plain.push(decodeBody(part.body?.data));
  else if (part.mimeType === "text/html") out.html.push(decodeBody(part.body?.data));
  part.parts?.forEach((child) => collect(child, out));
}

export type MailDetail = MailSummary & { to: string; body: string; attachments: { name: string; size: number }[]; truncated: boolean };

const BODY_LIMIT = 60_000;

export async function getMessage(account: MailAccount, id: string): Promise<MailDetail> {
  const token = await accessTokenFor(account);
  const message = await gmail<RawMessage>(token, `messages/${encodeURIComponent(id)}`, { format: "full" });
  const found = { plain: [] as string[], html: [] as string[], attachments: [] as { name: string; size: number }[] };
  if (message.payload) collect(message.payload, found);
  const text = found.plain.join("\n").trim() || htmlToText(found.html.join("\n"));
  return {
    ...summarize(message, account),
    to: decodeWords(header(message, "To")),
    body: text.slice(0, BODY_LIMIT),
    truncated: text.length > BODY_LIMIT,
    attachments: found.attachments,
  };
}
