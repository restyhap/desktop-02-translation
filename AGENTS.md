# desktop-translation — 项目须知（索引）

> 本文件自动注入每次会话。**详细内容按需读子文档**：先看下表「何时读」，匹配任务再读对应文件。
> 规则优先级：用户全局 AGENTS.md > 本文件。

## 项目一句话

Tauri 2 + React 19 桌面划词翻译应用（macOS；aarch64 + Intel x64 双架构发布，GitHub + Gitee 双平台）。

## 子文档索引（.opencode/agents/ 目录；不自动加载，按需 read）

| 文件 | 何时读 |
|---|---|
| `.opencode/agents/项目结构.md` | 首次全局探索、代码地图、设置/窗口/词典/前端改动 |
| `.opencode/agents/自启动与快捷键.md` | 全局快捷键、事件 tap、输入监控授权、开机自启动 |
| `.opencode/agents/文件同步.md` | 发布、版本号、Release、GitHub/Gitee、dmg 打包 |
| `.opencode/agents/语音与构建差异.md` | Intel/x86_64 构建、moss-tts、ort-sys |

> 布局约定与全局一致：`~/.config/opencode/AGENTS.md`（全局常驻）/ `~/.config/opencode/agents/`（跨项目知识）；本层对应项目根 `AGENTS.md`（项目常驻）/ `.opencode/agents/`（项目知识）。`.opencode` 整目录被 .gitignore 屏蔽，勿将需提交的内容放于此。

## 命令速查（照抄执行，勿自行拼凑）

```bash
# 质量门（改动代码后必须全跑；clippy 失败即阻断）
cd src-tauri && cargo check --all-targets && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo check --target x86_64-apple-darwin   # 触及 cfg 门控/依赖时必跑
pnpm typecheck

# 发布（一条命令搞定构建 + 双端上传 + 校验；版本号从 tauri.conf.json 读）
bash release.sh
```

- 前端 dev：`pnpm dev`（Vite）；整应用 dev：`pnpm tauri dev`
- 发布产物：`src-tauri/target/release/bundle/dmg/Desktop Translation_<ver>_aarch64.dmg` 与 `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/..._x64.dmg`

## 交付前必做清单

1. **版本号三处同步**：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`（发布脚本只认 tauri.conf.json）
2. **质量门全绿**：见上方命令速查（Intel 相关改动加跑双 target）
3. **新增 i18n key 九语齐备**：zh/en/de/fr/es/it/pt/ru/ko（单文件 `src/lib/i18n.ts` 内按语言分块）
4. **静默失败必须有 UI 侧可见提示**：本应用用户看不到后台日志，`eprintln!` 不是交付物
5. **要发布才** `git tag v<ver>` + `bash release.sh`（凭据在 `~/.config/release-tokens/`，勿提交仓库）

## 高频事实（不读子文档也该知道的）

- **全局快捷键 = 自建 ListenOnly tap，挂在主线程 run loop 上**（`src-tauri/src/app/keyboard_hook.rs`，手写 CoreGraphics/CoreFoundation FFI，**rdev 已移除**），没有 `keyboard-hook` 子进程，也没有 PING/PONG 心跳协议
- tap 门禁是 macOS「**输入监控**」（`kTCCServiceListenEvent`），不是「辅助功能」；mask 刻意只申请 `KeyDown|KeyUp|FlagsChanged`（少申请一位就少一类门禁）
- **授权判据只用 `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted`**（`IOKit` framework FFI，在公开 SDK 里有声明）。三个信号里只有它可靠：`CGEventTapCreate` 未授权时照样返回非 NULL（实测证伪）；`CGPreflightListenEventAccess` 只看「有没有允许记录」、**不校验 csreq 是否匹配当前二进制**，对不上时仍返回 true —— 这正是「明明授权了却没反应」的成因。`kIOHIDAccessTypeUnknown`(2) 按未授权处理（csreq 对不上正是这个值）
- **tap 回调只能在主线程，且绝不能碰 TIS/AppKit API** —— rdev 0.5.3 在回调里调 `TISGetInputSourceProperty` 会触发 `dispatch_assert_queue` → `ud2` → SIGILL 崩溃（v0.1.2 的死法，详见 `.opencode/agents/自启动与快捷键.md`）
- **授权失效的头号根因是 app bundle 没签名**，不是代码：`tauri.conf.json` 的 `bundle.macOS.signingIdentity` 必须是 `"-"`（ad-hoc）。缺了它 Tauri 只留链接器的 linker-signed 签名（Identifier 是 target-triple 哈希、`Info.plist=not bound`、无 `_CodeSignature` 目录），TCC 无法建立稳定身份 → 授权永远不生效
- 本项目 ad-hoc 签名、无 Developer ID → TCC 授权 csreq 只落 cdhash → **每次重新打包都会作废已有授权**。ad-hoc 下 macOS 不会主动弹授权窗，用户须去系统设置把开关**关掉再打开**才能刷新（单纯「已经是开的」不刷新）
- 授权故障横幅在**主页**（`src/components/ShortcutPermBanner.tsx`），不在设置页；判定式 `!listening || (listen_event !== true && key_events === 0)` —— `key_events === 0` 是反向保险，本次会话收到过事件就证明授权有效，绝不误报
- moss-tts-nano 被 cfg 门控排除出 Intel 构建（因 ort-sys 无 x86_64-macos 预编译库）
- 用户数据全在 app 包外（`~/Library/Application Support` 等），替换 .app 无损
- `scripts/`/`docs/`/`.opencode` 目录整体 gitignore（产物/私有知识区）；可提交脚本放仓库根
- 开发日志：`/Users/resty/03-repository/_inbox/YYYY/MM/DD/`
