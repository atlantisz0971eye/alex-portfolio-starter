import { createHash, timingSafeEqual } from "node:crypto";
import { addToInbox } from "../../../../lib/newsEdition";
import { plain } from "../../../../lib/newsFeed";
import { SECTION_KEYS, type SectionKey } from "../../../../lib/newsSources";
import { workspaceStorageConfigured } from "../../../../lib/workspaceStore";

export const runtime = "nodejs";

const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();

function tokenOk(request: Request) {
  const token = clean(process.env.WORKSPACE_SYNC_TOKEN ?? "");
  if (token.length < 32) return "not_configured" as const;
  const given = clean((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b)) ? ("ok" as const) : ("denied" as const);
}

const link = (value: unknown) => {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
};

/**
 * The home computer hands in the stories it has gathered: `{ section, items: [{ title, url, source, published?, text? }] }`.
 * Authenticated by the same token as the sync tool. Stories wait in an inbox and join the next edition; the model still
 * chooses among them and nothing here reaches the screen as written.
 */
export async function POST(request: Request) {
  if (request.headers.get("origin")) return Response.json({ error: "forbidden" }, { status: 403 });
  const auth = tokenOk(request);
  if (auth === "not_configured") return Response.json({ error: "sync_not_configured" }, { status: 503 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  let body: { section?: unknown; items?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 250_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const section = body.section as SectionKey;
  if (!SECTION_KEYS.includes(section) || !Array.isArray(body.items)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const stories = body.items.slice(0, 100).flatMap((entry) => {
    const o = (entry ?? {}) as Record<string, unknown>;
    const url = link(o.url);
    const title = plain(String(o.title ?? ""), 220);
    const source = plain(String(o.source ?? ""), 40);
    if (!url || !title || !source) return [];
    const when = Date.parse(String(o.published ?? ""));
    return [{ title, url, source, published: Number.isFinite(when) ? new Date(when).toISOString() : null, text: plain(String(o.text ?? ""), 500) }];
  });
  try {
    return Response.json({ accepted: await addToInbox(section, stories) });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
