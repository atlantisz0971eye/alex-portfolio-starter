# drivesync

把电脑上标记的文件夹镜像到 Google Drive，并在 Workspace 里显示在线状态和同步情况（侧栏 **Drive sync**）。
一个文件、没有依赖，只需要 Node 18+ 和 [rclone](https://rclone.org)。

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

## 命令

```
drivesync init | add | remove | list | status | sync [NAME] [--dry-run] [--force]
drivesync doctor | install | uninstall | logs
```

日志在 `~/.drivesync/logs/`。换电脑（比如以后的 Mac mini）：装 rclone，复制 `~/.drivesync/`（`folders.json` 和 `config.json`），再 `drivesync install`。
