import { workspaceAuthorized } from "./workspaceAuth";
import { workspaceStorageConfigured } from "./workspaceStore";

export async function calendarGuard(): Promise<Response | null> {
  if (!(await workspaceAuthorized())) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!workspaceStorageConfigured()) return Response.json({ error: "storage_not_configured" }, { status: 503 });
  return null;
}
