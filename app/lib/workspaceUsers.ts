import { get, put } from "@vercel/blob";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * People who can open the Workspace. The owner is whoever holds WORKSPACE_ACCESS_KEY and keeps the original,
 * un-prefixed data. Everyone else is a member created from the admin page: they get a key, their own folder in
 * storage and their own mail, notes, boards and library.
 */
export type WorkspaceUser = {
  /** "owner", or "u" followed by hex for a member. Never contains a dot. */
  id: string;
  name: string;
  role: "owner" | "member";
  /** What this person may connect. The owner's GitHub token and sync are never available to members. */
  features: { mail: boolean; github: boolean; today: boolean };
  /** Shared AI keys are paid for by the owner, so members are capped. */
  limits: { aiPerDay: number; documents: number };
  /** Raised to sign the person out of every device at once. */
  version: number;
  disabled?: boolean;
  createdAt: string;
};
type StoredUser = WorkspaceUser & { keyHash: string; keyHint: string };
export type UserSummary = WorkspaceUser & { keyHint: string };

const REGISTRY = "system/users.json";
const CACHE_MS = 15_000;
const MEMBER_DEFAULTS = { features: { mail: true, github: false, today: false }, limits: { aiPerDay: 300, documents: 30 } };
export const MEMBER_ID = /^u[0-9a-f]{10}$/;

export const ownerUser = (): WorkspaceUser => ({
  id: "owner",
  name: process.env.WORKSPACE_OWNER_NAME?.trim() || "Alex",
  role: "owner",
  features: { mail: true, github: true, today: true },
  limits: { aiPerDay: Number.POSITIVE_INFINITY, documents: Number.POSITIVE_INFINITY },
  version: 1,
  createdAt: "",
});

let cache: { at: number; users: StoredUser[] } | null = null;

async function readRegistry(fresh = false): Promise<StoredUser[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.users;
  const result = await get(REGISTRY, { access: "private", useCache: false });
  const users = result && result.statusCode === 200 ? (JSON.parse(await new Response(result.stream).text()) as { users: StoredUser[] }).users : [];
  cache = { at: Date.now(), users };
  return users;
}

async function writeRegistry(users: StoredUser[]) {
  await put(REGISTRY, JSON.stringify({ users }), { access: "private", allowOverwrite: true, contentType: "application/json" });
  cache = { at: Date.now(), users };
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
const strip = ({ keyHash: _hash, ...user }: StoredUser): UserSummary => user;
const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();

function newKey() {
  return `wk_${randomBytes(24).toString("base64url")}`;
}

/** The member who holds this key, if any. Keys are long random strings, so a plain hash is enough to store. */
export async function findMemberByKey(key: string): Promise<WorkspaceUser | null> {
  const given = Buffer.from(hashKey(clean(key)));
  for (const user of await readRegistry()) {
    const stored = Buffer.from(user.keyHash);
    if (stored.length === given.length && timingSafeEqual(new Uint8Array(stored), new Uint8Array(given)) && !user.disabled) return strip(user);
  }
  return null;
}

export async function findMember(id: string): Promise<WorkspaceUser | null> {
  if (!MEMBER_ID.test(id)) return null;
  const found = (await readRegistry()).find((user) => user.id === id);
  return found ? strip(found) : null;
}

export async function listMembers(): Promise<UserSummary[]> {
  return (await readRegistry(true)).map(strip).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Creates a member and returns their key, which is shown once and never stored in the clear. */
export async function createMember(input: { name: string; features?: Partial<WorkspaceUser["features"]>; limits?: Partial<WorkspaceUser["limits"]> }) {
  const users = await readRegistry(true);
  if (users.length >= 50) throw new Error("There are too many members.");
  const key = newKey();
  const user: StoredUser = {
    id: `u${randomBytes(5).toString("hex")}`,
    name: input.name.trim().slice(0, 60) || "Friend",
    role: "member",
    features: { ...MEMBER_DEFAULTS.features, ...input.features, github: false },
    limits: { ...MEMBER_DEFAULTS.limits, ...input.limits },
    version: 1,
    createdAt: new Date().toISOString(),
    keyHash: hashKey(key),
    keyHint: key.slice(-4),
  };
  await writeRegistry([...users, user]);
  return { user: strip(user), key };
}

export async function updateMember(id: string, patch: { name?: unknown; disabled?: unknown; features?: unknown; limits?: unknown; rotateKey?: unknown; signOut?: unknown }) {
  const users = await readRegistry(true);
  const user = users.find((item) => item.id === id);
  if (!user) return null;
  let key: string | undefined;
  if (typeof patch.name === "string" && patch.name.trim()) user.name = patch.name.trim().slice(0, 60);
  if (typeof patch.disabled === "boolean") { user.disabled = patch.disabled || undefined; if (patch.disabled) user.version += 1; }
  if (patch.features && typeof patch.features === "object") {
    const next = patch.features as Record<string, unknown>;
    for (const name of ["mail", "today"] as const) if (typeof next[name] === "boolean") user.features[name] = next[name] as boolean;
  }
  if (patch.limits && typeof patch.limits === "object") {
    const next = patch.limits as Record<string, unknown>;
    for (const name of ["aiPerDay", "documents"] as const) if (typeof next[name] === "number" && Number.isFinite(next[name]) && next[name] >= 0) user.limits[name] = Math.min(100_000, Math.floor(next[name] as number));
  }
  if (patch.rotateKey === true) { key = newKey(); user.keyHash = hashKey(key); user.keyHint = key.slice(-4); user.version += 1; }
  if (patch.signOut === true) user.version += 1;
  await writeRegistry(users);
  return { user: strip(user), key };
}

export async function removeMember(id: string) {
  const users = await readRegistry(true);
  if (!users.some((user) => user.id === id)) return false;
  await writeRegistry(users.filter((user) => user.id !== id));
  return true;
}
