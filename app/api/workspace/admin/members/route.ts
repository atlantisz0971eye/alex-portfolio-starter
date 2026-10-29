import { del, list } from "@vercel/blob";
import { readUsage } from "../../../../lib/aiQuota";
import { workspaceUser } from "../../../../lib/workspaceAuth";
import { memberRoot, rootOf } from "../../../../lib/workspaceScope";
import { workspaceStorageConfigured } from "../../../../lib/workspaceStore";
import { createMember, listMembers, MEMBER_ID, removeMember, updateMember } from "../../../../lib/workspaceUsers";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Managing people is the owner's alone; a member's session is refused here even though it is signed in. */
async function guard() {
  const user = await workspaceUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return Response.json({ error: "forbidden" }, { status: 403 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  return null;
}

const noStore = { "Cache-Control": "private, no-store" };

/** Files and bytes a member keeps in storage. */
async function footprint(prefix: string) {
  let files = 0;
  let bytes = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) { files += 1; bytes += blob.size; }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return { files, bytes };
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const members = await Promise.all((await listMembers()).map(async (member) => ({
      ...member,
      aiToday: (await readUsage(member.id)).ai,
      ...(await footprint(rootOf(member)).catch(() => ({ files: 0, bytes: 0 }))),
    })));
    return Response.json({ members }, { headers: noStore });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { name?: unknown; features?: unknown; limits?: unknown } | null;
  if (!body || typeof body.name !== "string" || !body.name.trim()) return Response.json({ error: "invalid_request" }, { status: 400 });
  const features = body.features as { mail?: unknown; today?: unknown } | undefined;
  const limits = body.limits as { aiPerDay?: unknown; documents?: unknown } | undefined;
  try {
    const { user, key } = await createMember({
      name: body.name,
      features: { ...(typeof features?.mail === "boolean" ? { mail: features.mail } : {}), ...(typeof features?.today === "boolean" ? { today: features.today } : {}) } as never,
      limits: { ...(typeof limits?.aiPerDay === "number" ? { aiPerDay: limits.aiPerDay } : {}), ...(typeof limits?.documents === "number" ? { documents: limits.documents } : {}) },
    });
    // The key appears in this one response and is stored only as a hash.
    return Response.json({ member: user, key }, { status: 201, headers: noStore });
  } catch (error) {
    return Response.json({ error: "invalid_request", message: error instanceof Error ? error.message : undefined }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await request.json().catch(() => null) as ({ id?: unknown } & Record<string, unknown>) | null;
  if (!body || typeof body.id !== "string" || !MEMBER_ID.test(body.id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const result = await updateMember(body.id, body as Parameters<typeof updateMember>[1]);
    return result ? Response.json({ member: result.user, key: result.key }, { headers: noStore }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}

/** Removes a member. With `purge=1` everything they stored goes too; without it their files stay for later. */
export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!MEMBER_ID.test(id)) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const found = await removeMember(id);
    if (!found) return Response.json({ error: "not_found" }, { status: 404 });
    let removed = 0;
    if (url.searchParams.get("purge") === "1") {
      const prefix = memberRoot(id);
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, limit: 500, cursor });
        if (page.blobs.length) await del(page.blobs.map((blob) => blob.url));
        removed += page.blobs.length;
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      await del(`system/usage/${id}.json`).catch(() => undefined);
    }
    return Response.json({ ok: true, removed });
  } catch {
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
