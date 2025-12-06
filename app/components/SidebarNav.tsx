import { glassButtonClass } from "../lib/ui";

type SidebarNavItem = {
  id: "tian" | "ren" | "di" | "bio";
  label: string;
};

const NAV_ITEMS: SidebarNavItem[] = [
  { id: "tian", label: "☁ Technology" },
  { id: "ren", label: "👤 Rumination" },
  { id: "di", label: "🌍 Connection" },
  { id: "bio", label: "Bio" },
];

export type SidebarNavProps = {
  lang: "en" | "zh";
};

const LABEL_MAP: Record<SidebarNavItem["id"], { en: string; zh: string }> = {
  tian: { en: "☁ Technology", zh: "☁ 科技" },
  ren: { en: "👤 Rumination", zh: "👤 反刍" },
  di: { en: "🌍 Connection", zh: "🌍 连接" },
  bio: { en: "Bio", zh: "简介" },
};

export default function SidebarNav({ lang }: SidebarNavProps) {
  return (
    <aside className="hidden md:flex fixed top-20 left-4 z-[180] flex-col gap-2 text-white">
      {NAV_ITEMS.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`inline-flex items-center ${glassButtonClass}`}
        >
          {LABEL_MAP[item.id][lang]}
        </a>
      ))}
    </aside>
  );
}
