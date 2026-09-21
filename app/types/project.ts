export type Language = "en" | "zh";

export type ThemeId = "tian" | "ren" | "di";

export type MediaGroup = { label: string; items: string[] };

export type MediaGroups = {
  images?: MediaGroup[];
  videos?: MediaGroup[];
  audios?: MediaGroup[];
};

export type MediaKind = "images" | "video" | "audio" | "doc";

export type MediaItem = {
  type: "image" | "video" | "audio" | "embed";
  role: "hero" | "experience" | "doc" | "system" | "concept" | "process";
  src: string;
  thumb?: string;
  title?: string;
  description?: string;
};

export type Project = {
  slug: string;
  title: string;
  status: "completed" | "in-progress" | "planning";
  summary: string;
  tags: string[];
  bg?: { src: string; position?: string; fit?: "cover" | "contain"; disabled?: boolean };
  media?: { images?: string[]; videos?: string[]; audios?: string[] } | MediaItem[];
  mediaItems?: MediaItem[];
  mediaGroups?: MediaGroups;
  mediaIndex?: string;
  updates?: { date: string; text: string }[];
  updatesTxt?: string;
  docTxt?: string;
  overviewTxt?: string;
  docPdf?: string;
  briefTxt?: string;
};

export type Theme = {
  id: ThemeId;
  title: string;
  color: string;
  intro: string;
  projects: Project[];
  reading: string[];
};

export type SiteContent = { themes: Theme[] };

export type LocalizedContent = Record<Language, SiteContent>;

export type SearchResult = {
  kind: "theme" | "project" | "tag" | "gallery" | "bio" | "education";
  title: string;
  subtitle?: string;
  slug?: string;
  themeId?: string;
  score: number;
};
