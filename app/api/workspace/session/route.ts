import { NextResponse } from "next/server";
import {
  createWorkspaceSession,
  verifyAccessKey,
  WORKSPACE_COOKIE,
  workspaceAuthConfigured,
  workspaceCookieOptions,
} from "../../../lib/workspaceAuth";

export const runtime = "nodejs";

const failures = new Map<string, { count: number; until: number }>();

export async function POST(request: Request) {
  if (!workspaceAuthConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  const state = failures.get(ip);
  if (state && state.count >= 5 && state.until > now) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let body: { accessKey?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 512) throw new Error("too large");
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof body.accessKey !== "string" || body.accessKey.length > 256 || !verifyAccessKey(body.accessKey)) {
    failures.set(ip, { count: (state?.until && state.until > now ? state.count : 0) + 1, until: now + 15 * 60_000 });
    return NextResponse.json({ error: "invalid_access_key" }, { status: 401 });
  }
  failures.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(WORKSPACE_COOKIE, createWorkspaceSession(), workspaceCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(WORKSPACE_COOKIE, "", { ...workspaceCookieOptions(), maxAge: 0 });
  return response;
}
