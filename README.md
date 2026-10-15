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

## Alex Workspace · 阅读室（第一版）

私人阅读室位于 `/workspace`。它提供跨设备资料库、PDF/文本阅读、DeepSeek 中文导读、段落翻译和基于当前资料的问答。当前支持 PDF、TXT、Markdown、HTML，单文件最多 25 MB；整本书的可提取文本完整保存，阅读界面每段加载 3 万字符，并可前后翻阅；扫描版 PDF 暂无 OCR。对超过 3 万字符的资料，导读和问答会使用开头、中段、结尾的节选，界面会明确标记范围。Google、Notion 和多 AI 账号接入留待后续模块。

在 Vercel 项目中创建 **Private Blob Store** 并连接项目，使 `BLOB_READ_WRITE_TOKEN` 自动注入到环境变量。然后设置：

- `WORKSPACE_ACCESS_KEY`：仅你知道的随机长密钥，至少 20 个字符。
- `WORKSPACE_SESSION_SECRET`：独立的随机密钥，至少 32 个字符，用于签署登录会话。
- `DEEPSEEK_API_KEY`：沿用公开站点叙述功能已有的服务端密钥。

本地开发时把这些值放在未提交的 `.env.local`。访问密钥和 Blob 令牌都不得以 `NEXT_PUBLIC_` 开头。配置缺失时，Workspace 会保持锁定或提示资料库尚未连接。私人文档只存入 Private Blob Store，并由已登录的服务端接口读取；会话使用 HttpOnly Cookie。第一版登录限流是函数实例内的兜底措施，发布前还应在 Vercel Firewall 为 `/api/workspace/session` 和 `/api/workspace/assistant` 配置跨实例限流。

## Alex Workspace · 邮件（Gmail 只读）

Workspace 顶部的 **Mail** 标签用于查看和搜索最多两个 Gmail 账号。授权范围只有 `gmail.readonly`：不能发信、删除或修改邮件。邮件正文只作为纯文本显示，不加载远程图片；只有点击 “Summarize” 或提问时，那一封邮件的文字才会发送给 DeepSeek。刷新令牌用 AES-256-GCM 加密后存入 Private Blob Store，没有 `MAIL_TOKEN_KEY` 就无法解开。

配置步骤：

1. 在 Google Cloud Console 新建项目，启用 **Gmail API**。
2. 配置 OAuth 同意屏幕（外部用户），在“数据访问”里添加范围 `https://www.googleapis.com/auth/gmail.readonly`。应用处于“测试”状态时，只有列入测试用户的账号能授权，且刷新令牌约 7 天过期，需要重新连接；个人使用可将应用发布到“正式版”（会出现“未验证应用”提示，点击继续即可）。
3. 创建 **OAuth 客户端 ID**（Web 应用），授权重定向 URI 填：
   - `https://alex-portfolio-sepia.vercel.app/api/workspace/mail/callback`
   - 本地调试再加 `http://localhost:3000/api/workspace/mail/callback`
4. 在 Vercel 设置环境变量（Sensitive）：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`，以及随机的 `MAIL_TOKEN_KEY`（至少 32 个字符，丢失后需要重新连接所有账号）。重新部署后在 Mail 页点击 “Connect Gmail”。

## Alex Workspace · 日历

Workspace 的 **Calendar** 是自带的日历，不依赖 Google。事件存放在 Private Blob Store 的 `workspace/calendar/data.json`，支持新建、编辑、删除、全天事件、分类，以及按每天/每周/每月/每年重复（按事件所在时区的本地时间计算，跨夏令时也保持原时刻）。桌面端是周视图，手机端是按天的议程列表。

**Assistant**（侧栏 / 手机底部标签栏，或 ⌘K / Ctrl+K）是跨模块的 DeepSeek 全局助手，可以：读取日历、Gmail（只读）和资料库，用来总结和查找（例如“总结本周和未读邮件”“从最近的邮件里找需要加进日历的事”）；以及**提议**日历的新增、修改和删除。它**不会直接写入**：每条提议都显示为卡片（含冲突提示），需要你逐条点 Confirm 才生效，删除同样要确认。邮件和资料库保持只读，助手不能发信或修改它们。

助手用工具读取数据时，界面会列出它做了什么（例如 “Searching mail: …”）。被读取的日历条目、邮件正文片段和书中段落会发送给 DeepSeek；邮件、日程标题和书中文字都被当作不可信的外部内容，其中的指令不会被执行。

日历暂时没有到点提醒。
