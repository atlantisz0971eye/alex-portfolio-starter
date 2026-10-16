import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

export type DevProject = {
  id: string;
  name: string;
  color: string;
  description: string;
  status: "active" | "paused" | "done";
  /** "owner/name" on GitHub, when the project has commits to read. */
  repo?: string;
  /** Only commits touching these paths count, so one repository can hold several projects. */
  paths?: string[];
  createdAt: string;
  lastSync?: string;
};

export type DevEntry = {
  id: string;
  projectId: string;
  kind: "note" | "commits" | "stream" | "review";
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  title: string;
  body: string;
  images?: string[];
  commits?: { sha: string; message: string; url: string }[];
  /** For a pinned mindstream: the page it points to. */
  noteId?: string;
  createdAt: string;
  updatedAt: string;
};

export class DevlogError extends Error {}

const PROJECTS = "workspace/devlog/projects.json";
const ENTRIES = "workspace/devlog/entries.json";
const assetPath = (name: string) => `workspace/devlog/assets/${name}`;
const MAX_PROJECTS = 40;
const MAX_ENTRIES = 3000;
const COLORS = ["#4a6fb8", "#4f8a5b", "#b9822e", "#8a5aa8", "#b4382c", "#2f8f9d"];

export const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);
export const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
export const validAsset = (name: string) => /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name);

async function readJson<T>(path: string, fallback: T): Promise<T> {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return fallback;
  return JSON.parse(await new Response(result.stream).text()) as T;
}
const writeJson = (path: string, value: unknown) => put(path, JSON.stringify(value), { access: "private", allowOverwrite: true, contentType: "application/json" });

export const readProjects = () => readJson<DevProject[]>(PROJECTS, []);
export const readEntries = () => readJson<DevEntry[]>(ENTRIES, []);

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function cleanRepo(value: unknown) {
  const repo = text(value, 100).replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : undefined;
}
const cleanPaths = (value: unknown) => (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []).map((item) => text(item, 120).replace(/^\/+|\/+$/g, "")).filter(Boolean).slice(0, 4);

export async function saveProject(input: Record<string, unknown>) {
  const projects = await readProjects();
  const existing = validId(input.id) ? projects.find((item) => item.id === input.id) : undefined;
  const name = text(input.name, 80);
  if (!name) throw new DevlogError("Give the project a name.");
  const status: DevProject["status"] = input.status === "paused" || input.status === "done" ? input.status : "active";
  const fields = { name, description: text(input.description, 400), status, color: /^#[0-9a-f]{6}$/i.test(String(input.color)) ? String(input.color) : existing?.color ?? COLORS[projects.length % COLORS.length], repo: cleanRepo(input.repo), paths: cleanPaths(input.paths) };
  if (existing) {
    Object.assign(existing, fields);
    if (!fields.repo) { delete existing.repo; delete existing.lastSync; }
    if (!fields.paths.length) delete existing.paths;
    await writeJson(PROJECTS, projects);
    return existing;
  }
  if (projects.length >= MAX_PROJECTS) throw new DevlogError("There are too many projects.");
  const project: DevProject = { id: randomUUID(), createdAt: new Date().toISOString(), ...fields, ...(fields.paths.length ? {} : { paths: undefined }) };
  if (!project.paths) delete project.paths;
  if (!project.repo) delete project.repo;
  await writeJson(PROJECTS, [...projects, project]);
  return project;
}

export async function deleteProject(id: string) {
  const projects = await readProjects();
  if (!projects.some((item) => item.id === id)) return false;
  await writeJson(PROJECTS, projects.filter((item) => item.id !== id));
  await writeJson(ENTRIES, (await readEntries()).filter((entry) => entry.projectId !== id));
  return true;
}

export async function setLastSync(id: string, when: string) {
  const projects = await readProjects();
  const project = projects.find((item) => item.id === id);
  if (project) { project.lastSync = when; await writeJson(PROJECTS, projects); }
}

export async function saveEntry(input: Record<string, unknown>) {
  const [projects, entries] = await Promise.all([readProjects(), readEntries()]);
  if (!validId(input.projectId) || !projects.some((item) => item.id === input.projectId)) throw new DevlogError("Choose a project.");
  if (!validDate(input.date)) throw new DevlogError("Choose a date.");
  const kind = (["note", "commits", "stream", "review"] as const).find((item) => item === input.kind) ?? "note";
  const title = text(input.title, 160);
  const body = typeof input.body === "string" ? input.body.slice(0, 20_000) : "";
  if (!title && !body.trim()) throw new DevlogError("Write a title or some text.");
  const images = Array.isArray(input.images) ? input.images.filter((name): name is string => typeof name === "string" && validAsset(name)).slice(0, 6) : [];
  const now = new Date().toISOString();
  const existing = validId(input.id) ? entries.find((item) => item.id === input.id) : undefined;
  const fields = { projectId: input.projectId, kind, date: input.date, title, body, images, ...(validId(input.noteId) ? { noteId: input.noteId } : {}) };
  if (existing) { Object.assign(existing, fields, { updatedAt: now }); await writeJson(ENTRIES, entries); return existing; }
  if (entries.length >= MAX_ENTRIES) throw new DevlogError("There are too many entries.");
  const entry: DevEntry = { id: randomUUID(), createdAt: now, updatedAt: now, ...fields };
  await writeJson(ENTRIES, [...entries, entry]);
  return entry;
}

export async function deleteEntry(id: string) {
  const entries = await readEntries();
  if (!entries.some((item) => item.id === id)) return false;
  await writeJson(ENTRIES, entries.filter((item) => item.id !== id));
  return true;
}

/** Replaces the commit entries for the given days of a project, leaving everything the reader wrote untouched. */
export async function replaceCommitEntries(projectId: string, fresh: Omit<DevEntry, "id" | "createdAt" | "updatedAt" | "projectId" | "kind">[]) {
  const entries = await readEntries();
  const days = new Set(fresh.map((entry) => entry.date));
  const kept = entries.filter((entry) => !(entry.projectId === projectId && entry.kind === "commits" && days.has(entry.date)));
  const now = new Date().toISOString();
  await writeJson(ENTRIES, [...kept, ...fresh.map((entry): DevEntry => ({ id: randomUUID(), projectId, kind: "commits", createdAt: now, updatedAt: now, ...entry }))].slice(-MAX_ENTRIES));
}

export async function saveAsset(bytes: Uint8Array, type: "image/jpeg" | "image/png" | "image/webp") {
  const name = `${randomUUID()}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`;
  await put(assetPath(name), Buffer.from(bytes), { access: "private", contentType: type });
  return name;
}
export const readAsset = (name: string) => get(assetPath(name), { access: "private", useCache: false });
