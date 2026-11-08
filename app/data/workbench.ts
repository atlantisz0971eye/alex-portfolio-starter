import type { Language } from "../types/project";

/**
 * Projects on the bench: each one carries a small architecture diagram, laid out by hand on a grid so the
 * thumbnails stay calm. Node labels are technical and stay in English in both languages.
 */

export type WorkbenchNodeKind = "actor" | "app" | "store" | "external";
export type WorkbenchNode = { id: string; label: string; sub?: string; kind: WorkbenchNodeKind; col: number; row: number };
export type WorkbenchEdge = { from: string; to: string; dashed?: boolean };
export type WorkbenchDiagram = { nodes: WorkbenchNode[]; edges: WorkbenchEdge[] };

type WorkbenchCopy = { status: string; summary: string };
/** "bench": in development now. "studio": finished works from the RCA application portfolio, drawn from its system pages. */
export type WorkbenchGroup = "bench" | "studio";
export type WorkbenchProject = {
  slug: string;
  index: string;
  title: string;
  group: WorkbenchGroup;
  /** Where the code lives, or what the work is, shown in small type. */
  repo: string;
  href?: string;
  /** Whether the outside link is a site to visit or a video to watch. */
  hrefKind?: "visit" | "watch";
  /** The slug of the matching project card in the themes above, for works that have one. */
  workSlug?: string;
  stack: string[];
  copy: Record<Language, WorkbenchCopy>;
  diagram: WorkbenchDiagram;
};

type WorkbenchContent = {
  kicker: string;
  title: string;
  intro: string;
  asOf: string;
  groups: Record<WorkbenchGroup, { title: string; note: string }>;
  legend: Record<WorkbenchNodeKind, string>;
  open: string;
  close: string;
  visit: string;
  watch: string;
  seeWork: string;
};

/** The day these diagrams were drawn from the code and the devlog. */
export const WORKBENCH_AS_OF = "2026-11-08";

export const WORKBENCH_CONTENT: Record<Language, WorkbenchContent> = {
  en: {
    kicker: "On the bench",
    title: "Workbench",
    intro: "The skeletons of the work: what is being built now, and how the earlier pieces were wired. Open a line to see its architecture.",
    asOf: "Drawn on",
    groups: {
      bench: { title: "In development", note: "drawn from the code" },
      studio: { title: "Studio works · 2025", note: "drawn from the RCA application portfolio" },
    },
    legend: { actor: "Person / input", app: "Code", store: "Data", external: "Outside service" },
    open: "Open diagram",
    close: "Close diagram",
    visit: "Visit",
    watch: "Watch",
    seeWork: "See the work",
  },
  zh: {
    kicker: "工作台上",
    title: "Workbench",
    intro: "作品的骨架：正在做的项目，以及之前的作品是怎么连起来的。点开一行，查看它的架构图。",
    asOf: "绘制于",
    groups: {
      bench: { title: "开发中", note: "依据代码绘制" },
      studio: { title: "工作室作品 · 2025", note: "依据 RCA 申请作品集绘制" },
    },
    legend: { actor: "人 / 输入", app: "代码", store: "数据", external: "外部服务" },
    open: "展开架构图",
    close: "收起架构图",
    visit: "访问",
    watch: "观看",
    seeWork: "查看作品",
  },
};

export const WORKBENCH_PROJECTS: WorkbenchProject[] = [
  {
    slug: "night-8looming-jasmine",
    group: "bench",
    index: "01",
    title: "Night, 8looming Jasmine",
    repo: "night-8looming-jasmine",
    href: "https://night-8looming-jasmine.vercel.app/web/",
    hrefKind: "visit",
    stack: ["MapLibre", "Vercel functions", "DeepSeek", "ElevenLabs", "React Three Fiber"],
    copy: {
      en: { status: "Running prototype", summary: "Yasmine walks the map naming the places she passes; a mind daemon learns from place facts, gets hungry and dreams, and Jasmine can only change her world." },
      zh: { status: "可运行原型", summary: "Yasmine 在地图上走，说出经过的地点；后台心智靠地点事实学习、会饿、会做梦，Jasmine 只能改变她的世界。" },
    },
    diagram: {
      nodes: [
        { id: "tiles", label: "OpenFreeMap", sub: "OSM vector tiles", kind: "external", col: 0, row: 0 },
        { id: "listener", label: "Listener", sub: "phone · GPS", kind: "actor", col: 0, row: 1 },
        { id: "phone", label: "Phone page", sub: "map · heat · guide", kind: "app", col: 1, row: 0 },
        { id: "stage", label: "Exhibition stage", sub: "body · camera", kind: "app", col: 1, row: 2 },
        { id: "narrate", label: "/api/narrate", sub: "one stream of speech", kind: "app", col: 2, row: 0 },
        { id: "knowledge", label: "/api/knowledge", sub: "facts · filter", kind: "app", col: 2, row: 1 },
        { id: "mind", label: "Mind daemon", sub: "hunger · affect · dream", kind: "app", col: 2, row: 2 },
        { id: "deepseek", label: "DeepSeek", sub: "narration", kind: "external", col: 3, row: 0 },
        { id: "wiki", label: "Wikipedia", sub: "Wikidata · place facts", kind: "external", col: 3, row: 1 },
        { id: "jasmine", label: "Jasmine", sub: "changes her world", kind: "actor", col: 3, row: 2 },
      ],
      edges: [
        { from: "tiles", to: "phone" },
        { from: "listener", to: "phone" },
        { from: "listener", to: "stage" },
        { from: "phone", to: "narrate" },
        { from: "narrate", to: "deepseek" },
        { from: "narrate", to: "knowledge" },
        { from: "knowledge", to: "wiki" },
        { from: "stage", to: "mind" },
        { from: "mind", to: "knowledge", dashed: true },
        { from: "jasmine", to: "mind" },
      ],
    },
  },
  {
    slug: "tryin",
    group: "bench",
    index: "02",
    title: "Tryin'",
    repo: "tryin",
    href: "https://tryin-pi.vercel.app/",
    stack: ["three.js", "Depth Anything V2", "WebGL shaders", "Device motion"],
    copy: {
      en: { status: "In development", summary: "A photo or short video becomes a particle space. Depth runs in the browser; for video, where you stand decides which moment each particle shows." },
      zh: { status: "开发中", summary: "照片或短视频变成粒子空间。深度估计在浏览器里完成；视频里，你站的位置决定每个粒子显示哪个时刻。" },
    },
    diagram: {
      nodes: [
        { id: "media", label: "Photo / video", sub: "stays in the page", kind: "actor", col: 0, row: 1 },
        { id: "depth", label: "Depth Anything V2", sub: "runs in the browser", kind: "app", col: 1, row: 0 },
        { id: "stab", label: "Stabilise frames", sub: "rotation alignment", kind: "app", col: 1, row: 2 },
        { id: "layers", label: "Photo · shadow · ash", sub: "three particle layers", kind: "app", col: 2, row: 0 },
        { id: "field", label: "Time field", sub: "relative simultaneity", kind: "app", col: 2, row: 2 },
        { id: "scene", label: "three.js space", sub: "particles · glow", kind: "app", col: 3, row: 1 },
        { id: "lab", label: "UniverseChop lab", sub: "2+1-D block universe", kind: "app", col: 3, row: 2 },
        { id: "walker", label: "Walker", sub: "steps · gyroscope", kind: "actor", col: 4, row: 1 },
      ],
      edges: [
        { from: "media", to: "depth" },
        { from: "media", to: "stab" },
        { from: "depth", to: "layers" },
        { from: "depth", to: "field", dashed: true },
        { from: "stab", to: "field" },
        { from: "layers", to: "scene" },
        { from: "field", to: "scene" },
        { from: "field", to: "lab" },
        { from: "walker", to: "scene" },
      ],
    },
  },
  {
    slug: "leaf-language-engine",
    group: "bench",
    index: "03",
    title: "Leaf Language Engine",
    repo: "leaf-language-engine",
    stack: ["Python", "Image analysis", "WordNet", "Docker · Railway"],
    copy: {
      en: { status: "Research tool", summary: "Measures leaf veins from scans, then writes text back onto a real leaf's structure as a reversible code that can be read out again and verified." },
      zh: { status: "研究工具", summary: "从叶片扫描中量化叶脉，再把文字以可逆编码写回真实叶片的结构上，并能重新读出、校验原文。" },
    },
    diagram: {
      nodes: [
        { id: "scans", label: "Leaf scans", sub: "transparent PNG / JPG", kind: "actor", col: 0, row: 0 },
        { id: "text", label: "English text", sub: "paragraphs · words", kind: "actor", col: 0, row: 2 },
        { id: "veins", label: "Vein extraction", sub: "skeleton · nodes", kind: "app", col: 1, row: 0 },
        { id: "lexicon", label: "Offline lexicon", sub: "WordNet · MorphyNet", kind: "store", col: 1, row: 1 },
        { id: "code", label: "5-bit code", sub: "morphemes · CRC-10", kind: "app", col: 1, row: 2 },
        { id: "surface", label: "Leaf surface map", sub: "edges · widths · path", kind: "app", col: 2, row: 0 },
        { id: "output", label: "Analysis output", sub: "metrics · heat maps", kind: "store", col: 2, row: 2 },
        { id: "svg", label: "Generated leaf", sub: "punctuation grammar", kind: "app", col: 3, row: 1 },
        { id: "verify", label: "Read back", sub: "decode · verify", kind: "app", col: 4, row: 1 },
      ],
      edges: [
        { from: "scans", to: "veins" },
        { from: "veins", to: "surface" },
        { from: "veins", to: "output", dashed: true },
        { from: "text", to: "code" },
        { from: "lexicon", to: "code" },
        { from: "surface", to: "svg" },
        { from: "code", to: "svg" },
        { from: "svg", to: "verify" },
      ],
    },
  },
  {
    slug: "alex-workspace",
    group: "bench",
    index: "04",
    title: "Alex Workspace",
    repo: "alex-portfolio-starter · /workspace",
    stack: ["Next.js", "Vercel Blob", "DeepSeek", "Gemini", "MCP", "rclone"],
    copy: {
      en: { status: "Private · in daily use", summary: "A private reading room, notebook, calendar, mail and devlog for a few people, with Carcosa checking local, GitHub and production against each other." },
      zh: { status: "私人 · 日常使用中", summary: "给少数人用的私人阅读室、笔记、日历、邮件和开发日志；Carcosa 把本地、GitHub 和生产环境互相比对。" },
    },
    diagram: {
      nodes: [
        { id: "claude", label: "Claude", sub: "MCP client", kind: "actor", col: 0, row: 0 },
        { id: "people", label: "Owner + members", sub: "one key each", kind: "actor", col: 0, row: 1 },
        { id: "mac", label: "Mac · drivesync", sub: "rclone · git state", kind: "actor", col: 0, row: 2 },
        { id: "mcp", label: "/api/mcp", sub: "scoped tools", kind: "app", col: 1, row: 0 },
        { id: "ui", label: "Workspace UI", sub: "reader · mail · Carcosa", kind: "app", col: 1, row: 1 },
        { id: "sync", label: "/api/…/sync", sub: "device reports", kind: "app", col: 1, row: 2 },
        { id: "api", label: "Route handlers", sub: "auth · agent loop", kind: "app", col: 2, row: 1 },
        { id: "cron", label: "Cron + scribe", sub: "ledger · every 10 min", kind: "app", col: 2, row: 2 },
        { id: "ai", label: "AI models", sub: "DeepSeek · Gemini", kind: "external", col: 3, row: 0 },
        { id: "blob", label: "Private Blob", sub: "per-person folders", kind: "store", col: 3, row: 1 },
        { id: "outside", label: "Gmail · GitHub", sub: "Vercel · read only", kind: "external", col: 3, row: 2 },
      ],
      edges: [
        { from: "claude", to: "mcp" },
        { from: "people", to: "ui" },
        { from: "mac", to: "sync" },
        { from: "mcp", to: "api" },
        { from: "ui", to: "api" },
        { from: "sync", to: "cron" },
        { from: "api", to: "ai" },
        { from: "api", to: "blob" },
        { from: "cron", to: "blob" },
        { from: "cron", to: "outside" },
      ],
    },
  },
  {
    slug: "alex-portfolio",
    group: "bench",
    index: "05",
    title: "Alex Portfolio",
    repo: "alex-portfolio-starter",
    stack: ["Next.js App Router", "Tailwind CSS", "Web Audio", "DeepSeek"],
    copy: {
      en: { status: "Live · changing", summary: "This site: bilingual themes, gallery and bio, the Entanglement orbit with its generated narration, and this workbench." },
      zh: { status: "在线 · 持续修改", summary: "就是这个网站：双语主题、画廊与简介，带生成叙述的 Entanglement 三圈，以及这块工作台。" },
    },
    diagram: {
      nodes: [
        { id: "visitor", label: "Visitor", sub: "en / 中文", kind: "actor", col: 0, row: 1 },
        { id: "content", label: "Content data", sub: "content.ts · orbit.ts", kind: "store", col: 1, row: 0 },
        { id: "page", label: "Home page", sub: "themes · gallery · bio", kind: "app", col: 1, row: 1 },
        { id: "media", label: "/public media", sub: "video · audio · PDF", kind: "store", col: 1, row: 2 },
        { id: "search", label: "Site search", sub: "⌘K · both languages", kind: "app", col: 2, row: 0 },
        { id: "ent", label: "Entanglement", sub: "2-D Fourier · tone", kind: "app", col: 2, row: 1 },
        { id: "workbench", label: "Workbench", sub: "this plate", kind: "app", col: 2, row: 2 },
        { id: "narr", label: "/api/…/narrative", sub: "rate limit · cache", kind: "app", col: 3, row: 1 },
        { id: "ds", label: "DeepSeek", sub: "narration", kind: "external", col: 4, row: 1 },
      ],
      edges: [
        { from: "visitor", to: "page" },
        { from: "content", to: "page" },
        { from: "content", to: "search" },
        { from: "media", to: "page" },
        { from: "page", to: "ent" },
        { from: "page", to: "workbench" },
        { from: "ent", to: "narr" },
        { from: "narr", to: "ds" },
      ],
    },
  },
];
