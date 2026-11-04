/**
 * Where the front page gets its stories. Every feed here answered with real items when it was tried; the home computer
 * can later add more through the ingest route without touching this list.
 */
export const SECTION_KEYS = ["science", "world", "money", "uk", "random"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type Feed = { source: string; url: string };
export type SectionSpec = { key: SectionKey; label: string; zh: string; picks: number; maxAgeHours: number; brief: string; feeds: Feed[] };

export const SECTIONS: SectionSpec[] = [
  {
    key: "science", label: "SCIENCE", zh: "科学", picks: 2, maxAgeHours: 24 * 5,
    brief: "Recent scientific results. Prefer a paper or a clear finding over a press-release claim. In `note` say what kind of evidence it is: 单项研究 / 综述 / 预印本 / 新闻稿 / 未说明. Spread across fields (physics, biology, earth, computing) when you can.",
    feeds: [
      { source: "Nature", url: "https://www.nature.com/nature.rss" },
      { source: "Science", url: "https://www.science.org/rss/news_current.xml" },
      { source: "Quanta", url: "https://www.quantamagazine.org/feed/" },
      { source: "Phys.org", url: "https://phys.org/rss-feed/breaking/" },
      { source: "Guardian Science", url: "https://www.theguardian.com/science/rss" },
    ],
  },
  {
    key: "world", label: "WORLD", zh: "国际", picks: 2, maxAgeHours: 36,
    brief: "International politics and conflict. Take the three most consequential and different stories, from different outlets and, when possible, different regions. Prefer reporting over commentary. In `note` give the outlet's region if it matters (e.g. 日本媒体, 印度媒体, 卡塔尔媒体).",
    feeds: [
      { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
      { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
      { source: "DW", url: "https://rss.dw.com/rdf/rss-en-world" },
      { source: "The Hindu", url: "https://www.thehindu.com/news/international/?service=rss" },
      { source: "NHK (日本语)", url: "https://www.nhk.or.jp/rss/news/cat6.xml" },
      { source: "Straits Times", url: "https://www.straitstimes.com/news/world/rss.xml" },
      { source: "Guardian World", url: "https://www.theguardian.com/world/rss" },
    ],
  },
  {
    key: "money", label: "MONEY × TECH", zh: "科技与金融", picks: 2, maxAgeHours: 48,
    brief: "Where large technology companies and traditional finance touch: filings, central banks and regulators, capital flows, funding, chips and energy as financial assets. Prefer primary sources (SEC, central banks) when they have something. A paywalled outlet may give only a headline; say so in `note` (仅标题).",
    feeds: [
      { source: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
      { source: "Bank of England", url: "https://www.bankofengland.co.uk/rss/news" },
      { source: "ECB", url: "https://www.ecb.europa.eu/rss/press.html" },
      { source: "SEC", url: "https://www.sec.gov/news/pressreleases.rss" },
      { source: "CNBC Tech", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html" },
      { source: "CNBC Finance", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
      { source: "WSJ Markets", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
      { source: "FT Technology", url: "https://www.ft.com/technology?format=rss" },
      { source: "Guardian Business", url: "https://www.theguardian.com/business/rss" },
    ],
  },
  {
    key: "uk", label: "UK LOCAL", zh: "英国本地", picks: 2, maxAgeHours: 48,
    brief: "Ordinary life in Britain, away from Westminster theatre: councils and local budgets, housing, health services, transport, work, schools, regional news. Prefer concrete local facts (a place, a number, who decides) to national politics. Spread across different places. In `note` name the place.",
    feeds: [
      { source: "BBC England", url: "https://feeds.bbci.co.uk/news/england/rss.xml" },
      { source: "BBC London", url: "https://feeds.bbci.co.uk/news/england/london/rss.xml" },
      { source: "BBC Scotland", url: "https://feeds.bbci.co.uk/news/scotland/rss.xml" },
      { source: "BBC Wales", url: "https://feeds.bbci.co.uk/news/wales/rss.xml" },
      { source: "BBC N. Ireland", url: "https://feeds.bbci.co.uk/news/northern_ireland/rss.xml" },
      { source: "Guardian Society", url: "https://www.theguardian.com/society/rss" },
      { source: "Guardian London", url: "https://www.theguardian.com/uk/london/rss" },
      { source: "LocalGov", url: "https://www.localgov.co.uk/rss" },
      { source: "Manchester Evening News", url: "https://www.manchestereveningnews.co.uk/news/?service=rss" },
    ],
  },
];

/** The pool the "random" column draws from: code picks the feeds and the stories, never the model. */
export const RANDOM_FEEDS: Feed[] = [
  { source: "Hacker News", url: "https://hnrss.org/frontpage?points=150" },
  { source: "Atlas Obscura", url: "https://www.atlasobscura.com/feeds/latest" },
  { source: "Aeon", url: "https://aeon.co/feed.rss" },
  { source: "Rest of World", url: "https://restofworld.org/feed/latest" },
  { source: "Guardian Society", url: "https://www.theguardian.com/society/rss" },
  { source: "Phys.org", url: "https://phys.org/rss-feed/breaking/" },
  { source: "The Hindu", url: "https://www.thehindu.com/news/international/?service=rss" },
  { source: "Straits Times", url: "https://www.straitstimes.com/news/world/rss.xml" },
  { source: "NHK (日本语)", url: "https://www.nhk.or.jp/rss/news/cat6.xml" },
  { source: "BBC Wales", url: "https://feeds.bbci.co.uk/news/wales/rss.xml" },
  { source: "WSJ Markets", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
  { source: "BIS", url: "https://www.bis.org/doclist/bis_fsi_publs.rss" },
];
export const WIKIPEDIA_RANDOM = "https://en.wikipedia.org/api/rest_v1/page/random/summary";
