"use client";

import { useEffect, useState } from "react";

type NavId = "tian" | "ren" | "di" | "gallery" | "bio";
type SidebarNavItem = { id: NavId; icon: string };

const NAV_ITEMS: SidebarNavItem[] = [
  { id: "tian", icon: "●" },
  { id: "ren", icon: "●" },
  { id: "di", icon: "●" },
  { id: "gallery", icon: "●" },
  { id: "bio", icon: "A" },
];

const DESKTOP_ITEMS = NAV_ITEMS.filter((item) => item.id !== "bio");

const LABELS: Record<NavId, { en: string; zh: string }> = {
  tian: { en: "Technology", zh: "科技" },
  ren: { en: "Rumination", zh: "反刍" },
  di: { en: "Connection", zh: "连接" },
  gallery: { en: "Gallery", zh: "作品画廊" },
  bio: { en: "Bio", zh: "简介" },
};

export type SidebarNavProps = { lang: "en" | "zh" };

export default function SidebarNav({ lang }: SidebarNavProps) {
  const [activeId, setActiveId] = useState<NavId>("tian");
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (section): section is HTMLElement => Boolean(section)
    );
    let frame = 0;
    const updateActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const marker = window.scrollY + window.innerHeight * 0.36;
        let current = sections[0]?.id as NavId | undefined;
        sections.forEach((section) => {
          if (section.offsetTop <= marker) current = section.id as NavId;
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
      <aside className="attention-nav hidden md:flex" aria-label={lang === "en" ? "Main sections" : "主要章节"}>
        {DESKTOP_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={() => setActiveId(item.id)}
            className={`attention-nav__item ${activeId === item.id ? "is-active" : ""}`}
            aria-label={LABELS[item.id][lang]}
            aria-current={activeId === item.id ? "location" : undefined}
          >
            <span className="attention-nav__dot" aria-hidden />
            <span className="attention-nav__label">{LABELS[item.id][lang]}</span>
          </a>
        ))}
      </aside>

      <nav
        className={`mobile-nav md:hidden ${mobileExpanded ? "is-expanded" : "is-collapsed"}`}
        aria-label={lang === "en" ? "Main sections" : "主要章节"}
      >
        <button
          type="button"
          className="mobile-nav__trigger"
          aria-expanded={mobileExpanded}
          aria-label={mobileExpanded ? (lang === "en" ? "Collapse navigation" : "收起导航") : (lang === "en" ? "Expand navigation" : "展开导航")}
          onClick={() => setMobileExpanded((current) => !current)}
        >
          <span className="mobile-nav__trigger-dot" aria-hidden />
          <span>{LABELS[activeId][lang]}</span>
          <span className="mobile-nav__trigger-mark" aria-hidden>{mobileExpanded ? "−" : "+"}</span>
        </button>

        <div className="mobile-nav__items" aria-hidden={!mobileExpanded}>
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => {
                setActiveId(item.id);
                setMobileExpanded(false);
              }}
              className={`mobile-nav__item ${activeId === item.id ? "is-active" : ""}`}
              aria-current={activeId === item.id ? "location" : undefined}
              tabIndex={mobileExpanded ? 0 : -1}
            >
              <span className="mobile-nav__icon" aria-hidden>{item.icon}</span>
              <span>{LABELS[item.id][lang]}</span>
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}
