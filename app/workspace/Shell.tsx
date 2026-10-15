"use client";

import { BookOpen, LogOut, Mail as MailIcon } from "lucide-react";
import type { ReactNode } from "react";

export type Tab = "library" | "mail";

const ITEMS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "library", label: "Library", icon: BookOpen },
  { id: "mail", label: "Mail", icon: MailIcon },
];

/** Desktop navigation. On phones the same destinations live in the bottom tab bar. */
export function Sidebar({ tab, onTab, onSignOut }: { tab: Tab; onTab: (tab: Tab) => void; onSignOut: () => void }) {
  return <aside className="sidebar" aria-label="Workspace">
    <div className="sidebar__brand"><span>Alex</span> Workspace</div>
    <nav className="sidebar__nav">
      {ITEMS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-on" : ""} onClick={() => onTab(id)}><Icon size={18} /> {label}</button>)}
    </nav>
    <div className="sidebar__foot">
      <a href="/">Portfolio</a>
      <button type="button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
    </div>
  </aside>;
}

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return <nav className="tabbar" aria-label="Workspace">
    {ITEMS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-on" : ""} onClick={() => onTab(id)}><Icon size={22} /><span>{label}</span></button>)}
  </nav>;
}

/** Phone-only row with the links the sidebar carries on desktop. */
export function TopRow({ onSignOut }: { onSignOut: () => void }) {
  return <div className="toprow">
    <a href="/" className="ws-text-button">Portfolio</a>
    <button type="button" className="ws-text-button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
  </div>;
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return <div className="pagetitle"><h1>{children}</h1>{actions && <div className="pagetitle__actions">{actions}</div>}</div>;
}
