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
  /** Optional poster image in /public; without one, the card paints its own colour field. */
  poster?: string;
  /** CSS background for the card's media layer when there is no poster. */
  field: string;
};

type DevelopmentContent = { title: string; eyebrow: string; intro: string; liveLabel: string; visitLabel: string; items: DevelopmentItem[] };

const NIGHT_URL = "https://night-8looming-jasmine.vercel.app/web/";
const GA1A_URL = "https://leaf-exhibition.vercel.app/";

// A red and black night, and the green of the leaf archive, to echo the sections around them.
const NIGHT_FIELD = "radial-gradient(circle at 24% 28%, rgba(214,40,40,.62), transparent 36%), radial-gradient(circle at 80% 72%, rgba(122,12,18,.6), transparent 44%), linear-gradient(145deg, #0a0204, #2a0609 55%, #060102)";
const LEAF_FIELD = "radial-gradient(circle at 72% 24%, rgba(181,203,154,.5), transparent 34%), radial-gradient(circle at 22% 76%, rgba(74,105,69,.55), transparent 42%), linear-gradient(145deg, #0b100a, #1a2a17 55%, #060806)";

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
        summary: "Press START and Yasmine will find you. A web piece that follows you through the night, and will not stop talking.",
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
        href: GA1A_URL,
        host: "leaf-exhibition.vercel.app",
        field: LEAF_FIELD,
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
        summary: "按下 START，Yasmine 会找到你。一件在夜里跟随你、说个不停的网页作品。",
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
        href: GA1A_URL,
        host: "leaf-exhibition.vercel.app",
        field: LEAF_FIELD,
      },
    ],
  },
};
