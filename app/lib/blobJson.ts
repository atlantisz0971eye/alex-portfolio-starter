import { BlobPreconditionFailedError, del, get, put } from "@vercel/blob";

/**
 * Safe JSON files in private Blob storage. A plain "read, change, write back" loses one of two writers that meet; these
 * helpers write only if the file is still what was read (its ETag), and otherwise read again and redo the change.
 * A missing file reads as the fallback; any other read failure is retried and then thrown, never taken as empty.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const conflict = (error: unknown) => error instanceof BlobPreconditionFailedError || (error instanceof Error && /already exists|precondition/i.test(error.message));
const missing = (error: unknown) => error instanceof Error && /not.?found/i.test(`${error.name} ${error.message}`);

/** The file's content and ETag (none when it does not exist). */
export async function readJsonTagged<T>(path: string, fallback: T): Promise<{ value: T; etag?: string }> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await get(path, { access: "private", useCache: false });
      if (!result) return { value: fallback };
      if (result.statusCode === 200) return { value: JSON.parse(await new Response(result.stream).text()) as T, etag: result.blob.etag };
      last = new Error(`blob_${result.statusCode}`);
    } catch (error) {
      if (missing(error)) return { value: fallback };
      last = error;
    }
    await sleep(300 * (attempt + 1));
  }
  throw last instanceof Error ? last : new Error("blob_read_failed");
}

export const readJsonSafe = async <T>(path: string, fallback: T) => (await readJsonTagged(path, fallback)).value;

/**
 * Applies `change` to the current content and writes it, retrying from a fresh read when someone else wrote first.
 * `change` returns the new content, or `undefined` to leave the file alone. Returns what is now stored.
 */
export async function updateJson<T>(path: string, fallback: T, change: (current: T) => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { value, etag } = await readJsonTagged(path, fallback);
    const next = change(structuredClone(value));
    if (next === undefined) return value;
    try {
      await put(path, JSON.stringify(next), { access: "private", contentType: "application/json", ...(etag ? { ifMatch: etag, allowOverwrite: true } : { allowOverwrite: false }) });
      return next;
    } catch (error) {
      if (!conflict(error)) throw error;
      await sleep(150 * (attempt + 1) + Math.random() * 200);
    }
  }
  throw new Error("blob_write_conflict");
}

/**
 * Runs `work` only if no one else holds the lease at `path`; a lease older than `ms` is taken over (its holder died).
 * Returns `null` without running when the lease is held.
 */
export async function withLease<T>(path: string, ms: number, work: () => Promise<T>): Promise<T | null> {
  const now = Date.now();
  const { value, etag } = await readJsonTagged<{ until: number } | null>(path, null);
  if (value && value.until > now) return null;
  try {
    await put(path, JSON.stringify({ until: now + ms }), { access: "private", contentType: "application/json", ...(etag ? { ifMatch: etag, allowOverwrite: true } : { allowOverwrite: false }) });
  } catch (error) {
    if (conflict(error)) return null;
    throw error;
  }
  try { return await work(); }
  finally { await del(path).catch(() => undefined); }
}
