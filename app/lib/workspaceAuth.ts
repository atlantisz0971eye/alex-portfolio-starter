import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findMember, findMemberByKey, ownerUser, type WorkspaceUser } from "./workspaceUsers";

export const WORKSPACE_COOKIE = "alex_workspace_session";
const SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;

function secrets() {
  const accessKey = process.env.WORKSPACE_ACCESS_KEY;
  const sessionSecret = process.env.WORKSPACE_SESSION_SECRET;
  return accessKey && accessKey.length >= 20 && sessionSecret && sessionSecret.length >= 32
    ? { accessKey, sessionSecret }
    : null;
}

export function workspaceAuthConfigured() {
  return secrets() !== null;
}

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}

/** Who holds this key: the owner (the key in the environment) or a member created on the admin page. */
export async function identifyAccessKey(value: string): Promise<WorkspaceUser | null> {
  const config = secrets();
  if (!config) return null;
  if (equal(value, config.accessKey)) return ownerUser();
  return findMemberByKey(value);
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(`alex-workspace:${payload}`).digest("base64url");

/** `userId.version.expires.signature`: the signature covers who the session is for and which sign-out generation it belongs to. */
export function createWorkspaceSession(user: WorkspaceUser) {
  const config = secrets();
  if (!config) throw new Error("Workspace access is not configured");
  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_AGE_SECONDS);
  const payload = `${user.id}.${user.version}.${expiresAt}`;
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

export function workspaceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_AGE_SECONDS,
  };
}

/**
 * The person behind this request's session cookie, or null. A member must still exist, be enabled and not have been
 * signed out since the cookie was made. Sessions issued before members existed (`expires.signature`) belong to the owner.
 */
export async function workspaceUser(): Promise<WorkspaceUser | null> {
  const config = secrets();
  const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (!config || !value) return null;
  const parts = value.split(".");
  const now = Math.floor(Date.now() / 1000);
  const live = (expiresAt: string) => /^\d+$/.test(expiresAt) && Number(expiresAt) > now && Number(expiresAt) <= now + SESSION_AGE_SECONDS;

  if (parts.length === 2) {
    const [expiresAt, provided] = parts;
    return live(expiresAt) && equal(provided, sign(expiresAt, config.sessionSecret)) ? ownerUser() : null;
  }
  if (parts.length !== 4) return null;
  const [id, version, expiresAt, provided] = parts;
  if (!live(expiresAt) || !/^\d+$/.test(version) || !equal(provided, sign(`${id}.${version}.${expiresAt}`, config.sessionSecret))) return null;
  if (id === "owner") return ownerUser();
  const member = await findMember(id);
  return member && !member.disabled && member.version === Number(version) ? member : null;
}

export async function workspaceAuthorized() {
  return (await workspaceUser()) !== null;
}

/** Signs a short-lived value (such as an OAuth state) with the session secret. */
export function workspaceSign(value: string) {
  const config = secrets();
  if (!config) throw new Error("Workspace access is not configured");
  return createHmac("sha256", config.sessionSecret).update(`alex-workspace-sign:${value}`).digest("base64url");
}

export function workspaceSignatureMatches(value: string, provided: string) {
  return equal(workspaceSign(value), provided);
}
