import { AsyncLocalStorage } from "node:async_hooks";
import { workspaceUser } from "./workspaceAuth";
import type { WorkspaceUser } from "./workspaceUsers";

/**
 * Whose data a piece of code is touching. Inside a request it is the person behind the session cookie; code that runs
 * without a cookie (a scheduled job, a background task after the response) must say so with `runAs`. There is no
 * default: with neither, storage is refused rather than guessed.
 */
export class ScopeError extends Error {
  constructor() { super("No signed-in user for this request."); }
}

const running = new AsyncLocalStorage<WorkspaceUser>();

export const runAs = <T>(user: WorkspaceUser, work: () => Promise<T>) => running.run(user, work);

export async function currentUser(): Promise<WorkspaceUser> {
  const set = running.getStore();
  if (set) return set;
  const user = await workspaceUser();
  if (!user) throw new ScopeError();
  return user;
}

/** The owner keeps the original folder so nothing had to move; everyone else gets a folder of their own. */
export const memberRoot = (id: string) => `workspace/users/${id}/`;
export const rootOf = (user: WorkspaceUser) => (user.role === "owner" ? "workspace/" : memberRoot(user.id));

/** Storage prefix for the current person, always ending in a slash. */
export async function scopeRoot() {
  return rootOf(await currentUser());
}

/** What the browser may know about the signed-in person. */
export const publicUser = (user: WorkspaceUser) => ({ id: user.id, name: user.name, role: user.role, features: user.features, root: rootOf(user) });
