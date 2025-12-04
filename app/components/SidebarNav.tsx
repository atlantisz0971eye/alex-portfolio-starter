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
    <aside className="sidebar-glass hidden md:flex top-20 left-4">
      {NAV_ITEMS.map((item) => (
        <a key={item.id} href={`#${item.id}`}>
          <button className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 backdrop-blur hover:bg-white/10 transition-all duration-200 shadow-sm hover:shadow scale-100 hover:scale-105">
            {LABEL_MAP[item.id][lang]}
          </button>
        </a>
      ))}
    </aside>
  );
}
