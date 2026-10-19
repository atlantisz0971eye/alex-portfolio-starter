import { del, get, list, put } from "@vercel/blob";
import { deleteTranslations } from "./translationStore";
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
  guide?: string;
  guideCoverage?: "full" | "excerpts";
  messages?: { role: "user" | "assistant"; content: string }[];
};

type DocumentState = Pick<WorkspaceDocument, "guide" | "guideCoverage" | "messages" | "outline" | "outlineSource">;
export type WorkspaceDocumentSummary = Omit<WorkspaceDocument, keyof DocumentState>;

const metaPath = (id: string) => `workspace/docs/${id}.json`;
// Guides and chats grow with use, so they live apart from the small metadata
// record that the library list reads for every document.
const statePath = (id: string) => `workspace/state/${id}.json`;
const progressPath = (id: string) => `workspace/progress/${id}.json`;
const marksPath = (id: string) => `workspace/marks/${id}.json`;

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

export type WorkspaceLibraryItem = WorkspaceDocumentSummary & { progress: number | null; progressAt: string | null };
const textPath = (id: string) => `workspace/text/${id}.txt`;
const coverPath = (id: string) => `workspace/covers/${id}.jpg`;

export const writeCover = (id: string, bytes: Uint8Array) => put(coverPath(id), Buffer.from(bytes), { access: "private", allowOverwrite: true, contentType: "image/jpeg" });
export const readCover = (id: string) => get(coverPath(id), { access: "private", useCache: false });

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
  const raw = await readText(metaPath(id));
  if (!raw) return null;
  const value = JSON.parse(raw) as WorkspaceDocument;
  return value.id === id ? value : null;
}

export async function readDocument(id: string): Promise<WorkspaceDocument | null> {
  const meta = await readMeta(id);
  if (!meta) return null;
  const raw = await readText(statePath(id));
  // Documents saved before the split still carry guide/messages in the metadata.
  return raw ? { ...meta, ...(JSON.parse(raw) as DocumentState) } : meta;
}

export async function readDocumentText(id: string) {
  if (!validDocumentId(id)) return null;
  return readText(textPath(id));
}

export async function writeDocument(document: WorkspaceDocument, text?: string) {
  const { guide, guideCoverage, messages, outline, outlineSource, ...meta } = document;
  if (text !== undefined) {
    await put(textPath(document.id), text, {
      access: "private",
      allowOverwrite: true,
      contentType: "text/plain; charset=utf-8",
    });
  }
  if (guide !== undefined || guideCoverage !== undefined || messages !== undefined || outline !== undefined) {
    await put(statePath(document.id), JSON.stringify({ guide, guideCoverage, messages, outline, outlineSource }), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
  }
  await put(metaPath(document.id), JSON.stringify(meta), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readProgressRecord(id: string): Promise<{ offset: number; updatedAt: string | null } | null> {
  if (!validDocumentId(id)) return null;
  const raw = await readText(progressPath(id));
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
  const raw = await readText(marksPath(id));
  return raw ? JSON.parse(raw) as WorkspaceMark[] : [];
}

export async function writeMarks(id: string, marks: WorkspaceMark[]) {
  await put(marksPath(id), JSON.stringify(marks), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export async function writeProgress(id: string, offset: number) {
  await put(progressPath(id), JSON.stringify({ offset, updatedAt: new Date().toISOString() }), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listDocuments(): Promise<WorkspaceLibraryItem[]> {
  const blobs: { pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "workspace/docs/", limit: 100, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const documents = await Promise.all(blobs.map(async (blob) => {
    const id = blob.pathname.slice("workspace/docs/".length).replace(/\.json$/, "");
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
  await del([metaPath(document.id), statePath(document.id), progressPath(document.id), marksPath(document.id), textPath(document.id), coverPath(document.id), document.filePath]);
}

/** Best-effort removal of everything an interrupted upload may have left behind. */
export async function discardUpload(id: string, filePath: string) {
  try {
    await del([filePath, textPath(id), statePath(id), progressPath(id), marksPath(id), metaPath(id)]);
  } catch {
    // Nothing more can be done here; the original error is what the caller reports.
  }
}

export async function readOriginalFile(document: WorkspaceDocument) {
  return get(document.filePath, { access: "private", useCache: false });
}
