"use client";

import { BookOpen, Calendar as CalendarIcon, GitBranch, LogOut, Mail as MailIcon, Moon, PenLine, Sparkles, Sun, SunMoon, Users, Waypoints } from "lucide-react";
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { SyncButton } from "./SyncStatus";

export type Theme = "light" | "dark";
export type ThemeMode = Theme | "auto";
export const ThemeContext = createContext<{ theme: Theme; mode: ThemeMode; toggle: () => void; reportAuto: (theme: Theme) => void }>({ theme: "light", mode: "auto", toggle: () => undefined, reportAuto: () => undefined });

/** Auto (Carcosa's sky decides), then light, then dark. The button names what a click switches to. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, toggle } = useContext(ThemeContext);
  const next = mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
  const label = { light: "Light mode", dark: "Dark mode", auto: "Auto (Carcosa)" }[next];
  const Icon = next === "light" ? Sun : next === "dark" ? Moon : SunMoon;
  return <button type="button" className={className} onClick={toggle} aria-label={`Switch to ${label}`} title={`Now: ${mode}`}><Icon size={15} />{className.includes("sidebar-theme") ? ` ${label}` : ""}</button>;
}

/** Who is signed in, as the browser may know it. */
export type PublicUser = { id: string; name: string; role: "owner" | "member"; features: { mail: boolean; github: boolean; today: boolean }; root: string };
export const UserContext = createContext<{ user: PublicUser | null; openMembers: () => void }>({ user: null, openMembers: () => undefined });

/**
 * The destinations, grouped by what is done there rather than by the feature each grew out of. Nothing sits more than
 * one level below a destination: Projects holds the three views of development, Carcosa the three about the person.
 */
export type Tab = "today" | "notebook" | "projects" | "library" | "mail" | "calendar" | "carcosa";
export type ProjectsSub = "status" | "devlog" | "alignment";
export type CarcosaSub = "pet" | "self" | "fieldnotes";
export type Route = { tab: Tab; projects: ProjectsSub; carcosa: CarcosaSub };

export const PROJECTS_SECTIONS: { id: ProjectsSub; label: string; owner?: boolean }[] = [{ id: "status", label: "Status" }, { id: "devlog", label: "Devlog" }, { id: "alignment", label: "Alignment", owner: true }];
export const CARCOSA_SECTIONS: { id: CarcosaSub; label: string }[] = [{ id: "pet", label: "Yak" }, { id: "self", label: "Self" }, { id: "fieldnotes", label: "Fieldnotes" }];

const ITEMS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "notebook", label: "Notebook", icon: PenLine },
  { id: "projects", label: "Projects", icon: GitBranch },
  { id: "library", label: "Library", icon: BookOpen },
  { id: "mail", label: "Mail", icon: MailIcon },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "carcosa", label: "Carcosa", icon: Waypoints },
];

/** The address of a place, kept in the URL so a reload, the back button and a bookmark all land where they should. */
export const hashOf = (route: Route) => `#${route.tab}${route.tab === "projects" ? `/${route.projects}` : route.tab === "carcosa" ? `/${route.carcosa}` : ""}`;
export function readRoute(base: Route, hash: string): Route | null {
  const [tab, sub] = hash.replace(/^#/, "").split("/");
  if (!ITEMS.some((item) => item.id === tab)) return null;
  const next: Route = { ...base, tab: tab as Tab };
  if (tab === "projects" && PROJECTS_SECTIONS.some((s) => s.id === sub)) next.projects = sub as ProjectsSub;
  if (tab === "carcosa" && CARCOSA_SECTIONS.some((s) => s.id === sub)) next.carcosa = sub as CarcosaSub;
  return next;
}

/** Desktop navigation. On phones the same destinations live in the bottom tab bar. */
/** The destinations this person may use: a member without mail does not see the Mail tab. */
function useItems() {
  const { user } = useContext(UserContext);
  return ITEMS.filter((item) => item.id !== "mail" || !user || user.features.mail);
}

export function Sidebar({ tab, onTab, onSignOut, onAssistant, badges = {} }: { tab: Tab; onTab: (tab: Tab) => void; onSignOut: () => void; onAssistant: () => void; badges?: Partial<Record<Tab, boolean>> }) {
  const { user, openMembers } = useContext(UserContext);
  const items = useItems();
  // Only the byte look uses this: on a wide screen the destinations stay in the corner strip as words; the index opens
  // them as a page of huge words, with the assistant and the account links, and is the only way in on a narrow one.
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
    {/* Opening Members or the sync closes the index, so the pop-up is not left over a page of huge words. Switching light and dark leaves it open. */}
    <div className="sidebar__foot" onClick={(event) => { const target = event.target as HTMLElement; if (target.closest("button,a") && !target.closest(".sidebar-theme")) setOpen(false); }}>
      <a href="/">Portfolio</a>
      <ThemeToggle className="sidebar-theme" />
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
    {user?.role === "owner" && <button type="button" className="ws-text-button" onClick={openMembers}><Users size={15} /> Members</button>}
    {user?.role === "owner" && <SyncButton className="ws-text-button" />}
    <button type="button" className="ws-text-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
  </div>;
}

export function PageTitle({ children, actions, quiet = false }: { children: ReactNode; actions?: ReactNode; quiet?: boolean }) {
  // inside a page with sections (Projects, Carcosa) a section keeps its buttons but not its own giant title
  if (quiet) return actions ? <div className="pagetitle pagetitle--quiet"><div className="pagetitle__actions">{actions}</div></div> : null;
  // The byte look sizes a title by its length so every word fills the width; other looks ignore this.
  const text = typeof children === "string" ? children : "";
  const wide = /[\u2e80-\u9fff\uff00-\uffef]/.test(text);
  const chars = text ? ({ "--chars": [...text].reduce((sum, ch) => sum + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1), 0) } as CSSProperties) : undefined;
  return <div className="pagetitle"><h1 style={chars} data-wide={wide || undefined}>{children}</h1>{actions && <div className="pagetitle__actions">{actions}</div>}</div>;
}

/** The head of a page that has sections: its title, then the sections as a row of words. */
export function SectionHead<T extends string>({ title, sections, sub, onSub }: { title: string; sections: { id: T; label: string }[]; sub: T; onSub: (sub: T) => void }) {
  return <header className="carcosa-head">
    <PageTitle>{title}</PageTitle>
    <nav className="carcosa-tabs" aria-label={title}>
      {sections.map((s) => <button key={s.id} type="button" aria-pressed={sub === s.id} className={sub === s.id ? "is-on" : ""} onClick={() => onSub(s.id)}>{s.label}</button>)}
    </nav>
  </header>;
}
