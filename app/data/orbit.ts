import type { Language } from "../types/project";

export type OrbitWork = {
  id: string;
  title: string;
  creator?: string;
  note: string;
  // Narrative metadata; never rendered as labels in the Entanglement UI.
  keywords: string[];
  image?: string;
  href?: string;
  placeholder?: boolean;
};

export type OrbitCategory = {
  id: "mine" | "others" | "outside";
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  frequency: number;
  works: OrbitWork[];
};

// Each list defines the circle's equal divisions (3–6 items); all start at six.
// Keep the same number and order of entries in both languages.
const ownWorks = {
  en: [
    { id: "fitting-reality", title: "Fitting Reality", note: "An installation about technology and perception.", keywords: ["algorithmic simulation", "rewritten reality", "physical presence", "perceptual distortion", "noise", "data ghosts"], image: "/fitting-reality/hero/hero_01.jpg", href: "/?focus=project-fitting-reality" },
    { id: "electromagnetic-decay", title: "Electromagnetic Decay", note: "Interference translated into sound and image.", keywords: ["electromagnetic activity", "ambient sound", "interference", "attenuation", "sonic-visual translation", "infrastructure", "control"], image: "/electromagnetic-decay/hero/hero_01.jpg", href: "/?focus=project-electromagnetic-decay" },
    { id: "dys-utopia", title: "Dys/Utopia", note: "A moving portrait of rumination.", keywords: ["rumination", "parallel thoughts", "stability and collapse", "particles", "melting forms", "mirroring", "self-erasure"], image: "/dys-utopia/hero/hero_01.jpg", href: "/?focus=project-dys-utopia" },
    { id: "bloom-system", title: "Bloom System", note: "A system for connection and growth.", keywords: ["bio-interaction", "feedback loop", "moving-image reconstruction", "geography", "memory", "identity", "regional culture"], image: "/bloom-system/hero/hero_01.jpg", href: "/?focus=project-bloom-system" },
    { id: "ga1a", title: "Ga1a", note: "Poetry, leaf rubbings and machine translation.", keywords: ["leaf rubbing", "poetry", "interactive archive", "colour and contour", "sound", "disturbed machine translation"], href: "/?focus=development-ga1a-poetry-leaf-archive" },
    { id: "blur", title: "Blur", note: "A 3D moving-image work about the changing boundary between human and machine creativity.", keywords: ["human-machine symbiosis", "artificial intelligence", "artistic intelligence", "blurring boundaries over time", "human and machine creativity", "3D moving image"], image: "https://i.ytimg.com/vi/K5YCTX091Ek/maxresdefault.jpg", href: "/?focus=gallery-blur-2025" },
  ],
  zh: [
    { id: "fitting-reality", title: "拟合现实", note: "关于技术与感知的装置。", keywords: ["算法模拟", "现实重写", "身体在场", "感知失真", "噪点", "数据残影"], image: "/fitting-reality/hero/hero_01.jpg", href: "/?focus=project-fitting-reality" },
    { id: "electromagnetic-decay", title: "电磁腐烂", note: "将干扰转译为声音与图像。", keywords: ["电磁活动", "环境声音", "信号干扰", "衰减", "声像转译", "人造基础设施", "控制欲望"], image: "/electromagnetic-decay/hero/hero_01.jpg", href: "/?focus=project-electromagnetic-decay" },
    { id: "dys-utopia", title: "Dys/Utopia", note: "一幅关于反刍思维的动态肖像。", keywords: ["反刍思维", "多线思绪", "稳定与崩塌", "粒子", "融化", "镜像", "自我退隐"], image: "/dys-utopia/hero/hero_01.jpg", href: "/?focus=project-dys-utopia" },
    { id: "bloom-system", title: "Bloom System", note: "关于连接与生长的系统。", keywords: ["生物交互", "反馈循环", "动态影像重构", "地理", "记忆", "身份", "地域文化"], image: "/bloom-system/hero/hero_01.jpg", href: "/?focus=project-bloom-system" },
    { id: "ga1a", title: "Ga1a", note: "诗歌、叶片拓印与机器翻译。", keywords: ["叶片拓印", "诗歌", "互动档案", "色彩与轮廓", "声音", "受扰动的机器翻译"], href: "/?focus=development-ga1a-poetry-leaf-archive" },
    { id: "blur", title: "Blur", note: "探讨人机共生及人类与机器创造力边界的 3D 动态影像。", keywords: ["人机共生", "artificial intelligence", "artistic intelligence", "随时间模糊的边界", "人与机器的创造力", "3D 动态影像"], image: "https://i.ytimg.com/vi/K5YCTX091Ek/maxresdefault.jpg", href: "/?focus=gallery-blur-2025" },
  ],
} satisfies Record<Language, OrbitWork[]>;

type Slot = { title: string; creator: string; note: string; keywords: string[]; image?: string; href: string } | null;

// Curated references keep the same order and source links in both languages.
const curatedSlots: Record<Language, Record<"others" | "outside", Slot[]>> = {
  en: {
    others: [
      { title: "Electrical Walks", creator: "Christina Kubisch", note: "Listening to the hidden electromagnetic life of cities.", keywords: ["electromagnetic induction", "urban infrastructure", "walking as listening", "hidden fields", "site-specific sound"], href: "https://christinakubisch.de/electrical-walks" },
      { title: "Liquid Light", creator: "Julian Hand", note: "Analogue liquid projections moving with live sound.", keywords: ["analogue projection", "moving liquids", "live sound", "improvisation", "light-sound synchrony"], href: "https://www.julianhand.net/liquid-light" },
      { title: "ultratronics", creator: "Ryoji Ikeda", note: "A recording built from precise electronic pulses and noise.", keywords: ["electronic pulses", "noise", "sonic precision", "serial structure", "electronic recording"], href: "https://www.ryojiikeda.com/archive/recordings/" },
      { title: "Genesis", creator: "Eduardo Kac", note: "A transgenic artwork about language, biology and belief.", keywords: ["transgenic art", "Bible-to-Morse-to-DNA translation", "synthetic gene", "belief and biology", "human dominion over nature"], href: "https://ekac.org/genesis-info.html" },
      { title: "through a looking glass", creator: "Douglas Gordon", note: "A two-screen encounter with a mirrored film scene.", keywords: ["mirroring", "doubling", "two-channel video", "desynchronization", "self and other"], href: "https://www.guggenheim.org/artwork/5432" },
      { title: "Regular Animals", creator: "Beeple", note: "An installation of robotic animals and mediated images.", keywords: ["robotic animals", "artificial intelligence", "algorithmic perception", "physical-digital hybrid", "power and platforms"], href: "https://www.smb.museum/en/museums-institutions/nationalgalerie/exhibitions/detail/beeple-regular-animals/" },
    ],
    outside: [
      { title: "The Protestant Ethic and the Spirit of Capitalism", creator: "Max Weber", note: "A study of religious ethics and the formation of capitalism.", keywords: ["Protestant ethic", "capitalist spirit", "work as vocation", "religious duty", "rationalization"], href: "https://www.penguinrandomhouse.com/books/296551/the-protestant-ethic-and-the-spirit-of-capitalism-by-max-weber-edited-translated-and-with-an-introduction-and-notes-by-peter-baehrand-gordon-c-wells/" },
      { title: "Notes from Underground", creator: "Fyodor Dostoevsky", note: "An inward, defiant voice questions reason and freedom.", keywords: ["underground self", "irrationality", "defiance", "self-contradiction", "social withdrawal"], href: "https://www.penguinrandomhouse.com/books/678714/notes-from-underground-by-fyodor-dostoevsky-translated-by-richard-pevear-and-larissa-volokhonsky-introduction-by-richard-pevear/9781400041916/" },
      { title: "Beneath the Wheel", creator: "Hermann Hesse", note: "A young life pressed by expectation and education.", keywords: ["educational pressure", "youth", "expectation", "individuality", "institutional constraint"], href: "https://us.macmillan.com/books/9780312422301/beneaththewheel/" },
      { title: "Do Androids Dream of Electric Sheep?", creator: "Philip K. Dick", note: "A question of empathy, identity and artificial life.", keywords: ["androids", "empathy", "human identity", "artificial life", "real and simulated"], href: "https://www.penguinrandomhouse.com/books/40617/do-androids-dream-of-electric-sheep-by-philip-k-dick/" },
      { title: "Twin Peaks", creator: "David Lynch & Mark Frost", note: "A town where mystery follows the logic of dreams.", keywords: ["small-town mystery", "dream logic", "double lives", "uncanny atmosphere", "hidden violence"], href: "https://www.paramountplus.com/shows/twin_peaks/" },
      { title: "Un Chien Andalou (An Andalusian Dog)", creator: "Luis Buñuel & Salvador Dalí", note: "A surrealist film shaped by dreams and abrupt images.", keywords: ["surrealism", "dream imagery", "subconscious", "desire", "discontinuous montage"], href: "https://www.bfi.org.uk/film/3a7ff249-65e3-578f-8334-a4a5713b0397/un-chien-andalou" },
    ],
  },
  zh: {
    others: [
      { title: "Electrical Walks", creator: "Christina Kubisch", note: "聆听城市中隐藏的电磁活动。", keywords: ["电磁感应", "城市基础设施", "行走式聆听", "隐形电磁场", "场域声音"], href: "https://christinakubisch.de/electrical-walks" },
      { title: "Liquid Light", creator: "Julian Hand", note: "随现场声音流动的模拟液体投影。", keywords: ["模拟投影", "流动液体", "现场声音", "即兴", "声光同步"], href: "https://www.julianhand.net/liquid-light" },
      { title: "ultratronics", creator: "Ryoji Ikeda", note: "以精密电子脉冲与噪声构成的录音作品。", keywords: ["电子脉冲", "噪声", "声音精度", "序列结构", "电子录音"], href: "https://www.ryojiikeda.com/archive/recordings/" },
      { title: "Genesis", creator: "Eduardo Kac", note: "关乎语言、生物与信念的转基因艺术作品。", keywords: ["转基因艺术", "圣经—摩斯电码—DNA 转译", "合成基因", "信念与生物", "人对自然的支配"], href: "https://ekac.org/genesis-info.html" },
      { title: "through a looking glass", creator: "Douglas Gordon", note: "以双屏镜像重现电影片段。", keywords: ["镜像", "双重性", "双通道影像", "逐渐失同步", "自我与他者"], href: "https://www.guggenheim.org/artwork/5432" },
      { title: "Regular Animals", creator: "Beeple", note: "关于机器人动物与媒介图像的装置。", keywords: ["机器人动物", "人工智能", "算法感知", "实体与数字混合", "权力与平台"], href: "https://www.smb.museum/en/museums-institutions/nationalgalerie/exhibitions/detail/beeple-regular-animals/" },
    ],
    outside: [
      { title: "The Protestant Ethic and the Spirit of Capitalism", creator: "Max Weber", note: "宗教伦理与资本主义形成之间的关系。", keywords: ["新教伦理", "资本主义精神", "职业使命", "宗教责任", "理性化"], href: "https://www.penguinrandomhouse.com/books/296551/the-protestant-ethic-and-the-spirit-of-capitalism-by-max-weber-edited-translated-and-with-an-introduction-and-notes-by-peter-baehrand-gordon-c-wells/" },
      { title: "Notes from Underground", creator: "Fyodor Dostoevsky", note: "质疑理性与自由的内心独白。", keywords: ["地下自我", "非理性", "反抗", "自我矛盾", "社会退隐"], href: "https://www.penguinrandomhouse.com/books/678714/notes-from-underground-by-fyodor-dostoevsky-translated-by-richard-pevear-and-larissa-volokhonsky-introduction-by-richard-pevear/9781400041916/" },
      { title: "Beneath the Wheel", creator: "Hermann Hesse", note: "被教育与期待挤压的年轻生命。", keywords: ["教育压力", "青春", "外界期待", "个体性", "制度约束"], href: "https://us.macmillan.com/books/9780312422301/beneaththewheel/" },
      { title: "Do Androids Dream of Electric Sheep?", creator: "Philip K. Dick", note: "关于共情、身份和人造生命的追问。", keywords: ["仿生人", "共情", "人类身份", "人造生命", "真实与拟像"], href: "https://www.penguinrandomhouse.com/books/40617/do-androids-dream-of-electric-sheep-by-philip-k-dick/" },
      { title: "Twin Peaks", creator: "David Lynch & Mark Frost", note: "梦境逻辑渗入小镇之谜。", keywords: ["小镇谜团", "梦境逻辑", "双重生活", "诡异氛围", "隐藏的暴力"], href: "https://www.paramountplus.com/shows/twin_peaks/" },
      { title: "Un Chien Andalou (An Andalusian Dog)", creator: "Luis Buñuel & Salvador Dalí", note: "由梦与突兀意象构成的超现实主义影片。", keywords: ["超现实主义", "梦的意象", "潜意识", "欲望", "断裂式剪辑"], href: "https://www.bfi.org.uk/film/3a7ff249-65e3-578f-8334-a4a5713b0397/un-chien-andalou" },
    ],
  },
};

function worksFromSlots(lang: Language, category: "others" | "outside"): OrbitWork[] {
  return curatedSlots[lang][category].map((slot, index) => ({
    id: `${category}-${index + 1}`,
    title: slot?.title ?? (lang === "en" ? `Open slot ${String(index + 1).padStart(2, "0")}` : `待选作品 ${String(index + 1).padStart(2, "0")}`),
    creator: slot?.creator,
    note: slot?.note ?? (lang === "en" ? "A place for a work you choose." : "为你选定的内容预留。"),
    keywords: slot?.keywords ?? [],
    image: slot?.image,
    href: slot?.href,
    placeholder: !slot,
  }));
}

export function getOrbitCategories(lang: Language): OrbitCategory[] {
  return [
    {
      id: "mine",
      label: "Works I’m proud of",
      shortLabel: lang === "en" ? "My work" : "我的作品",
      description: lang === "en" ? "A starting selection from the current portfolio, ready to edit." : "暂从现有作品集中选取示例，之后可以替换。",
      color: "#f3f3f3",
      frequency: 1,
      works: ownWorks[lang],
    },
    {
      id: "others",
      label: "Work of others that I wish I’d made",
      shortLabel: lang === "en" ? "Others’ work" : "他人的作品",
      description: lang === "en" ? "Six works I admire." : "六件让我心生向往的作品。",
      color: "#aaaeb1",
      frequency: -2,
      works: worksFromSlots(lang, "others"),
    },
    {
      id: "outside",
      label: "Things outside of work that I think are interesting",
      shortLabel: lang === "en" ? "Outside work" : "工作之外",
      description: lang === "en" ? "Six books and films beyond my practice." : "六部创作之外的书与影片。",
      color: "#62676b",
      frequency: 3,
      works: worksFromSlots(lang, "outside"),
    },
  ];
}
