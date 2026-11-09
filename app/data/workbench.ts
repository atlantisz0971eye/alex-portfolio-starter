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
} & (
  | { diagram: WorkbenchDiagram; views?: never }
  /** Several diagrams for one project, switched by tabs, when it has more than one system worth drawing. */
  | { views: WorkbenchView[]; diagram?: never }
);
export type WorkbenchView = { label: Record<Language, string>; diagram: WorkbenchDiagram };
/** Every diagram a project draws, in tab order. */
export const projectViews = (project: WorkbenchProject): WorkbenchView[] =>
  project.views ?? [{ label: { en: project.title, zh: project.title }, diagram: project.diagram }];

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
export const WORKBENCH_AS_OF = "2026-11-09";

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
    stack: ["Growing Neural Gas", "Node daemon", "MapLibre", "Vercel functions", "DeepSeek", "ElevenLabs", "React Three Fiber"],
    copy: {
      en: { status: "Running prototype", summary: "Two characters. Yasmine is a small mind that learns on the CPU: she walks the real map, is fed Wikipedia facts, grows concepts, forgets, gets hungry and dreams. Jasmine is her twin and narrator: she sees all of Yasmine, talks with you, and can change only her world." },
      zh: { status: "可运行原型", summary: "两个角色。Yasmine 是在 CPU 上真正学习的小心智：她在真实地图上走，被喂 Wikipedia 事实，长出概念、会遗忘、会饿、会做梦。Jasmine 是她的双生和叙述者：看得见 Yasmine 的一切，能和你对话，但只能改变她的世界。" },
    },
    views: [
      {
        label: { en: "Yasmine · the mind", zh: "Yasmine · 心智" },
        diagram: {
          nodes: [
            { id: "wiki", label: "Wikipedia", sub: "any language · Wikidata", kind: "external", col: 0, row: 0 },
            { id: "walk", label: "Her walk", sub: "heat · hunger · food sense", kind: "actor", col: 0, row: 1 },
            { id: "senses", label: "Senses", sub: "simulated · ESP later", kind: "actor", col: 0, row: 2 },
            { id: "api", label: "/api/knowledge", sub: "one fact a window", kind: "app", col: 1, row: 0 },
            { id: "predictor", label: "Predictor", sub: "guesses the next senses", kind: "app", col: 1, row: 2 },
            { id: "known", label: "Knowledge", sub: "counts only new facts", kind: "store", col: 2, row: 0 },
            { id: "gng", label: "Growing Neural Gas", sub: "concepts · associations", kind: "app", col: 2, row: 1 },
            { id: "recall", label: "Recall · forgetting", sub: "attention · dreams", kind: "app", col: 2, row: 2 },
            { id: "parent", label: "Parent", sub: "DeepSeek · numbers only", kind: "external", col: 3, row: 0 },
            { id: "affect", label: "Affect", sub: "feeling · mood · hunger", kind: "app", col: 3, row: 1 },
            { id: "body", label: "Body", sub: "flesh → walking figure", kind: "app", col: 4, row: 1 },
            { id: "rows", label: "Memory rows", sub: "daemon state · rows.csv", kind: "store", col: 4, row: 2 },
          ],
          edges: [
            { from: "wiki", to: "api" },
            { from: "walk", to: "api" },
            { from: "api", to: "known" },
            { from: "api", to: "gng" },
            { from: "senses", to: "predictor" },
            { from: "predictor", to: "affect" },
            { from: "known", to: "affect" },
            { from: "gng", to: "affect" },
            { from: "gng", to: "recall" },
            { from: "affect", to: "parent", dashed: true },
            { from: "affect", to: "body" },
            { from: "affect", to: "rows" },
          ],
        },
      },
      {
        label: { en: "Jasmine · the voice", zh: "Jasmine · 声音" },
        diagram: {
          nodes: [
            { id: "tiles", label: "OpenFreeMap", sub: "OSM vector tiles", kind: "external", col: 0, row: 0 },
            { id: "listener", label: "Listener", sub: "phone · GPS", kind: "actor", col: 0, row: 1 },
            { id: "visitor", label: "Visitor", sub: "voice or text", kind: "actor", col: 0, row: 2 },
            { id: "phone", label: "Phone page", sub: "map · heat · trace", kind: "app", col: 1, row: 0 },
            { id: "twin", label: "Twin packet", sub: "all of Yasmine", kind: "app", col: 1, row: 2 },
            { id: "narrate", label: "/api/narrate", sub: "one stream of speech", kind: "app", col: 2, row: 0 },
            { id: "knowledge", label: "/api/knowledge", sub: "place facts · filter", kind: "app", col: 2, row: 1 },
            { id: "agent", label: "Jasmine agent", sub: "answers · ElevenLabs", kind: "app", col: 2, row: 2 },
            { id: "deepseek", label: "DeepSeek", sub: "language model", kind: "external", col: 3, row: 0 },
            { id: "wikipedia", label: "Wikipedia", sub: "place facts", kind: "external", col: 3, row: 1 },
            { id: "world", label: "Yasmine's world", sub: "place · food · light · rain", kind: "app", col: 3, row: 2 },
          ],
          edges: [
            { from: "tiles", to: "phone" },
            { from: "listener", to: "phone" },
            { from: "phone", to: "narrate" },
            { from: "narrate", to: "deepseek" },
            { from: "narrate", to: "knowledge" },
            { from: "knowledge", to: "wikipedia" },
            { from: "visitor", to: "twin" },
            { from: "twin", to: "agent" },
            { from: "agent", to: "deepseek" },
            { from: "agent", to: "world" },
          ],
        },
      },
    ],
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
      en: { status: "Live · changing", summary: "This site: the alexsonicLAb welcome that plays the page as techno, bilingual themes, gallery and bio, the Entanglement orbit with its generated narration, and this workbench." },
      zh: { status: "在线 · 持续修改", summary: "就是这个网站：把页面放成 techno 的 alexsonicLAb 开场页、双语主题、画廊与简介，带生成叙述的 Entanglement 三圈，以及这块工作台。" },
    },
    diagram: {
      nodes: [
        { id: "lab", label: "alexsonicLAb", sub: "welcome · plays this page", kind: "app", col: 0, row: 0 },
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
        { from: "visitor", to: "lab" },
        { from: "lab", to: "page", dashed: true },
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
  {
    slug: "alexsoniclab",
    group: "bench",
    index: "06",
    title: "alexsonicLAb",
    repo: "alexsoniclab",
    href: "https://alexsoniclab.vercel.app/",
    stack: ["Next.js", "Playwright · Chromium", "Web Audio", "Vercel Fluid"],
    copy: {
      en: { status: "Live · changing", summary: "Any public page, read by a headless browser behind a guard proxy and sent back as geometry only, then played as techno by the same two-deck Lab that opens this site." },
      zh: { status: "在线 · 持续修改", summary: "任何公开网页：在守卫代理后面由无头浏览器读取，只传回几何形状，再交给打开这个网站的同一个双唱盘 Lab 放成 techno。" },
    },
    diagram: {
      nodes: [
        { id: "visitor", label: "Visitor", sub: "URL · scroll · keys", kind: "actor", col: 0, row: 0 },
        { id: "site", label: "Target site", sub: "any public page", kind: "external", col: 0, row: 2 },
        { id: "api", label: "/api/scan", sub: "rate limit · cache", kind: "app", col: 1, row: 0 },
        { id: "chromium", label: "Headless Chromium", sub: "one browser per scan", kind: "app", col: 1, row: 1 },
        { id: "guard", label: "Guard proxy", sub: "DNS pinned · no private IPs", kind: "app", col: 1, row: 2 },
        { id: "snapshot", label: "Snapshot", sub: "geometry only · CDN 1 h", kind: "store", col: 2, row: 0 },
        { id: "read", label: "snapshotPage", sub: "boxes · lines · sections", kind: "app", col: 2, row: 1 },
        { id: "aidj", label: "AI DJ", sub: "seeded set · no model", kind: "app", col: 2, row: 2 },
        { id: "lab", label: "SonicLab", sub: "rows → ASCII · read head", kind: "app", col: 3, row: 0 },
        { id: "players", label: "Five players", sub: "one page signal each", kind: "app", col: 3, row: 1 },
        { id: "portfolio", label: "Portfolio", sub: "same Lab · sync-lab", kind: "external", col: 4, row: 0 },
        { id: "synth", label: "Two-deck synth", sub: "Web Audio · crossfader", kind: "app", col: 4, row: 1 },
        { id: "take", label: "Take", sub: "audio · #perf link", kind: "store", col: 4, row: 2 },
      ],
      edges: [
        { from: "visitor", to: "api" },
        { from: "api", to: "chromium" },
        { from: "chromium", to: "guard" },
        { from: "guard", to: "site" },
        { from: "chromium", to: "read" },
        { from: "read", to: "snapshot" },
        { from: "snapshot", to: "lab" },
        { from: "lab", to: "players" },
        { from: "aidj", to: "players", dashed: true },
        { from: "players", to: "synth" },
        { from: "synth", to: "take" },
        { from: "portfolio", to: "lab", dashed: true },
      ],
    },
  },
  {
    slug: "dys-utopia-system",
    workSlug: "dys-utopia",
    group: "studio",
    index: "07",
    title: "Dys/Utopia",
    repo: "Interactive model · TouchDesigner",
    href: "https://vimeo.com/1151628483",
    hrefKind: "watch",
    stack: ["TouchDesigner", "Kinect skeleton", "Real-time 3-D", "Vertex displacement"],
    copy: {
      en: { status: "Interactive model", summary: "An algorithmic self-portrait of rumination. Rings drift into disorder on their own; raising a hand above the head breaks the threshold and the feedback loop melts the head." },
      zh: { status: "互动模型", summary: "关于反刍的算法自画像。圆环会自行滑向混乱；右手举过头顶越过阈值，反馈回路让头部液化坍塌。" },
    },
    diagram: {
      nodes: [
        { id: "viewer", label: "Viewer", sub: "right hand", kind: "actor", col: 0, row: 1 },
        { id: "kinect", label: "Kinect skeleton", sub: "hand height", kind: "app", col: 1, row: 1 },
        { id: "panel", label: "Tuning panel", sub: "six parameters", kind: "app", col: 1, row: 2 },
        { id: "entropy", label: "Passive entropy", sub: "noise over time", kind: "app", col: 2, row: 0 },
        { id: "gate", label: "Threshold gate", sub: "hand above head", kind: "app", col: 2, row: 1 },
        { id: "feedback", label: "Active feedback", sub: "the head liquefies", kind: "app", col: 3, row: 1 },
        { id: "mind", label: "Head · Bed · Rings", sub: "TouchDesigner scene", kind: "app", col: 4, row: 1 },
        { id: "grid", label: "YOU ME US", sub: "mirrored infinite grid", kind: "app", col: 4, row: 2 },
      ],
      edges: [
        { from: "viewer", to: "kinect" },
        { from: "kinect", to: "gate" },
        { from: "panel", to: "gate" },
        { from: "gate", to: "feedback" },
        { from: "feedback", to: "mind" },
        { from: "entropy", to: "mind" },
        { from: "mind", to: "grid", dashed: true },
      ],
    },
  },
  {
    slug: "bloom-system-framework",
    workSlug: "bloom-system",
    group: "studio",
    index: "08",
    title: "Bloom System · I Am Working",
    repo: "Generative framework · film",
    href: "https://vimeo.com/1150589247",
    hrefKind: "watch",
    stack: ["ECG", "Frame-offset buffering", "Time-warp", "Gaussian point clouds", "Sound design"],
    copy: {
      en: { status: "Moving image", summary: "The performer's ECG replaces the script: high-frequency spikes drive frame-offset buffering and time-warp, so the more the body strains, the more the image drags and tears." },
      zh: { status: "实验影像", summary: "表演者的 ECG 取代剧本：高频尖峰驱动帧偏移缓冲和时间扭曲，身体越吃力，画面越拖拽、撕裂。" },
    },
    diagram: {
      nodes: [
        { id: "performer", label: "Performer", sub: "ECG electrodes", kind: "actor", col: 0, row: 1 },
        { id: "footage", label: "Footage", sub: "landscape · body", kind: "store", col: 1, row: 0 },
        { id: "ecg", label: "ECG capture", sub: "HRV · high-band energy", kind: "app", col: 1, row: 1 },
        { id: "archive", label: "ECG archive", sub: "traces as evidence", kind: "store", col: 1, row: 2 },
        { id: "warp", label: "Time displacement", sub: "frame offset · warp", kind: "app", col: 2, row: 1 },
        { id: "points", label: "3-D sequences", sub: "Gaussian point clouds", kind: "app", col: 2, row: 2 },
        { id: "sound", label: "Sound design", sub: "synth · sampled noise", kind: "app", col: 3, row: 0 },
        { id: "edit", label: "Edit", sub: "collaborative cut", kind: "app", col: 3, row: 1 },
        { id: "film", label: "I Am Working", sub: "film, 2025", kind: "actor", col: 4, row: 1 },
      ],
      edges: [
        { from: "performer", to: "ecg" },
        { from: "ecg", to: "warp" },
        { from: "footage", to: "warp" },
        { from: "ecg", to: "archive", dashed: true },
        { from: "warp", to: "edit" },
        { from: "points", to: "edit" },
        { from: "sound", to: "edit" },
        { from: "edit", to: "film" },
      ],
    },
  },
  {
    slug: "electromagnetic-decay-system",
    workSlug: "electromagnetic-decay",
    group: "studio",
    index: "09",
    title: "Electromagnetic Decay",
    repo: "Listening apparatus · Raspberry Pi 5",
    href: "https://vimeo.com/1150600847",
    hrefKind: "watch",
    stack: ["RTL-SDR", "Behringer UM2", "Raspberry Pi 5", "Python DSP", "CNC enclosure"],
    copy: {
      en: { status: "Listening apparatus", summary: "An SDR receiver listens to the city's RF behaviour, never its content. RSSI, noise floor and bursts are mapped onto gate, filters, tremolo and bitcrush, so the signal contaminates ambient sound." },
      zh: { status: "聆听装置", summary: "SDR 接收器聆听城市的射频行为，而不解码内容。RSSI、底噪和突发被映射到门限、滤波、颤音和比特压缩上，让信号污染环境声。" },
    },
    diagram: {
      nodes: [
        { id: "sdr", label: "RTL-SDR", sub: "25 MHz – 1.7 GHz", kind: "actor", col: 0, row: 0 },
        { id: "mic", label: "Ambient mic", sub: "Behringer UM2", kind: "actor", col: 0, row: 2 },
        { id: "norm", label: "Normalization", sub: "Pi 5 · Python", kind: "app", col: 1, row: 1 },
        { id: "rf", label: "RF features", sub: "RSSI · noise floor · burst", kind: "app", col: 2, row: 0 },
        { id: "audio", label: "Audio features", sub: "RMS · centroid · transient", kind: "app", col: 2, row: 2 },
        { id: "map", label: "Interference map", sub: "RF → gate · LPF · glitch", kind: "app", col: 3, row: 1 },
        { id: "ui", label: "Live UI", sub: "waveform · spectrogram", kind: "app", col: 4, row: 0 },
        { id: "dsp", label: "DSP → mix bus", sub: "speakers · headphones", kind: "app", col: 4, row: 1 },
        { id: "archive", label: "Archive", sub: "RF logs · ambience", kind: "store", col: 4, row: 2 },
      ],
      edges: [
        { from: "sdr", to: "norm" },
        { from: "mic", to: "norm" },
        { from: "norm", to: "rf" },
        { from: "norm", to: "audio" },
        { from: "rf", to: "map" },
        { from: "audio", to: "map" },
        { from: "map", to: "dsp" },
        { from: "dsp", to: "ui" },
        { from: "dsp", to: "archive" },
      ],
    },
  },
  {
    slug: "fitting-reality-system",
    workSlug: "fitting-reality",
    group: "studio",
    index: "10",
    title: "Fitting Reality",
    repo: "Interactive installation · two screens",
    href: "https://vimeo.com/1151388456",
    hrefKind: "watch",
    stack: ["Google Speech", "MarianMT", "DistilBERT", "StreamDiffusion · TensorRT", "TouchDesigner", "Kinect Azure"],
    copy: {
      en: { status: "Interactive installation", summary: "A computational mirror driven by speaking, looking and turning: speech becomes a prompt, the camera feed is re-synthesised in real time, and head orientation decides which screen shows the machine's version of you." },
      zh: { status: "互动装置", summary: "由说话、注视和转身驱动的计算之镜：语音变成提示词，摄像画面被实时重新生成，头部朝向决定哪一块屏幕显示机器眼中的你。" },
    },
    diagram: {
      nodes: [
        { id: "viewer", label: "Viewer", sub: "speaks · looks · turns", kind: "actor", col: 0, row: 1 },
        { id: "speech", label: "Google Speech", sub: "speech to text", kind: "external", col: 1, row: 0 },
        { id: "cams", label: "Cameras A · B", sub: "live frames", kind: "app", col: 1, row: 1 },
        { id: "kinect", label: "Kinect Azure", sub: "head orientation", kind: "app", col: 1, row: 2 },
        { id: "prompt", label: "Prompt builder", sub: "MarianMT · DistilBERT", kind: "app", col: 2, row: 0 },
        { id: "diffusion", label: "StreamDiffusion", sub: "TensorRT · TouchDesigner", kind: "app", col: 2, row: 1 },
        { id: "switch", label: "Viewport switch", sub: "angle to the screens", kind: "app", col: 2, row: 2 },
        { id: "screenA", label: "Screen A", sub: "AI image", kind: "actor", col: 3, row: 1 },
        { id: "screenB", label: "Screen B", sub: "real feed", kind: "actor", col: 3, row: 2 },
      ],
      edges: [
        { from: "viewer", to: "speech" },
        { from: "viewer", to: "cams" },
        { from: "viewer", to: "kinect" },
        { from: "speech", to: "prompt" },
        { from: "prompt", to: "diffusion" },
        { from: "cams", to: "diffusion" },
        { from: "kinect", to: "switch" },
        { from: "diffusion", to: "screenA" },
        { from: "switch", to: "screenA", dashed: true },
        { from: "switch", to: "screenB" },
      ],
    },
  },
];
