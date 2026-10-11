import { CONTENT } from "../data/content";
import { GALLERY_CONTENT } from "../data/gallery";
import { getOrbitCategories } from "../data/orbit";
import type { Language, SearchResult } from "../types/project";

type BioEntry = {
  kind: "bio" | "education";
  title: string;
  subtitle: string;
  slug: string;
  terms: string;
};

const BIO_INDEX: Record<Language, BioEntry[]> = {
  en: [
    { kind: "bio", title: "Alex Zhao", subtitle: "Artist Statement", slug: "statement", terms: "composer photographer digital artist technology rumination connection artistic practice" },
    { kind: "bio", title: "Entanglement", subtitle: "Fourier synthesis · works and references", slug: "entanglement", terms: "Fourier 傅立叶 傅里叶 波形 谐波 旋转 waveform sound narrative my work others outside" },
    { kind: "education", title: "MFA Digital Media Arts", subtitle: "Xi’an Jiaotong-Liverpool University", slug: "education", terms: "XJTLU school university" },
    { kind: "education", title: "MA Information Experience Design", subtitle: "Royal College of Art", slug: "education", terms: "RCA school university" },
    { kind: "bio", title: "Internships", subtitle: "Graphic design, AI localization and data collection", slug: "timeline", terms: "experience work" },
    { kind: "bio", title: "Contact", subtitle: "Email, Instagram and YouTube", slug: "contact", terms: "social links" },
  ],
  zh: [
    { kind: "bio", title: "Alex Zhao", subtitle: "艺术家陈述", slug: "statement", terms: "编曲人 摄影师 数字艺术家 科技 反刍 连接 创作" },
    { kind: "bio", title: "Entanglement", subtitle: "傅立叶合成 · 作品与参照", slug: "entanglement", terms: "Fourier 傅里叶 傅立叶 波形 谐波 旋转 声音 叙事 我的作品 他人的作品 工作之外" },
    { kind: "education", title: "数字媒体艺术 MFA", subtitle: "西交利物浦大学", slug: "education", terms: "XJTLU 学校 大学" },
    { kind: "education", title: "信息体验设计 MA", subtitle: "英国皇家艺术学院", slug: "education", terms: "RCA 学校 大学" },
    { kind: "bio", title: "实习经历", subtitle: "平面设计、人工智能本土化与数据收集", slug: "timeline", terms: "工作 经验" },
    { kind: "bio", title: "联系", subtitle: "邮箱、Instagram 与 YouTube", slug: "contact", terms: "社交 链接" },
  ],
};

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function matchesTerm(text: string, term: string) {
  if (/^[a-z0-9]{1,2}$/.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${term}($|[^a-z0-9])`).test(text);
  }
  return text.includes(term);
}

function matchScore(query: string, terms: string[], titles: string[], details: string[]) {
  const titleText = normalize(titles.join(" "));
  const allText = normalize([...titles, ...details].join(" "));
  if (!terms.every((term) => matchesTerm(allText, term))) return 0;
  const exactTitle = titles.some((title) => normalize(title) === query);
  const startsTitle = titles.some((title) => normalize(title).startsWith(query));
  const allInTitle = terms.every((term) => matchesTerm(titleText, term));
  return exactTitle ? 120 : startsTitle ? 90 : allInTitle ? 65 : 25;
}

export function searchSite(query: string, lang: Language): SearchResult[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const terms = normalized.split(/\s+/).filter(Boolean);
  const otherLang: Language = lang === "en" ? "zh" : "en";
  const themes = CONTENT[lang].themes;
  const otherThemes = CONTENT[otherLang].themes;
  const gallery = GALLERY_CONTENT[lang];
  const otherGallery = GALLERY_CONTENT[otherLang];
  const orbit = getOrbitCategories(lang);
  const otherOrbit = getOrbitCategories(otherLang);
  const ownWorks = orbit.find((category) => category.id === "mine")!.works;
  const otherOwnWorks = otherOrbit.find((category) => category.id === "mine")!.works;
  const results: SearchResult[] = [];

  const add = (result: Omit<SearchResult, "score">, titles: string[], details: string[], priority = 0) => {
    const score = matchScore(normalized, terms, titles, details);
    if (score) results.push({ ...result, score: score + priority });
  };

  themes.forEach((theme) => {
    const alternate = otherThemes.find((item) => item.id === theme.id) ?? theme;
    add(
      { kind: "theme", title: theme.title, subtitle: lang === "en" ? "Theme" : "主题", themeId: theme.id },
      [theme.title, alternate.title],
      [theme.intro, alternate.intro, ...theme.reading, ...alternate.reading],
    );

    theme.projects.forEach((project) => {
      const alternateProject = alternate.projects.find((item) => item.slug === project.slug) ?? project;
      const own = ownWorks.find((work) => work.id === project.slug);
      const otherOwn = otherOwnWorks.find((work) => work.id === project.slug);
      add(
        { kind: "project", title: project.title, subtitle: theme.title, slug: project.slug, themeId: theme.id },
        [project.title, alternateProject.title],
        [project.summary, alternateProject.summary, ...project.tags, ...alternateProject.tags,
          ...(project.mediaItems?.map((item) => item.title ?? "") ?? []),
          ...(alternateProject.mediaItems?.map((item) => item.title ?? "") ?? []),
          ...(own?.keywords ?? []), ...(otherOwn?.keywords ?? [])],
        6,
      );
    });
  });

  add(
    { kind: "gallery", title: gallery.title, subtitle: gallery.eyebrow, themeId: "gallery" },
    [gallery.title, otherGallery.title, gallery.eyebrow, otherGallery.eyebrow],
    [gallery.intro, otherGallery.intro],
  );
  gallery.items.forEach((item) => {
    const alternate = otherGallery.items.find((entry) => entry.slug === item.slug) ?? item;
    const own = ownWorks.find((work) => work.href === `/?focus=gallery-${item.slug}`);
    const otherOwn = otherOwnWorks.find((work) => work.href === `/?focus=gallery-${item.slug}`);
    add(
      { kind: "gallery", title: item.title, subtitle: item.subtitle, slug: item.slug, themeId: "gallery" },
      [item.title, alternate.title],
      [item.subtitle, alternate.subtitle, item.description, alternate.description, item.eyebrow, alternate.eyebrow,
        ...item.tags, ...alternate.tags, ...(own?.keywords ?? []), ...(otherOwn?.keywords ?? [])],
      5,
    );
  });

  BIO_INDEX[lang].forEach((entry, index) => {
    const alternate = BIO_INDEX[otherLang][index];
    add(
      { kind: entry.kind, title: entry.title, subtitle: entry.subtitle, slug: entry.slug, themeId: "bio" },
      [entry.title, alternate.title],
      [entry.subtitle, alternate.subtitle, entry.terms, alternate.terms],
      2,
    );
  });

  orbit.forEach((category) => {
    if (category.id === "mine") return;
    const alternate = otherOrbit.find((item) => item.id === category.id) ?? category;
    category.works.forEach((work, point) => {
      const otherWork = alternate.works[point] ?? work;
      add(
        { kind: "orbit", title: work.title, subtitle: `${category.shortLabel}${work.creator ? ` · ${work.creator}` : ""}`, themeId: "bio", slug: "entanglement", orbitCategory: category.id, orbitPoint: point },
        [work.title, otherWork.title],
        [work.creator ?? "", otherWork.creator ?? "", work.note, otherWork.note,
          ...work.keywords, ...otherWork.keywords, category.label, alternate.label, category.shortLabel, alternate.shortLabel],
        3,
      );
    });
  });

  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 14);
}
