# drivesync

把电脑上标记的文件夹镜像到 Google Drive，并在 Workspace 里显示在线状态和同步情况（侧栏 **Drive sync**）。
没有依赖，只需要 Node 18+ 和 [rclone](https://rclone.org)。

## 桌面应用（不用终端）

```bash
node tools/drivesync/drivesync.mjs app      # 在 ~/Applications 生成 “Drive Sync.app”
```

双击 **Drive Sync** 打开窗口（有 Chrome / Edge / Brave 时是独立的应用窗口，否则是浏览器标签页）：

- **添加文件夹**：点 “Add folder…”，用 Finder 的原生选择框选，可改在 Drive 里显示的名字、选 “Copy only”。
- **预览**：每个文件夹的 “Preview” 只比对不上传，告诉你会复制多少、会从 Drive 移除多少。
- **首次运行不会自动上传**：窗口里先看、先预览，按 “Start syncing” 才开始。
- **状态**：每个文件夹的状态、上次同步时间、文件数和大小、出错原因；右上角可暂停 / 恢复、立即同步全部。
- **设置清单**：检查 rclone、Google Drive 连接（“Connect Google Drive” 一键登录）、和 Workspace 的连接（令牌、测试），以及 “Start at login” 开关。
- 窗口只通过 `127.0.0.1` 访问，需要应用交给它的密钥，别的网页和别的程序都用不了。

窗口就是后台进程提供的一个页面：关掉窗口不影响同步。如果后台进程是旧版本，打开应用时会问你是否做一次性更新（几秒后重启，上传会接着继续）。

## 安装（只做一次）

```bash
brew install rclone
alias drivesync='node /Volumes/alex_disk/alex-portfolio-starter/tools/drivesync/drivesync.mjs'

drivesync init            # 生成配置和同步令牌，并打印要填进 Vercel 的那一行
```

1. 把打印出的 `WORKSPACE_SYNC_TOKEN=…` 加到 Vercel（Settings → Environment Variables，Sensitive、Production），重新部署。
2. `rclone config`：`n` 新建，名字填 `gdrive`，存储类型选 `drive`，其余默认，浏览器里登录并授权。
3. `drivesync doctor` 检查 rclone、Drive、Workspace 的连接和各文件夹。
4. 标记文件夹并先演练：

```bash
drivesync add /Volumes/alex_disk/ANTs
drivesync add /Users/alex/Desktop/leaves_tool
drivesync add /Volumes/alex_disk/alex-portfolio-starter
drivesync add /Volumes/alex_disk/Yasmine_Glasses_BluePrint
drivesync sync ANTs --dry-run      # 只显示会传什么、删什么，不真的动
```

5. `drivesync install`：从此登录后在后台常驻（launchd），不用再管。

## 它怎么工作

- **位置**：Drive 里的 `Sync/<文件夹名>/`；被删除或被覆盖的文件移到 `Sync-Archive/<文件夹名>/<日期>/`，保留 30 天。
- **什么时候同步**：文件一变、安静 60 秒后同步那个文件夹；每 30 分钟对账一次；每天凌晨 3 点完整对账一次并清理过期的归档。没网时跳过，联网后自动补上；失败按 5、10、20…分钟退避重试。
- **不会上传的**：`node_modules`、`.git`、`.next`、`.venv` 等可重建的目录，以及 `.env*`、`*.pem`、`id_rsa*` 等密钥，`.DS_Store`。
- **git 仓库**：`.git` 不同步，每天把完整历史打成 `git bundle` 放到 `Sync-Git/<名>.bundle`（仓库有变化才重新打包）。
- **保护**：一次要从 Drive 删除超过 30% 的文件时停下并通知；源文件夹是空的（磁盘没挂好）时不同步；外接盘没连上时显示 “disk not connected” 而不是报错。确实要继续时：`drivesync sync NAME --force`。
- **只复制不删除**：`drivesync add PATH --copy`。
- **单独排除**：`drivesync add PATH --marker` 会在文件夹里放一个 `.drivesync` 文件，可写 `{"exclude":["*.tmp"]}`。默认不写它，免得 git 仓库多出一个未跟踪文件。

## 和 Workspace 的通信

电脑每 90 秒主动向 `/api/workspace/sync` 报一次：是否在线、每个文件夹的状态、最近发生了什么。Workspace 在回复里带回待办命令（侧栏的 **Sync now**、**Pause**、**Resume**）。只有电脑向外连接，没有任何入站端口；令牌只存在 `~/.drivesync/config.json`（权限 600）和 Vercel 环境变量里。4 分钟没有消息就显示离线。

### 给 Carcosa 的开发记录（1.3.0 起）

如果某个标记的文件夹是 git 仓库，每次上报会多带几项：当前分支、检出的提交（sha）、有多少文件改了还没提交、领先或落后远程几个提交、对应的 GitHub 仓库名。**只上报这些计数和 sha，不上报任何文件内容或改动细节。** Workspace 用它和 GitHub 的提交、Vercel 的部署按 sha 对照，生成 Carcosa 页里的开发账本，并据此自动写 devlog。git 状态最多每分钟读一次。

升级后需要重启后台进程（打开 Drive Sync 应用时会提示一次性更新）。

## 命令

```
drivesync init | add | remove | list | status | sync [NAME] [--dry-run] [--force]
drivesync app | pause | resume | doctor | install | uninstall | logs
```

日志在 `~/.drivesync/logs/`。换电脑（比如以后的 Mac mini）：装 rclone，复制 `~/.drivesync/`（`folders.json` 和 `config.json`），再 `drivesync install`。
