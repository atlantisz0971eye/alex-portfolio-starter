import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

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

export function verifyAccessKey(value: string) {
  const config = secrets();
  return !!config && equal(value, config.accessKey);
}

function signature(expiresAt: string, secret: string) {
  return createHmac("sha256", secret).update(`alex-workspace:${expiresAt}`).digest("base64url");
}

export function createWorkspaceSession() {
  const config = secrets();
  if (!config) throw new Error("Workspace access is not configured");
  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_AGE_SECONDS);
  return `${expiresAt}.${signature(expiresAt, config.sessionSecret)}`;
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

export async function workspaceAuthorized() {
  const config = secrets();
  const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (!config || !value) return false;
  const [expiresAt, provided, extra] = value.split(".");
  if (extra || !expiresAt || !provided || !/^\d+$/.test(expiresAt)) return false;
  const expiry = Number(expiresAt);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + SESSION_AGE_SECONDS) return false;
  return equal(provided, signature(expiresAt, config.sessionSecret));
}
