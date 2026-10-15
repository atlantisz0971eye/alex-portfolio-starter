import { del, get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { jsonToText, markdownToDoc, type JSONNode } from "./notesText";

export type NoteMeta = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  favorite?: boolean;
  /** Marks pages the app manages itself, such as the vocabulary page. */
  kind?: "vocabulary";
  preview: string;
};
type IndexEntry = NoteMeta & { text: string };

const INDEX = "workspace/notes/index.json";
const pagePath = (id: string) => `workspace/notes/pages/${id}.json`;
const MAX_CONTENT = 900_000;
const MAX_NOTES = 3000;
export const EMPTY_DOC: JSONNode = { type: "doc", content: [{ type: "paragraph" }] };

export class NoteError extends Error {}

const strip = ({ text: _text, ...meta }: IndexEntry): NoteMeta => meta;

async function readText(path: string) {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).text();
}

async function readIndex(): Promise<IndexEntry[]> {
  const raw = await readText(INDEX);
  return raw ? (JSON.parse(raw) as { notes: IndexEntry[] }).notes : [];
}

async function writeIndex(notes: IndexEntry[]) {
  await put(INDEX, JSON.stringify({ notes }), { access: "private", allowOverwrite: true, contentType: "application/json" });
}

export const validNoteId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

function describe(content: JSONNode) {
  const text = jsonToText(content).replace(/\s+/g, " ").trim();
  return { preview: text.slice(0, 140), text: text.slice(0, 4000) };
}

function checkContent(content: unknown): JSONNode {
  if (!content || typeof content !== "object" || (content as JSONNode).type !== "doc") throw new NoteError("The note content is not valid.");
  if (JSON.stringify(content).length > MAX_CONTENT) throw new NoteError("This note is too large.");
  return content as JSONNode;
}

export async function listNotes() {
  return (await readIndex()).map(strip);
}

export async function readNote(id: string): Promise<{ note: NoteMeta; content: JSONNode } | null> {
  if (!validNoteId(id)) return null;
  const entry = (await readIndex()).find((item) => item.id === id);
  if (!entry) return null;
  const raw = await readText(pagePath(id));
  return { note: strip(entry), content: raw ? JSON.parse(raw) as JSONNode : EMPTY_DOC };
}

const descendants = (notes: IndexEntry[], id: string) => {
  const found = new Set<string>();
  const walk = (parent: string) => notes.filter((item) => item.parentId === parent).forEach((child) => { found.add(child.id); walk(child.id); });
  walk(id);
  return found;
};

export async function createNote(input: { parentId?: string | null; title?: string; icon?: string; content?: unknown; kind?: "vocabulary" }) {
  const notes = await readIndex();
  if (notes.length >= MAX_NOTES) throw new NoteError("There are too many notes.");
  const parentId = input.parentId && notes.some((item) => item.id === input.parentId && !item.deletedAt) ? input.parentId : null;
  const content = input.content === undefined ? EMPTY_DOC : checkContent(input.content);
  const now = new Date().toISOString();
  const siblings = notes.filter((item) => item.parentId === parentId && !item.deletedAt);
  const entry: IndexEntry = {
    id: randomUUID(), parentId, title: (input.title ?? "").slice(0, 200), icon: (input.icon ?? "").slice(0, 8),
    order: siblings.length ? Math.max(...siblings.map((item) => item.order)) + 1 : 0,
    createdAt: now, updatedAt: now, ...describe(content),
    ...(input.kind ? { kind: input.kind } : {}),
  };
  await put(pagePath(entry.id), JSON.stringify(content), { access: "private", allowOverwrite: true, contentType: "application/json" });
  await writeIndex([...notes, entry]);
  return strip(entry);
}

export type NotePatch = { title?: unknown; icon?: unknown; parentId?: unknown; order?: unknown; favorite?: unknown; content?: unknown };

export async function updateNote(id: string, patch: NotePatch) {
  const notes = await readIndex();
  const index = notes.findIndex((item) => item.id === id);
  if (index === -1) throw new NoteError("That note no longer exists.");
  let entry = { ...notes[index] };
  if (typeof patch.title === "string") entry.title = patch.title.slice(0, 200);
  if (typeof patch.icon === "string") entry.icon = patch.icon.slice(0, 8);
  if (typeof patch.favorite === "boolean") entry.favorite = patch.favorite || undefined;
  if (typeof patch.order === "number" && Number.isFinite(patch.order)) entry.order = patch.order;
  if (patch.parentId !== undefined) {
    const parentId = patch.parentId === null ? null : String(patch.parentId);
    // A note cannot move into itself or one of its own subpages.
    if (parentId !== null && (parentId === id || descendants(notes, id).has(parentId) || !notes.some((item) => item.id === parentId))) throw new NoteError("A note cannot be moved there.");
    entry.parentId = parentId;
  }
  if (patch.content !== undefined) {
    const content = checkContent(patch.content);
    entry = { ...entry, ...describe(content) };
    await put(pagePath(id), JSON.stringify(content), { access: "private", allowOverwrite: true, contentType: "application/json" });
  }
  entry.updatedAt = new Date().toISOString();
  notes[index] = entry;
  await writeIndex(notes);
  return strip(entry);
}

/** Moves a note and its subpages to the trash, or restores them. */
export async function setTrashed(id: string, trashed: boolean) {
  const notes = await readIndex();
  const ids = new Set([id, ...descendants(notes, id)]);
  if (!notes.some((item) => item.id === id)) throw new NoteError("That note no longer exists.");
  const now = new Date().toISOString();
  await writeIndex(notes.map((item) => {
    if (!ids.has(item.id)) return item;
    const next = { ...item };
    if (trashed) next.deletedAt = now; else delete next.deletedAt;
    return next;
  }));
  // Restoring a subpage whose parent is still in the trash puts it at the top level.
  if (!trashed) {
    const fresh = await readIndex();
    const entry = fresh.find((item) => item.id === id);
    if (entry?.parentId && fresh.find((item) => item.id === entry.parentId)?.deletedAt) await updateNote(id, { parentId: null });
  }
}

export async function deleteForever(id: string) {
  const notes = await readIndex();
  const ids = new Set([id, ...descendants(notes, id)]);
  if (!notes.some((item) => item.id === id)) throw new NoteError("That note no longer exists.");
  await writeIndex(notes.filter((item) => !ids.has(item.id)));
  await del([...ids].map(pagePath)).catch(() => undefined);
}

export async function duplicateNote(id: string) {
  const found = await readNote(id);
  if (!found) throw new NoteError("That note no longer exists.");
  return createNote({ parentId: found.note.parentId, title: `${found.note.title || "Untitled"} (copy)`, icon: found.note.icon, content: found.content });
}

/** Adds Markdown to the end of a note (used when the assistant's proposal is confirmed). */
export async function appendToNote(id: string, markdown: string) {
  const found = await readNote(id);
  if (!found) throw new NoteError("That note no longer exists.");
  const added = markdownToDoc(markdown.slice(0, 20_000)).content ?? [];
  const existing = found.content.content ?? [];
  // An untouched empty first paragraph would only leave a blank line above the new text.
  const base = existing.length === 1 && existing[0].type === "paragraph" && !existing[0].content?.length ? [] : existing;
  return updateNote(id, { content: { type: "doc", content: [...base, ...added] } });
}

/** True when a saved entry for the word already exists (entries start with the word in bold). */
function hasEntry(text: string, word: string) {
  const target = word.toLowerCase();
  return text.split("\n").some((line) => {
    const lower = line.trim().toLowerCase();
    return lower.startsWith(target) && !/[a-z]/.test(lower.charAt(target.length));
  });
}

/** Adds a word to the Vocabulary page, creating the page on first use. Returns false when the word is already there. */
export async function addVocabularyEntry(word: string, markdown: string) {
  const notes = await readIndex();
  let page = notes.find((item) => item.kind === "vocabulary" && !item.deletedAt);
  let id = page?.id;
  if (!id) {
    const created = await createNote({ title: "Vocabulary", icon: "📖", kind: "vocabulary", content: markdownToDoc("> Words you save while reading appear here, newest last.") });
    id = created.id;
  }
  const found = await readNote(id);
  if (found && hasEntry(jsonToText(found.content), word)) return { id, duplicate: true };
  await appendToNote(id, `---\n${markdown}`);
  return { id, duplicate: false };
}

export async function searchNotes(query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!terms.length) return [];
  return (await readIndex()).filter((item) => !item.deletedAt).map((item) => {
    const title = item.title.toLowerCase();
    const body = item.text.toLowerCase();
    if (!terms.every((term) => title.includes(term) || body.includes(term))) return null;
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0), 0);
    const at = body.indexOf(terms[0]);
    return { meta: strip(item), score, snippet: at === -1 ? item.preview : item.text.slice(Math.max(0, at - 50), at + 110).replace(/\s+/g, " ") };
  }).filter((item): item is NonNullable<typeof item> => !!item).sort((a, b) => b.score - a.score).slice(0, 20);
}
