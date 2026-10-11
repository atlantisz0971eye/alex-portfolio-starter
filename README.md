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
- Entanglement 的三圈节点：`app/data/orbit.ts`。第一圈在 `ownWorks`；后两圈在 `curatedSlots`，目前各填入六项。修改标题、作者、简介或资料链接时，请保持中英文列表顺序一致；每圈支持 3–6 项。
- 个人简介与联系方式：`app/components/BioSection.tsx`
- 全局样式与视觉 token：`app/globals.css`
- 项目图片、视频、音频和文档：`public/`

Entanglement 位于首页 Artist Profile 的 Artist Statement 与 Education 之间。三个圆持续缓慢旋转，鼠标悬停某个圆时只暂停该圆。18 个节点可任选三个，也可全部来自同一圈；再次点击已选节点会取消，选满后点击新节点会替换最早选中的点。同一组节点始终生成相同的图形与波形，不受点击顺序影响。作品名称下方的 `+` 会在新窗口打开对应资料。选满三点后可点声音图标聆听固定、空灵的玻璃质感音色：柔和主音、轻微高八度泛音和淡淡的空间尾音；纵向位置对应音高，横向位置对应声像，没有音色调节。默认静音，离开页面或暂停旋转时声音淡出。右上角可暂停旋转，系统设置为减少动态效果时直接显示完整结果。旧的 `/orbit` 链接会转到这一项。

标题旁以低对比度标出实际使用的二维傅立叶合成公式。站内搜索同时索引中英文主题、作品、关键词、艺术家档案与 Entanglement 的参考作品；搜索结果可直接打开对应卡片，参考作品会在 Entanglement 中被选中。支持 `⌘K` / `Ctrl+K` 聚焦搜索、方向键切换结果和回车跳转。

生成叙述需要在项目根目录新建 `.env.local`，写入 `DEEPSEEK_API_KEY=你的密钥`，然后重新启动开发服务器。密钥只在服务端使用，不要放进 `NEXT_PUBLIC_` 环境变量，也不要提交到 Git。选满三个节点后，服务器根据作品关键词生成叙述；同一组合会缓存 24 小时，失败时显示本地短句。部署时需在托管平台的环境变量中设置同名密钥。作品关键词在 `app/data/orbit.ts`，生成提示词在 `app/lib/entanglementNarrativePrompt.ts`。

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
- 推荐 Vercel：连接 GitHub 仓库。在 Project → Settings → Environment Variables 添加 `DEEPSEEK_API_KEY`，勾选 Sensitive，仅选 Production，然后重新部署。不要上传 `.env.local`；`.env.example` 只保留变量名。
- 发布前在 Project → Firewall 为 Request Path 等于 `/api/entanglement/narrative` 添加 Rate Limit 规则，建议先从每个来源每分钟 8 次、超出返回 429 开始，观察正常访问后调整。该规则需在 Vercel 控制台发布，不能仅靠仓库代码生效。
- 叙述接口还设有每访客每分钟 6 次、每天 30 次，以及每函数实例每分钟 24 次、每天 120 次的生成限额。缓存命中和正在生成的相同组合不占新生成次数。这些内存计数与缓存仅在单个函数实例内有效，不能替代 Vercel Firewall 的跨实例限流。DeepSeek 用量需在其平台另行监控；Vercel 的费用设置不覆盖 DeepSeek 账单。
- 或者 Netlify 等平台。
