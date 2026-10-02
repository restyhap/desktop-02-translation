# desktop-translation — 项目须知（供 AI agent 到访即读）

> 本文件自动注入 agent 上下文。规则优先级：用户全局 AGENTS.md > 本文件。

## 一、项目概况

- Tauri 2 + React 19 桌面划词翻译应用（macOS 优先，已支持 Apple Silicon + Intel x64）
- 前端：`src/`（React + Tailwind 4）；后端：`src-tauri/src/`（Rust）
- 双 Rust 侧进程：主程序 + `keyboard-hook` 子进程（rdev 全局按键监听，见下）
- 包管理：`pnpm`（Node）+ `cargo`（Rust）

## 二、发布流程（重要改动后按此验证）

**一键发布**：仓库根 `bash release.sh`
- 构建双架构 dmg（aarch64 + x86_64）→ 推 main+tags → 同步 GitHub/Gitee Releases → 从 Gitee 下载实测校验 sha256
- 发布凭据：`~/.config/release-tokens/desktop-translation.env`（GH_TOKEN / GITEE_TOKEN，**勿提交进仓库**）；GitHub token 亦已进系统 keyring（`gh` 命令可用）
- Release 页：github.com/restyhap/desktop-02-translation / gitee.com/restyhap/desktop-02-translation

**Intel 版注意事项**：
- `moss-tts-nano`（ONNX/ort-sys）无 x86_64-macos 预编译库，已按 `cfg(not(all(target_os = "macos", target_arch = "x86_64")))` 门控——Intel 版不含 MOSS-TTS 命令，走系统 speechSynthesis
- 改动 moss-tts 相关代码时须保证两架构都能编译：`cargo check && cargo check --target x86_64-apple-darwin`

**hook 子进程（src-tauri/src/bin/keyboard_hook.rs）**：
- 走 PING/PONG 心跳协议（主进程看门狗每 3 秒 PING）；改主进程侧须维持 stdin pipped + PONG 应答格式
- 版本检查命令：`pnpm typecheck`、`cargo check`、`cargo clippy --all-targets -- -D warnings`

## 三、关键领域知识 / 历史坑

- **自启动**：tauri-plugin-autostart（LaunchAgent + `--hidden` arg）；登录早期事件 tap 可能失灵，靠心跳自愈（勿移除 PING/PONG）
- **数据发布无损伤**：用户数据全在 app 包外（`~/Library/Application Support`、LaunchAgent plist 位置固定），替换 .app 不丢数据
- **window-state 插件**：`translate`/`toast` 窗口必须在 denylist（否则启动即现且永不自动隐藏）
- **设置页**：settings 深合并 DEFAULT_SETTINGS（src/types/settings.ts）；Rust 侧默认值在同处保持同步（如 historyRetentionDays=30）
- **TTS**：MOSS 引擎已下线，TTSButton 用系统 speechSynthesis；moss 代码保留待恢复
- **i18n**：九语 UI_LOCALES（src/lib/i18n.ts），新增文案须补全部语言
- **`scripts/` 目录被整体 gitignore**（构建产物区），需提交的脚本放仓库根

## 四、文档与日志

- 开发过程日志：`/Users/resty/03-repository/_inbox/YYYY/MM/DD/`
- 已有文档：`SIGNING_GUIDE.md`（签名）、`docs/`
