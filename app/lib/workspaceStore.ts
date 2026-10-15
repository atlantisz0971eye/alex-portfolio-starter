import { del, get, list, put } from "@vercel/blob";

export type WorkspaceDocument = {
  id: string;
  name: string;
  mimeType: string;
  filePath: string;
  textPath: string;
  createdAt: string;
  pageCount: number | null;
  characterCount: number;
  guide?: string;
  guideCoverage?: "full" | "excerpts";
  messages?: { role: "user" | "assistant"; content: string }[];
};

const metaPath = (id: string) => `workspace/docs/${id}.json`;
const textPath = (id: string) => `workspace/text/${id}.txt`;

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

export async function readDocument(id: string): Promise<WorkspaceDocument | null> {
  if (!validDocumentId(id)) return null;
  const raw = await readText(metaPath(id));
  if (!raw) return null;
  const value = JSON.parse(raw) as WorkspaceDocument;
  return value.id === id ? value : null;
}

export async function readDocumentText(id: string) {
  if (!validDocumentId(id)) return null;
  return readText(textPath(id));
}

export async function writeDocument(document: WorkspaceDocument, text?: string) {
  if (text !== undefined) {
    await put(textPath(document.id), text, {
      access: "private",
      allowOverwrite: true,
      contentType: "text/plain; charset=utf-8",
    });
  }
  await put(metaPath(document.id), JSON.stringify(document), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listDocuments() {
  const blobs: { pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "workspace/docs/", limit: 100, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const documents = await Promise.all(blobs.map(async (blob) => {
    const id = blob.pathname.slice("workspace/docs/".length).replace(/\.json$/, "");
    try { return await readDocument(id); } catch { return null; }
  }));
  return documents.filter((item): item is WorkspaceDocument => !!item)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDocument(document: WorkspaceDocument) {
  await del([metaPath(document.id), textPath(document.id), document.filePath]);
}

export async function readOriginalFile(document: WorkspaceDocument) {
  return get(document.filePath, { access: "private", useCache: false });
}
