import type { Language } from "../types/project";

export type GalleryItem = {
  slug: string;
  kind: "archive" | "video";
  title: string;
  subtitle: string;
  description: string;
  href: string;
  tags: string[];
  eyebrow: string;
  index: string;
  year?: string;
  duration?: string;
  thumbnail?: string;
};

type GalleryContent = {
  title: string;
  eyebrow: string;
  intro: string;
  visitLabel: string;
  watchLabel: string;
  reserveLabel: string;
  reserveDescription: string;
  items: GalleryItem[];
};

const GA1A_URL = "https://leaf-language-engine-production.up.railway.app/";

export const GALLERY_CONTENT = {
  en: {
    title: "Gallery",
    eyebrow: "Independent works",
    intro: "A growing index of web experiments, visual studies, sound works, and projects that live beyond the three core themes.",
    visitLabel: "Visit live work",
    watchLabel: "Watch on YouTube",
    reserveLabel: "Next work",
    reserveDescription: "Reserved for the next experiment, study, or collaboration.",
    items: [
      {
        slug: "ga1a-poetry-leaf-archive",
        kind: "archive",
        title: "Ga1a",
        subtitle: "Poetry Leaf Archive",
        description:
          "An interactive archive where leaf rubbings carry poetry through colour, contour, recorded impact, and disturbed machine translation.",
        href: GA1A_URL,
        tags: ["Poetry", "Leaf Rubbing", "Machine Translation", "Sound"],
        eyebrow: "Interactive web archive",
        index: "01",
      },
      {
        slug: "blur-2025",
        kind: "video",
        title: "Blur",
        subtitle: "Video Work",
        description: "A moving-image work released in 2025 and presented through the artist’s video archive.",
        href: "https://www.youtube.com/watch?v=K5YCTX091Ek",
        tags: ["Moving Image", "Video", "2025"],
        eyebrow: "Moving image",
        index: "02",
        year: "2025",
        duration: "03:07",
        thumbnail: "https://i.ytimg.com/vi/K5YCTX091Ek/maxresdefault.jpg",
      },
      {
        slug: "lun-xian-2025",
        kind: "video",
        title: "沦陷",
        subtitle: "Music Video",
        description: "A music video work released in 2025 and presented through the artist’s video archive.",
        href: "https://www.youtube.com/watch?v=_7dHfAWTiqk",
        tags: ["Music Video", "Moving Image", "2025"],
        eyebrow: "Music video",
        index: "03",
        year: "2025",
        duration: "03:47",
        thumbnail: "https://i.ytimg.com/vi/_7dHfAWTiqk/maxresdefault.jpg",
      },
    ],
  },
  zh: {
    title: "作品画廊",
    eyebrow: "独立作品",
    intro: "持续生长的作品索引，用来收录三个基本主题之外的网页实验、视觉研究、声音作品与合作项目。",
    visitLabel: "访问在线作品",
    watchLabel: "在 YouTube 观看",
    reserveLabel: "下一件作品",
    reserveDescription: "为下一项实验、研究或合作预留。",
    items: [
      {
        slug: "ga1a-poetry-leaf-archive",
        kind: "archive",
        title: "Ga1a",
        subtitle: "诗歌叶片档案",
        description: "一个将叶片拓印、诗歌、声音、色彩与受扰动的机器翻译并置起来的互动档案。",
        href: GA1A_URL,
        tags: ["诗歌", "叶片拓印", "机器翻译", "声音"],
        eyebrow: "互动网页档案",
        index: "01",
      },
      {
        slug: "blur-2025",
        kind: "video",
        title: "Blur",
        subtitle: "影像作品",
        description: "发布于 2025 年的动态影像作品，现收录于艺术家的公开视频档案。",
        href: "https://www.youtube.com/watch?v=K5YCTX091Ek",
        tags: ["动态影像", "视频", "2025"],
        eyebrow: "动态影像",
        index: "02",
        year: "2025",
        duration: "03:07",
        thumbnail: "https://i.ytimg.com/vi/K5YCTX091Ek/maxresdefault.jpg",
      },
      {
        slug: "lun-xian-2025",
        kind: "video",
        title: "沦陷",
        subtitle: "音乐录影带",
        description: "发布于 2025 年的音乐录影带作品，现收录于艺术家的公开视频档案。",
        href: "https://www.youtube.com/watch?v=_7dHfAWTiqk",
        tags: ["音乐录影带", "动态影像", "2025"],
        eyebrow: "音乐录影带",
        index: "03",
        year: "2025",
        duration: "03:47",
        thumbnail: "https://i.ytimg.com/vi/_7dHfAWTiqk/maxresdefault.jpg",
      },
    ],
  },
} satisfies Record<Language, GalleryContent>;
