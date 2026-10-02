# desktop-translation — 项目须知（索引）

> 本文件自动注入每次会话。**详细内容按需读子文档**：先看下表「何时读」，匹配任务再读对应文件。
> 规则优先级：用户全局 AGENTS.md > 本文件。

## 项目一句话

Tauri 2 + React 19 桌面划词翻译应用（macOS；aarch64 + Intel x64 双架构发布，GitHub + Gitee 双平台）。

## 子文档索引（.opencode/agents/ 目录；不自动加载，按需 read）

| 文件 | 何时读 |
|---|---|
| `.opencode/agents/文件同步.md` | 发布/版本号/Release/GitHub/Gitee/dmg 打包 |
| `.opencode/agents/自启动与快捷键.md` | 自启动、快捷键、keyboard-hook、全局按键监听 |
| `.opencode/agents/语音与构建差异.md` | Intel/x86_64 构建、moss-tts、ort-sys |
| `.opencode/agents/项目结构.md` | 首次全局探索、代码地图、设置/窗口/词典改动 |

> 布局约定与全局一致：`~/.config/opencode/AGENTS.md`（全局常驻）/ `~/.config/opencode/agents/`（跨项目知识）；本层对应项目根 `AGENTS.md`（项目常驻）/ `.opencode/agents/`（项目知识）。`.opencode` 整目录被 .gitignore 屏蔽，勿将需提交的内容放于此。

## 高频事实（不读子文档也该知道的）

- 质量门：`pnpm typecheck` + `cargo check`（涉 Intel 须双 target：`cargo check --target x86_64-apple-darwin`）+ `cargo clippy --all-targets -- -D warnings`
- 一键发布：仓库根 `bash release.sh`（凭据在 `~/.config/release-tokens/`，勿提交仓库）
- keyboard-hook 有 PING/PONG 心跳自愈协议（自启动早期事件 tap 失灵场景），动 hook 相关代码先读 `.opencode/agents/自启动与快捷键.md`
- moss-tts-nano 被 cfg 门控排除出 Intel 构建（因 ort-sys 无 x86_64-macos 预编译库）
- 用户数据全在 app 包外（`~/Library/Application Support` 等），替换 .app 无损
- 新增 i18n key 必须九语齐备（zh/en/de/fr/es/it/pt/ru/ko）
- `scripts/`/`docs/`/`.opencode` 目录整体 gitignore（产物/私有知识区）；可提交脚本放仓库根
- 开发日志：`/Users/resty/03-repository/_inbox/YYYY/MM/DD/`
