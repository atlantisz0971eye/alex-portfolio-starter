import { workspaceAuthConfigured, workspaceAuthorized } from "../lib/workspaceAuth";
import WorkspaceClient from "./WorkspaceClient";
import "./workspace.css";
import "./graphic.css";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  return <WorkspaceClient authorized={await workspaceAuthorized()} configured={workspaceAuthConfigured()} />;
}
