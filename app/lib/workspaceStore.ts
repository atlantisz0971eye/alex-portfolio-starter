import { del, get, list, put } from "@vercel/blob";
import { deleteTranslations } from "./translationStore";
import { scopeRoot } from "./workspaceScope";
import type { Chapter } from "./workspaceOutline";

export type WorkspaceDocument = {
  id: string;
  name: string;
  mimeType: string;
  filePath: string;
  textPath: string;
  createdAt: string;
  pageCount: number | null;
  characterCount: number;
  /** Pages of a scanned PDF that still have no recognized text. */
  ocrPending?: number[];
  /** The book's real title and author, read from the PDF and its first pages. */
  title?: string;
  author?: string;
  /** Whether a cover image was made from the first page. */
  cover?: boolean;
  /** Chapters found by the book's own bookmarks or by reading its contents pages (kept apart from the small metadata). */
  outline?: Chapter[];
  outlineSource?: "pdf" | "ai";
  enrichedAt?: string;
  /** Which version of the title/cover/contents reading produced the above, so better readers can run again. */
  enrichVersion?: number;
  guide?: string;
  guideCoverage?: "full" | "excerpts";
  messages?: { role: "user" | "assistant"; content: string }[];
};

type DocumentState = Pick<WorkspaceDocument, "guide" | "guideCoverage" | "messages" | "outline" | "outlineSource">;
export type WorkspaceDocumentSummary = Omit<WorkspaceDocument, keyof DocumentState>;

// Guides and chats grow with use, so they live apart from the small metadata
// record that the library list reads for every document.
/** Every path belongs to the signed-in person: the owner keeps `workspace/`, members get `workspace/users/<id>/`. */
const paths = (root: string) => ({
  root,
  docs: `${root}docs/`,
  meta: (id: string) => `${root}docs/${id}.json`,
  state: (id: string) => `${root}state/${id}.json`,
  progress: (id: string) => `${root}progress/${id}.json`,
  marks: (id: string) => `${root}marks/${id}.json`,
  bookmarks: (id: string) => `${root}bookmarks/${id}.json`,
  text: (id: string) => `${root}text/${id}.txt`,
  cover: (id: string) => `${root}covers/${id}.jpg`,
});
const P = async () => paths(await scopeRoot());
/** A stored file path is only trusted when it sits inside the signed-in person's folder. */
export async function ownsPath(pathname: string) {
  return pathname.startsWith((await scopeRoot())) && !pathname.includes("..");
}

export type MarkColor = "yellow" | "green" | "blue" | "pink";
/** A highlight inside one reading block, anchored by the block's offset in the document text. */
export type WorkspaceMark = {
  id: string;
  blockOffset: number;
  from: number;
  to: number;
  text: string;
  color: MarkColor;
  note?: string;
  createdAt: string;
};

/** A saved place in a book: the paragraph at the top of the page when it was set. */
export type WorkspaceBookmark = {
  id: string;
  /** Offset of the paragraph in the document text. */
  offset: number;
  /** Source page, for PDFs. */
  page?: number;
  chapter?: string;
  /** The first words of the page, so the bookmark can be recognised in a list. */
  label: string;
  createdAt: string;
};

export type WorkspaceLibraryItem = WorkspaceDocumentSummary & { progress: number | null; progressAt: string | null };

export const writeCover = async (id: string, bytes: Uint8Array) => put((await P()).cover(id), Buffer.from(bytes), { access: "private", allowOverwrite: true, contentType: "image/jpeg" });
export const readCover = async (id: string) => get((await P()).cover(id), { access: "private", useCache: false });

export function validDocumentId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id);
}

export function workspaceStorageConfigured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function readText(path: string) {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).text();
}

async function readMeta(id: string): Promise<WorkspaceDocument | null> {
  if (!validDocumentId(id)) return null;
  const raw = await readText((await P()).meta(id));
  if (!raw) return null;
  const value = JSON.parse(raw) as WorkspaceDocument;
  return value.id === id ? value : null;
}

export async function readDocument(id: string): Promise<WorkspaceDocument | null> {
  const meta = await readMeta(id);
  if (!meta) return null;
  const raw = await readText((await P()).state(id));
  // Documents saved before the split still carry guide/messages in the metadata.
  return raw ? { ...meta, ...(JSON.parse(raw) as DocumentState) } : meta;
}

export async function readDocumentText(id: string) {
  if (!validDocumentId(id)) return null;
  return readText((await P()).text(id));
}

export async function writeDocument(document: WorkspaceDocument, text?: string) {
  const { guide, guideCoverage, messages, outline, outlineSource, ...meta } = document;
  const p = await P();
  if (text !== undefined) {
    await put(p.text(document.id), text, {
      access: "private",
      allowOverwrite: true,
      contentType: "text/plain; charset=utf-8",
    });
  }
  if (guide !== undefined || guideCoverage !== undefined || messages !== undefined || outline !== undefined) {
    await put(p.state(document.id), JSON.stringify({ guide, guideCoverage, messages, outline, outlineSource }), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
  }
  await put(p.meta(document.id), JSON.stringify(meta), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readProgressRecord(id: string): Promise<{ offset: number; updatedAt: string | null } | null> {
  if (!validDocumentId(id)) return null;
  const raw = await readText((await P()).progress(id));
  if (!raw) return null;
  const value = JSON.parse(raw) as { offset?: unknown; updatedAt?: unknown };
  if (typeof value.offset !== "number" || !Number.isFinite(value.offset) || value.offset < 0) return null;
  return { offset: value.offset, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null };
}

export async function readProgress(id: string): Promise<number | null> {
  return (await readProgressRecord(id))?.offset ?? null;
}

export async function readMarks(id: string): Promise<WorkspaceMark[]> {
  if (!validDocumentId(id)) return [];
  const raw = await readText((await P()).marks(id));
  return raw ? JSON.parse(raw) as WorkspaceMark[] : [];
}

export async function writeMarks(id: string, marks: WorkspaceMark[]) {
  await put((await P()).marks(id), JSON.stringify(marks), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export async function readBookmarks(id: string): Promise<WorkspaceBookmark[]> {
  if (!validDocumentId(id)) return [];
  const raw = await readText((await P()).bookmarks(id));
  return raw ? JSON.parse(raw) as WorkspaceBookmark[] : [];
}

export async function writeBookmarks(id: string, bookmarks: WorkspaceBookmark[]) {
  await put((await P()).bookmarks(id), JSON.stringify(bookmarks), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export async function writeProgress(id: string, offset: number) {
  await put((await P()).progress(id), JSON.stringify({ offset, updatedAt: new Date().toISOString() }), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listDocuments(): Promise<WorkspaceLibraryItem[]> {
  const p = await P();
  const blobs: { pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: p.docs, limit: 100, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const documents = await Promise.all(blobs.map(async (blob) => {
    const id = blob.pathname.slice(p.docs.length).replace(/\.json$/, "");
    try {
      const meta = await readMeta(id);
      if (!meta) return null;
      const { guide, guideCoverage, messages, outline, outlineSource, ...summary } = meta;
      const record = await readProgressRecord(id).catch(() => null);
      return { ...summary, progress: record?.offset ?? null, progressAt: record?.updatedAt ?? null };
    } catch { return null; }
  }));
  return documents.filter((item): item is WorkspaceLibraryItem => !!item)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDocument(document: WorkspaceDocument) {
  await deleteTranslations(document.id).catch(() => undefined);
  const p = await P();
  const files = [p.meta(document.id), p.state(document.id), p.progress(document.id), p.marks(document.id), p.bookmarks(document.id), p.text(document.id), p.cover(document.id)];
  if (await ownsPath(document.filePath)) files.push(document.filePath);
  await del(files);
}

/** Best-effort removal of everything an interrupted upload may have left behind. */
export async function discardUpload(id: string, filePath: string) {
  try {
    const p = await P();
    await del([...(await ownsPath(filePath) ? [filePath] : []), p.text(id), p.state(id), p.progress(id), p.marks(id), p.bookmarks(id), p.meta(id)]);
  } catch {
    // Nothing more can be done here; the original error is what the caller reports.
  }
}

export async function readOriginalFile(document: WorkspaceDocument) {
  if (!(await ownsPath(document.filePath))) return null;
  return get(document.filePath, { access: "private", useCache: false });
}
