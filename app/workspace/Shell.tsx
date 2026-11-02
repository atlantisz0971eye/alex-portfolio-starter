"use client";

import { BookOpen, Calendar as CalendarIcon, Layers, LogOut, Mail as MailIcon, Moon, Sparkles, ScrollText, Sun, Users, Waypoints } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SyncButton } from "./SyncStatus";

export type Theme = "light" | "dark";
export type Skin = "graphic" | "paper" | "byte";
/** The order the toggle walks through. */
export const SKINS: Skin[] = ["graphic", "paper", "byte"];
const SKIN_NAME: Record<Skin, string> = { graphic: "graphic look", paper: "paper look", byte: "byte look" };
export const ThemeContext = createContext<{ theme: Theme; toggle: () => void; skin: Skin; toggleSkin: () => void }>({ theme: "light", toggle: () => undefined, skin: "graphic", toggleSkin: () => undefined });

/** Graphic realism (glass, grain, signal colour), the quieter paper look, or the type-only byte look. */
export function SkinToggle({ className = "" }: { className?: string }) {
  const { skin, toggleSkin } = useContext(ThemeContext);
  const next = SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length];
  return <button type="button" className={className} onClick={toggleSkin} aria-label={`Switch to the ${SKIN_NAME[next]}`}><Layers size={15} />{className.includes("sidebar-theme") ? ` ${SKIN_NAME[next].replace(/^./, (c) => c.toUpperCase())}` : ""}</button>;
}

/** Paper by day, charcoal by night. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useContext(ThemeContext);
  return <button type="button" className={className} onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}{className.includes("sidebar-theme") ? (theme === "dark" ? " Light mode" : " Dark mode") : ""}</button>;
}

/** Who is signed in, as the browser may know it. */
export type PublicUser = { id: string; name: string; role: "owner" | "member"; features: { mail: boolean; github: boolean; today: boolean }; root: string };
export const UserContext = createContext<{ user: PublicUser | null; openMembers: () => void }>({ user: null, openMembers: () => undefined });

export type Tab = "today" | "library" | "mail" | "calendar" | "mindstreams" | "devlog";

const ITEMS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "library", label: "Library", icon: BookOpen },
  { id: "mail", label: "Mail", icon: MailIcon },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "mindstreams", label: "Mindstreams", icon: Waypoints },
  { id: "devlog", label: "Devlog", icon: ScrollText },
];

/** Desktop navigation. On phones the same destinations live in the bottom tab bar. */
/** The destinations this person may use: a member without mail does not see the Mail tab. */
function useItems() {
  const { user } = useContext(UserContext);
  return ITEMS.filter((item) => item.id !== "mail" || !user || user.features.mail);
}

export function Sidebar({ tab, onTab, onSignOut, onAssistant, badges = {} }: { tab: Tab; onTab: (tab: Tab) => void; onSignOut: () => void; onAssistant: () => void; badges?: Partial<Record<Tab, boolean>> }) {
  const { user, openMembers } = useContext(UserContext);
  const items = useItems();
  // Only the byte look uses this: the navigation folds into one word in the corner and opens as a page of huge words.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const go = (next: Tab) => { setOpen(false); onTab(next); };
  return <aside className="sidebar" aria-label="Workspace" data-open={open || undefined}>
    <div className="sidebar__brand"><span>{user?.name ?? "Alex"}</span> Workspace</div>
    <button type="button" className="sidebar__index" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "close" : "index"}</button>
    <nav className="sidebar__nav">
      {items.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-on" : ""} onClick={() => go(id)}><Icon size={18} /> {label}{badges[id] && <b className="badge-dot" aria-label="New" />}</button>)}
    </nav>
    <button type="button" className="sidebar__assistant" onClick={() => { setOpen(false); onAssistant(); }}><Sparkles size={16} /> Assistant <kbd>⌘K</kbd></button>
    <div className="sidebar__foot">
      <a href="/">Portfolio</a>
      <ThemeToggle className="sidebar-theme" />
      <SkinToggle className="sidebar-theme" />
      {user?.role === "owner" && <button type="button" onClick={openMembers}><Users size={15} /> Members</button>}
      {user?.role === "owner" && <SyncButton />}
      <button type="button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
    </div>
  </aside>;
}

export function TabBar({ tab, onTab, onAssistant, badges = {} }: { tab: Tab; onTab: (tab: Tab) => void; onAssistant: () => void; badges?: Partial<Record<Tab, boolean>> }) {
  const items = useItems();
  return <nav className="tabbar" aria-label="Workspace">
    {items.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-on" : ""} onClick={() => onTab(id)}><Icon size={22} /><span>{label}</span>{badges[id] && <b className="badge-dot" aria-label="New" />}</button>)}
    <button type="button" onClick={onAssistant}><Sparkles size={22} /><span>Assistant</span></button>
  </nav>;
}

/** Phone-only row with the links the sidebar carries on desktop. */
export function TopRow({ onSignOut }: { onSignOut: () => void }) {
  const { user, openMembers } = useContext(UserContext);
  return <div className="toprow">
    <a href="/" className="ws-text-button">Portfolio</a>
    <ThemeToggle className="ws-text-button" />
    <SkinToggle className="ws-text-button" />
    {user?.role === "owner" && <button type="button" className="ws-text-button" onClick={openMembers}><Users size={15} /> Members</button>}
    {user?.role === "owner" && <SyncButton className="ws-text-button" />}
    <button type="button" className="ws-text-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
  </div>;
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div className="pagetitle"><h1>{children}</h1>{actions && <div className="pagetitle__actions">{actions}</div>}</div>;
}
