import { Archivo, JetBrains_Mono } from "next/font/google";
import { workspaceAuthConfigured, workspaceUser } from "../lib/workspaceAuth";
import { publicUser } from "../lib/workspaceScope";
import WorkspaceClient from "./WorkspaceClient";
import "./workspace.css";
import "./byte.css";

export const dynamic = "force-dynamic";

// The byte look sets titles in Archivo and everything else in JetBrains Mono. Both are served from this site and, with
// preload off, are fetched only when a page that uses them is shown, so the other looks pay nothing.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-byte-mono", display: "swap", preload: false });
const display = Archivo({ subsets: ["latin"], variable: "--font-byte-display", display: "swap", preload: false });

export default async function WorkspacePage() {
  const user = await workspaceUser();
  return <div className={`${mono.variable} ${display.variable}`}><WorkspaceClient authorized={!!user} user={user ? publicUser(user) : null} configured={workspaceAuthConfigured()} /></div>;
}
