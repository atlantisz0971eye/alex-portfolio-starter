export type MediaGroup = { label: string; items: string[] };

export type MediaGroups = {
  images?: MediaGroup[];
  videos?: MediaGroup[];
  audios?: MediaGroup[];
};

export type MediaKind = "images" | "video" | "audio" | "doc";

export type MediaItem = {
  type: "image" | "video" | "audio";
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
  updates?: { date: string; text: string }[];
  updatesTxt?: string;
  docTxt?: string;
  overviewTxt?: string;
  docPdf?: string;
};

export type Theme = {
  id: "tian" | "ren" | "di";
  title: string;
  color: string;
  intro: string;
  projects: Project[];
  reading: string[];
};

export type SearchResult = {
  kind: "theme" | "project" | "tag" | "update";
  title: string;
  subtitle?: string;
  slug?: string;
  themeId?: string;
  score: number;
};
