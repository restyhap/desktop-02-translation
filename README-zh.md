[English](README.md) | [简体中文](README-zh.md) | [Deutsch](README-de.md) | [Français](README-fr.md) | [Español](README-es.md) | [Italiano](README-it.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [한국어](README-ko.md)

# Desktop Translation

一款 macOS 桌面翻译应用：选中文字即刻翻译 —— 按下快捷键，弹出翻译结果窗口，并可用本地 GoldenDict 级词典查词。

基于 Tauri 2（Rust）+ React 19 构建。界面支持九种语言，所有数据都留在你自己的机器上。

## 下载

| 平台 | 架构 | 安装包 |
|---|---|---|
| macOS 11+ | Apple Silicon (aarch64) | `DesktopTranslation_{version}_aarch64.dmg` |
| macOS 11+ | Intel (x86_64) | `DesktopTranslation_{version}_x64.dmg` |

- GitHub Releases: https://github.com/restyhap/desktop-02-translation/releases
- Gitee Releases: https://gitee.com/restyhap/desktop-02-translation/releases

打开 dmg 并把应用拖出来即可；替换旧版本完全没有问题。**所有用户数据都存放在 app 包之外**（`~/Library/Application Support/com.desktop-translation/`），所以升级绝不会影响你的历史记录、生词本或设置。

> 安装包名称带有版本号 —— 请以 Releases 页面上的实际文件名为准。

### Intel 版本说明

Intel（x86_64）版本**不包含 MOSS-TTS 神经网络语音合成**；发音会回退到 macOS 系统自带的 `speechSynthesis`。原因：它的 `ort-sys` 依赖没有 x86_64-macos 的预编译库。词典查询、翻译、划词弹窗和历史记录的表现完全一致。

## 功能特性

- **划词翻译** —— 选中任意文本，按下快捷键即弹出翻译窗口；主窗口也只差一个快捷键
- **本地词典** —— 精确匹配的词条查询，提供音标、按词性分组的释义、例句和发音资源；用 `dictbuild` 构建你自己的 `.dsl.dz` 词典
- **多引擎** —— 预置 Google、DeepL、百度、有道、彩云、阿里、火山引擎；可在设置中添加自定义引擎和自定义 LLM 接口地址
- **历史与生词本** —— 每次翻译都会被保存，收藏永久保留，条目还可以归入生词本分组
- **九种界面语言** —— English / 简体中文 / Deutsch / Français / Español / Italiano / Português / Русский / 한국어
- **常驻菜单栏** —— 关闭窗口即隐藏到托盘；托盘菜单可显示窗口或退出应用
- **开机自启** —— 可选通过 LaunchAgent 静默后台启动，并带心跳看门狗实现自愈
- **发音朗读** —— 使用系统语音合成，可设置音色、语速、音高和音量
- **历史保留策略** —— 保留时长可配置；过期且未收藏的记录会在启动时以及每次修改该设置时被清除

## 默认快捷键

| 快捷键 | 操作 |
|---|---|
| `⌘ + C + C` | 翻译当前选中的文本（弹窗） |
| `⌘ + C + V` | 显示主窗口 |

两者都可以在设置中重新录制。全局按键监听运行在独立的 `keyboard-hook` 进程（rdev）中；主进程用 PING/PONG 心跳看门狗守护它，一旦它无响应就会重新拉起。

> ⚠️ 首次使用时，请在**系统设置 → 隐私与安全性 → 辅助功能**中授予本应用权限，否则全局快捷键和划词捕获都不会响应。该权限与应用代码签名绑定，因此安装新版本后可能需要重新授予。

## 从源码构建

### 环境要求

- macOS 11+（Apple Silicon 或 Intel）
- Node.js 20+ 和 [pnpm](https://pnpm.io/)
- Rust 工具链（通过 `rustup` 安装）以及 Xcode Command Line Tools

### 步骤

```bash
git clone https://github.com/restyhap/desktop-02-translation.git
cd desktop-02-translation

pnpm install
pnpm tauri dev          # dev mode (builds the keyboard-hook / dictbuild sidecars too)
```

### 质量门禁

```bash
pnpm typecheck                                    # frontend types
cargo check --manifest-path src-tauri/Cargo.toml  # Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test                                         # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

任何涉及 Intel 版本的改动都必须在两个 target 上分别检查：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin
```

### 构建安装包

```bash
pnpm tauri build
# output: src-tauri/target/release/bundle/dmg/
```

更新签名请参阅 [SIGNING_GUIDE.md](./SIGNING_GUIDE.md)。

### 构建词典

```bash
pnpm build:dictbuild   # builds src-tauri/src/bin/dictbuild.rs
# .dsl.dz dictionaries → dictionaries.db (SQLite)
```

内置词典数据约 260 MB，位于 `~/Library/Application Support/com.desktop-translation/`；词典路径可在设置中配置。

## 项目结构

```
src/                    React 19 frontend (Tailwind 4)
  pages/                translate / history / vocabulary / dictionary / settings
  storage/              invoke wrappers (the only frontend→backend entry point)
  types/settings.ts     DEFAULT_SETTINGS (must stay in sync with Rust defaults)
  lib/i18n.ts           nine-language strings

src-tauri/src/
  lib.rs                Tauri Builder wiring (plugin registration)
  app/keyboard_hook.rs  hook watchdog and event dispatch
  bin/keyboard_hook.rs  rdev global key listener sidecar (PING/PONG heartbeat)
  bin/dictbuild.rs      dictionary build tool
  db.rs                 single-source SQLite schema (apply_schema)
  *_store.rs            history / vocabulary / settings data layer
  commands/             IPC commands (thin thunks)

docs/                   requirements, database design, dictionary plan, progress archives
release.sh              dual-architecture build + dual-host release sync script
```

分层：前端只通过 `invoke` 与 Rust 通信；在 Rust 侧 `commands/` 保持轻量，业务逻辑放在 `*_store.rs` 中；SQLite schema 只在 `db::apply_schema()` 里定义一次，生产环境初始化与测试共用同一份定义。

## 技术栈

- **应用框架**：Tauri 2.12（Rust）+ React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **全局快捷键**：rdev（带心跳看门狗的 sidecar 进程）
- **存储**：通过 `sqlite` crate 使用 SQLite（词典、设置、历史记录、生词本、API 密钥）
- **语音**：Web Speech API（`speechSynthesis`）
- **Tauri 插件**：autostart (LaunchAgent)、window-state、global-shortcut、single-instance、clipboard-manager、dialog

## 许可证

本项目采用 MIT License（MIT 许可证），并附加一项非商业限制：任何形式的商业使用，都须事先获得版权所有者 restyhap 的书面许可。

## 相关链接

- 设计文档：[docs/](./docs/)
- 更新签名：[SIGNING_GUIDE.md](./SIGNING_GUIDE.md)
- 问题反馈：https://github.com/restyhap/desktop-02-translation/issues