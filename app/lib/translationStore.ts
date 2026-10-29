import { del, get, list, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { scopeRoot } from "./workspaceScope";

/** Cached paragraph translations, sharded by position so each file stays small. */
const SHARD = 40_000;
type Entry = { h: string; t: string };
type Shard = Record<string, Entry>;

const shardPath = (root: string, documentId: string, offset: number) => `${root}translations/${documentId}/${Math.floor(offset / SHARD)}.json`;
const hashOf = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 12);
const CJK = /[㐀-鿿]/g;

/** Paragraphs that are already Chinese, or have no words, are left as they are. */
export function needsTranslation(text: string) {
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const cjk = text.match(CJK)?.length ?? 0;
  return letters >= 3 && cjk / Math.max(1, text.length) < 0.2;
}

async function readShard(path: string): Promise<Shard> {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return {};
  return JSON.parse(await new Response(result.stream).text()) as Shard;
}

export type BlockInput = { offset: number; text: string };

/** Cached translations for the given blocks; an entry is ignored when the source text has changed. */
export async function readTranslations(documentId: string, blocks: BlockInput[]) {
  const root = await scopeRoot();
  const shards = new Map<string, Shard>();
  await Promise.all([...new Set(blocks.map((block) => shardPath(root, documentId, block.offset)))].map(async (path) => shards.set(path, await readShard(path).catch(() => ({})))));
  const found = new Map<number, string>();
  for (const block of blocks) {
    const entry = shards.get(shardPath(root, documentId, block.offset))?.[String(block.offset)];
    if (entry && entry.h === hashOf(block.text)) found.set(block.offset, entry.t);
  }
  return found;
}

export async function writeTranslations(documentId: string, items: { block: BlockInput; translation: string }[]) {
  const root = await scopeRoot();
  const byPath = new Map<string, typeof items>();
  for (const item of items) byPath.set(shardPath(root, documentId, item.block.offset), [...(byPath.get(shardPath(root, documentId, item.block.offset)) ?? []), item]);
  for (const [path, group] of byPath) {
    const shard = await readShard(path).catch(() => ({} as Shard));
    for (const { block, translation } of group) shard[String(block.offset)] = { h: hashOf(block.text), t: translation };
    await put(path, JSON.stringify(shard), { access: "private", allowOverwrite: true, contentType: "application/json" });
  }
}

export async function deleteTranslations(documentId: string) {
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${await scopeRoot()}translations/${documentId}/`, limit: 200, cursor });
    paths.push(...page.blobs.map((blob) => blob.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (paths.length) await del(paths);
}
