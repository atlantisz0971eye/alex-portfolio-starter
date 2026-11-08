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
  {
    slug: "dys-utopia-system",
    workSlug: "dys-utopia",
    group: "studio",
    index: "06",
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
    index: "07",
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
    index: "08",
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
    index: "09",
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
