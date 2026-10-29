import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { workspaceUser } from "../../../lib/workspaceAuth";
import { rootOf, runAs } from "../../../lib/workspaceScope";
import { listDocuments, workspaceStorageConfigured } from "../../../lib/workspaceStore";

export const runtime = "nodejs";

const allowedTypes = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "application/octet-stream",
];

export async function POST(request: Request) {
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  let body: HandleUploadBody;
  try {
    body = await request.json() as HandleUploadBody;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const user = await workspaceUser();
  if (body.type === "blob.generate-client-token" && !user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        // Uploads go into the signed-in person's own folder, nowhere else.
        const root = (user ? rootOf(user) : "workspace/").replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
        if (!user || !new RegExp(`^${root}files\\/[0-9a-f-]{36}\\/[a-zA-Z0-9._-]+\\.(pdf|txt|md|html?)$`, "i").test(pathname)) {
          throw new Error("Unsupported upload path");
        }
        if (user.role === "member" && (await runAs(user, () => listDocuments())).length >= user.limits.documents) {
          throw new Error("Library is full");
        }
        return { allowedContentTypes: allowedTypes, maximumSizeInBytes: 25 * 1024 * 1024 };
      },
    });
    return Response.json(result);
  } catch {
    return Response.json({ error: "upload_failed" }, { status: 400 });
  }
}
