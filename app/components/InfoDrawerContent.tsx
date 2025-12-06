"use client";

import { glassCardClass } from "../lib/ui";

type InfoDrawerContentProps = {
  lang: "en" | "zh";
  contentDump: string;
};

export default function InfoDrawerContent({ lang, contentDump }: InfoDrawerContentProps) {
  return (
    <div className={`absolute right-0 mt-2 w-[600px] max-w-[90vw] text-sm space-y-4 z-50 backdrop-blur ${glassCardClass}`}>
      <div>
        <h4 className="font-semibold mb-2">{lang === "en" ? "Information Architecture (IA)" : "信息架构（IA）"}</h4>
        <pre className="whitespace-pre-wrap text-xs bg-white/5 p-3 rounded-lg border border-white/10">
{lang === "en" ? 
`Site Root
├── Home (Overview: Technology · Rumination · Connection intro + latest/featured works)
├── Technology / 科技
│   ├── Fitting Reality (Project page)
│   └── Electromagnetic Decay (Project page)
├── Rumination / 反刍
│   └── Dys/Utopia (Project page)
├── Connection / 连接
│   └── Roots / Hometown Series (Ongoing, phase logs/material wall)
├── About (Artist statement / CV / Statement)
└── Contact (Contact info / Social media)`
:
`Site Root
├── Home (总述：科技·反刍·连接引子 + 最新/精选作品)
├── 科技 / Technology
│   ├── 拟合现实 (项目页)
│   └── 电磁腐烂 (项目页)
├── 反刍 / Rumination
│   └── Dys/Utopia (项目页)
├── 连接 / Connection
│   └── 根源/家乡系列 (进行中，阶段性日志/素材墙)
├── About (艺术家自述 / CV / Statement)
└── Contact (联系方式 / 社媒)`}
        </pre>
      </div>
      <div>
        <h4 className="font-semibold mb-2">{lang === "en" ? "Content Data Structure (Example)" : "内容数据结构（示意）"}</h4>
        <pre className="whitespace-pre-wrap text-xs bg-white/5 p-3 rounded-lg border border-white/10 overflow-auto max-h-[240px]">
{contentDump}
        </pre>
      </div>
      <div className="text-white/80 text-sm leading-relaxed">
        <p className="mb-2">{lang === "en" ? "Implementation Suggestions:" : "落地建议："}</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>{lang === "en" ? "Split projects into MDX/JSON; generate project pages with dynamic routes /[theme]/[slug]." : "将 projects 拆成 MDX/JSON；用动态路由 /[theme]/[slug] 生成项目页。"}</li>
          <li>{lang === "en" ? "Content hosting: local MDX (Contentlayer), or Headless CMS (Sanity/Strapi/Contentful)." : "内容托管：本地 MDX（Contentlayer），或 Headless CMS（Sanity/Strapi/Contentful）。"}</li>
          <li>{lang === "en" ? "Deployment: Vercel/Netlify." : "部署：Vercel/Netlify。"}</li>
        </ul>
      </div>
    </div>
  );
}
