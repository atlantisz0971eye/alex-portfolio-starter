"use client";

import { BookOpen, Calendar as CalendarIcon, LogOut, Mail as MailIcon, Moon, NotebookPen, Sparkles, Sun, Waypoints } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

export type Theme = "light" | "dark";
export const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => undefined });

/** Paper by day, charcoal by night. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useContext(ThemeContext);
  return <button type="button" className={className} onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}{className.includes("sidebar-theme") ? (theme === "dark" ? " Light mode" : " Dark mode") : ""}</button>;
}

export type Tab = "today" | "library" | "mail" | "calendar" | "mindstreams" | "notes";

const ITEMS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "library", label: "Library", icon: BookOpen },
  { id: "mail", label: "Mail", icon: MailIcon },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "mindstreams", label: "Mindstreams", icon: Waypoints },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

/** Desktop navigation. On phones the same destinations live in the bottom tab bar. */
export function Sidebar({ tab, onTab, onSignOut, onAssistant, badges = {} }: { tab: Tab; onTab: (tab: Tab) => void; onSignOut: () => void; onAssistant: () => void; badges?: Partial<Record<Tab, boolean>> }) {
  return <aside className="sidebar" aria-label="Workspace">
    <div className="sidebar__brand"><span>Alex</span> Workspace</div>
    <nav className="sidebar__nav">
      {ITEMS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-on" : ""} onClick={() => onTab(id)}><Icon size={18} /> {label}{badges[id] && <b className="badge-dot" aria-label="New" />}</button>)}
    </nav>
    <button type="button" className="sidebar__assistant" onClick={onAssistant}><Sparkles size={16} /> Assistant <kbd>⌘K</kbd></button>
    <div className="sidebar__foot">
      <a href="/">Portfolio</a>
      <ThemeToggle className="sidebar-theme" />
      <button type="button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
    </div>
  </aside>;
}

export function TabBar({ tab, onTab, onAssistant, badges = {} }: { tab: Tab; onTab: (tab: Tab) => void; onAssistant: () => void; badges?: Partial<Record<Tab, boolean>> }) {
  return <nav className="tabbar" aria-label="Workspace">
    {ITEMS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-on" : ""} onClick={() => onTab(id)}><Icon size={22} /><span>{label}</span>{badges[id] && <b className="badge-dot" aria-label="New" />}</button>)}
    <button type="button" onClick={onAssistant}><Sparkles size={22} /><span>Assistant</span></button>
  </nav>;
}

/** Phone-only row with the links the sidebar carries on desktop. */
export function TopRow({ onSignOut }: { onSignOut: () => void }) {
  return <div className="toprow">
    <a href="/" className="ws-text-button">Portfolio</a>
    <ThemeToggle className="ws-text-button" />
    <button type="button" className="ws-text-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
  </div>;
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div className="pagetitle"><h1>{children}</h1>{actions && <div className="pagetitle__actions">{actions}</div>}</div>;
}
