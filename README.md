# Alex Portfolio — 科技 · 反刍 · 连接

基于 Next.js App Router 与 Tailwind CSS 的双语个人作品集。网站以“科技 / 反刍 / 连接”组织作品，并提供站内搜索、项目媒体详情、更新日志和个人简介。

## 本地运行
```bash
npm install
npm run dev
# 打开 http://localhost:3000
```

## 编辑内容

- 项目与主题内容：`app/data/content.ts`
- 个人简介与联系方式：`app/components/BioSection.tsx`
- 全局样式与视觉 token：`app/globals.css`
- 项目图片、视频、音频和文档：`public/`

## 目录架构

```text
app/
├── components/   页面区块与界面组件
├── data/         双语主题和项目内容
├── hooks/        搜索、媒体、视频与界面状态
├── lib/          可复用的领域与交互逻辑
├── types/        内容模型与共享类型
├── utils/        浏览器环境与资源工具
├── layout.tsx    站点元数据和根布局
└── page.tsx      首页编排层
```

`page.tsx` 只负责组合功能模块；项目详情按需加载，内容与交互逻辑分别放在 `data/`、`hooks/` 和 `lib/` 中，便于下一步接入独立项目路由、MDX 或 CMS。

## 部署
- 推荐 Vercel：连接 GitHub 仓库，一键部署。
- 或者 Netlify 等平台。
