import type { Language } from "../types/project";

export function SiteFooter({ lang }: { lang: Language }) {
  return (
    <footer className="py-8 border-t border-white/10 bg-black">
      <div className="container mx-auto max-w-screen-xl px-6 text-sm text-white/80 flex flex-col items-center justify-center gap-2 text-center">
        <div>© {new Date().getFullYear()} Alex — {lang === "en" ? "Portfolio" : "作品集"}</div>
        <div className="opacity-80">
          {lang === "en"
            ? "Architecture: Technology · Rumination · Connection · Gallery ｜ Tech Stack: Next.js + Tailwind"
            : "架构：科技·反刍·连接·作品画廊 ｜ 技术栈：Next.js + Tailwind"}
        </div>
      </div>
    </footer>
  );
}
