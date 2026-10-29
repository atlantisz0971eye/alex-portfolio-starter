import { workspaceAuthConfigured, workspaceUser } from "../lib/workspaceAuth";
import { publicUser } from "../lib/workspaceScope";
import WorkspaceClient from "./WorkspaceClient";
import "./workspace.css";
import "./graphic.css";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await workspaceUser();
  return <WorkspaceClient authorized={!!user} user={user ? publicUser(user) : null} configured={workspaceAuthConfigured()} />;
}
