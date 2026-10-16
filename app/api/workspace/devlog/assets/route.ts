import { calendarGuard } from "../../../../lib/calendarGuard";
import { saveAsset } from "../../../../lib/devlogStore";

export const runtime = "nodejs";
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** One image as the raw request body (the client shrinks photos first). */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  const type = TYPES.find((item) => item === request.headers.get("content-type"));
  if (!type) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 4_000_000) return Response.json({ error: "file_too_large" }, { status: 413 });
    return Response.json({ name: await saveAsset(bytes, type) }, { status: 201 });
  } catch {
    return Response.json({ error: "devlog_failed" }, { status: 502 });
  }
}
