# Alex Portfolio Starter — 天·地·人

一个可以直接运行的 Next.js + Tailwind 起步模板，已经内置“天 / 人 / 地”三层叙事结构与占位内容。

## 本地运行
```bash
npm install
npm run dev
# 打开 http://localhost:3000
```

## 编辑内容
- `app/page.tsx` 里找到 `CONTENT_MODEL`，把项目的 `title/summary/tags/status` 改成你自己的。
- 后续可拆分为：
  - 每个项目一个页面（建议路径：`/[theme]/[slug]`）
  - 内容用 MDX/JSON/CMS 管理
- 样式基于 Tailwind，可自行扩展 UI。

## 部署
- 推荐 Vercel：连接 GitHub 仓库，一键部署。
- 或者 Netlify 等平台。
