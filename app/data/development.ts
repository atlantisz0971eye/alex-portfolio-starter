import type { Language } from "../types/project";

export type DevelopmentItem = {
  slug: string;
  index: string;
  title: string;
  subtitle: string;
  type: string;
  summary: string;
  tags: string[];
  href: string;
  host: string;
  /** Cover image in /public, rendered from the project's own material; without one, the card paints its own colour field. */
  poster?: string;
  /** Where the cover's image sits inside the card. */
  posterPosition?: string;
  /** A line taken from the work itself, shown in the opened card. */
  quote?: { text: string; note?: string };
  /** CSS background for the card's media layer when there is no poster. */
  field: string;
};

type DevelopmentContent = { title: string; eyebrow: string; intro: string; liveLabel: string; visitLabel: string; items: DevelopmentItem[] };

const NIGHT_URL = "https://night-8looming-jasmine.vercel.app/web/";
const GA1A_URL = "https://leaf-exhibition.vercel.app/";
const TRYIN_URL = "https://tryin-pi.vercel.app/";

// A red and black night, and the green of the leaf archive, to echo the sections around them.
const NIGHT_FIELD = "radial-gradient(circle at 24% 28%, rgba(214,40,40,.62), transparent 36%), radial-gradient(circle at 80% 72%, rgba(122,12,18,.6), transparent 44%), linear-gradient(145deg, #0a0204, #2a0609 55%, #060102)";
const LEAF_FIELD = "radial-gradient(circle at 72% 24%, rgba(181,203,154,.5), transparent 34%), radial-gradient(circle at 22% 76%, rgba(74,105,69,.55), transparent 42%), linear-gradient(145deg, #0b100a, #1a2a17 55%, #060806)";

// A dark photographic print with a trace of ember, the colour of the burnt shadow the piece leaves behind the foreground.
const TRYIN_FIELD = "radial-gradient(circle at 74% 38%, rgba(192,100,58,.4), transparent 34%), radial-gradient(circle at 24% 80%, rgba(230,225,214,.1), transparent 44%), linear-gradient(145deg, #0b0a09, #1b1a18 55%, #070605)";

export const DEVELOPMENT_CONTENT: Record<Language, DevelopmentContent> = {
  en: {
    title: "Project Development",
    eyebrow: "Live works",
    intro: "Projects built and shipped as running software: each one is a live site that keeps changing as it is developed.",
    liveLabel: "Live",
    visitLabel: "Visit live",
    items: [
      {
        slug: "night-8looming-jasmine",
        index: "01",
        title: "Night, 8looming Jasmine",
        subtitle: "Interactive web piece",
        type: "Interactive web piece",
        summary: "A map-based web piece. Press START and Yasmine finds you; she reads where you are, how much around you is worth talking about (the heat), and will not stop talking.",
        quote: { text: "It will not stop talking.", note: "Asleep · Heat - · Start / Shut up / Forget" },
        poster: "/development/night-cover-2.webp",
        posterPosition: "right center",
        tags: ["Interactive web", "GPS", "Dream"],
        href: NIGHT_URL,
        host: "night-8looming-jasmine.vercel.app",
        field: NIGHT_FIELD,
      },
      {
        slug: "ga1a-poetry-leaf-archive",
        index: "02",
        title: "Ga1a",
        subtitle: "Poetry Leaf Archive",
        type: "Interactive web archive",
        summary: "An interactive archive where leaf rubbings carry poetry through colour, contour, recorded impact, and disturbed machine translation.",
        tags: ["Poetry", "Leaf Rubbing", "Machine Translation", "Sound"],
        quote: { text: "“The trees, though summer, yet do wear their leaves.”", note: "Shakespeare → machine decoding: “Trje treres, thpph sumeer, ytwt do wear their leaves.”" },
        poster: "/development/ga1a-cover-2.webp",
        posterPosition: "right center",
        href: GA1A_URL,
        host: "leaf-exhibition.vercel.app",
        field: LEAF_FIELD,
      },
      {
        slug: "tryin",
        index: "03",
        title: "Tryin'",
        subtitle: "Walk-in photograph",
        type: "Interactive web piece",
        summary: "Upload a photo or a short video and it becomes a particle space you can walk into. What the camera never recorded stays missing: the burnt shadow behind each foreground and the ash hanging between are left as shapes, not filled in by AI.",
        quote: { text: "freeze a moment, then walk into it", note: "Stand where it was taken and everything lines up. Step aside and the shadow shows." },
        poster: "/development/tryin-cover.webp",
        posterPosition: "right center",
        tags: ["Interactive web", "Photograph", "Relativity", "Particles"],
        href: TRYIN_URL,
        host: "tryin-pi.vercel.app",
        field: TRYIN_FIELD,
      },
    ],
  },
  zh: {
    title: "项目开发",
    eyebrow: "在线作品",
    intro: "以可运行的软件形式持续开发和发布的项目：每一个都是仍在不断变化的在线网站。",
    liveLabel: "在线",
    visitLabel: "访问作品",
    items: [
      {
        slug: "night-8looming-jasmine",
        index: "01",
        title: "Night, 8looming Jasmine",
        subtitle: "互动网页作品",
        type: "互动网页作品",
        summary: "一件基于地图的网页作品。按下 START，Yasmine 会找到你；她读取你所在的位置，以及周围有多少值得说的事（热度），然后说个不停。",
        quote: { text: "It will not stop talking.", note: "Asleep · Heat - · Start / Shut up / Forget" },
        poster: "/development/night-cover-2.webp",
        posterPosition: "right center",
        tags: ["互动网页", "GPS", "梦"],
        href: NIGHT_URL,
        host: "night-8looming-jasmine.vercel.app",
        field: NIGHT_FIELD,
      },
      {
        slug: "ga1a-poetry-leaf-archive",
        index: "02",
        title: "Ga1a",
        subtitle: "诗歌叶片档案",
        type: "互动网页档案",
        summary: "一个将叶片拓印、诗歌、声音、色彩与受扰动的机器翻译并置起来的互动档案。",
        tags: ["诗歌", "叶片拓印", "机器翻译", "声音"],
        quote: { text: "“The trees, though summer, yet do wear their leaves.”", note: "莎士比亚 → 机器解码：“Trje treres, thpph sumeer, ytwt do wear their leaves.”" },
        poster: "/development/ga1a-cover-2.webp",
        posterPosition: "right center",
        href: GA1A_URL,
        host: "leaf-exhibition.vercel.app",
        field: LEAF_FIELD,
      },
      {
        slug: "tryin",
        index: "03",
        title: "Tryin'",
        subtitle: "走进去的照片",
        type: "互动网页作品",
        summary: "上传一张照片或一段短视频，它会变成一个可以走进去的粒子空间。相机没记录到的地方保持缺失：前景身后焦黑的影子和悬停的灰烬只给形状，不用 AI 补全。",
        quote: { text: "freeze a moment, then walk into it", note: "站在拍摄点，一切都对得上；往旁边走，被挡住的影子就露出来。" },
        poster: "/development/tryin-cover.webp",
        posterPosition: "right center",
        tags: ["互动网页", "照片", "相对论", "粒子"],
        href: TRYIN_URL,
        host: "tryin-pi.vercel.app",
        field: TRYIN_FIELD,
      },
    ],
  },
};
