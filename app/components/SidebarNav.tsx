"use client";

import { useEffect, useState } from "react";
import { glassButtonClass } from "../lib/ui";

type SidebarNavItem = {
  id: "tian" | "ren" | "di" | "gallery" | "bio";
  label: string;
  icon: string;
};

const NAV_ITEMS: SidebarNavItem[] = [
  { id: "tian", label: "☁ Technology", icon: "☁" },
  { id: "ren", label: "👤 Rumination", icon: "◉" },
  { id: "di", label: "🌍 Connection", icon: "◎" },
  { id: "gallery", label: "✦ Gallery", icon: "✦" },
  { id: "bio", label: "Bio", icon: "A" },
];

export type SidebarNavProps = {
  lang: "en" | "zh";
};

const LABEL_MAP: Record<SidebarNavItem["id"], { en: string; zh: string }> = {
  tian: { en: "☁ Technology", zh: "☁ 科技" },
  ren: { en: "👤 Rumination", zh: "👤 反刍" },
  di: { en: "🌍 Connection", zh: "🌍 连接" },
  gallery: { en: "✦ Gallery", zh: "✦ 作品画廊" },
  bio: { en: "Bio", zh: "简介" },
};

const MOBILE_LABEL_MAP: Record<SidebarNavItem["id"], { en: string; zh: string }> = {
  tian: { en: "Tech", zh: "科技" },
  ren: { en: "Mind", zh: "反刍" },
  di: { en: "Connect", zh: "连接" },
  gallery: { en: "Gallery", zh: "画廊" },
  bio: { en: "Bio", zh: "简介" },
};

export default function SidebarNav({ lang }: SidebarNavProps) {
  const [activeId, setActiveId] = useState<SidebarNavItem["id"]>("tian");

  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (section): section is HTMLElement => Boolean(section)
    );
    let frame = 0;
    const updateActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const marker = window.scrollY + window.innerHeight * 0.36;
        let current = sections[0]?.id as SidebarNavItem["id"] | undefined;
        sections.forEach((section) => {
          if (section.offsetTop <= marker) current = section.id as SidebarNavItem["id"];
        });
        if (current) setActiveId(current);
      });
    };
    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  return (
    <>
      <aside className="hidden md:flex fixed top-20 left-4 z-[180] flex-col gap-2 text-white">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={() => setActiveId(item.id)}
            className={`inline-flex items-center ${glassButtonClass} ${activeId === item.id ? "bg-white/15" : ""}`}
          >
            {LABEL_MAP[item.id][lang]}
          </a>
        ))}
      </aside>

      <nav className="mobile-nav md:hidden" aria-label={lang === "en" ? "Main sections" : "主要章节"}>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={() => setActiveId(item.id)}
            className={`mobile-nav__item ${activeId === item.id ? "is-active" : ""}`}
            aria-current={activeId === item.id ? "location" : undefined}
          >
            <span className="mobile-nav__icon" aria-hidden>{item.icon}</span>
            <span>{MOBILE_LABEL_MAP[item.id][lang]}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
