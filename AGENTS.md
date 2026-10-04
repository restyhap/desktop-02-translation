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

## 应用内更新（v0.1.6 起）

- 已接入 `tauri-plugin-updater` + `tauri-plugin-process`；前端状态机在 `src/lib/updater.ts`（模块级 store + `useSyncExternalStore`，主页 `UpdateBanner` 与设置页「通用」分区共用同一份状态），横幅在**主页**不在设置页
- **Tauri CLI 不生成 `latest.json`**（那是 GitHub tauri-action 的活），只产出 `.app.tar.gz` + `.sig`；清单由 `release.sh` 里的内嵌 Python 拼装
- `.sig` 文件要剥一层：`signature` 字段要的是 `base64(注释\n<minisign 签名串>)` 的**内层串**，不是整个文件、也不是路径
- 清单必须 `darwin-aarch64` 与 `darwin-x86_64` **两份都写全** —— Tauri 先校验整份清单再比版本号，少一个 key 就不更新且无明显报错
- **Gitee 没有 `/releases/latest/download/` 稳定别名**（实测跳 `/repository/archive/` 直接 404），GitHub 有。故清单 **commit 进仓库**，端点用两个镜像的 raw 地址（Gitee 在前，它在目标用户网络里更可达）；`release.sh` 会先 push `latest.json` 再让客户端查得到
- `endpoints` 只在上一 个返回**非 2XX** 时才回退，网络超时不一定算非 2XX
- **ad-hoc 签名 ⇒ 每次更新后「输入监控」授权必然失效**（DR 只落 cdhash，见下条）。前端靠 `localStorage` 比对前后版本号识别「刚更新完」，主动提示用户去系统设置把开关关掉再打开；根治要买 Developer ID 换 `signingIdentity`
- 签名私钥在 `~/.tauri/desktop-translation.key`（**加密**，密码在 `~/.config/release-tokens/`）；丢了就无法再给已安装用户推更新。详见 `SIGNING_GUIDE.md`
- 清单生成**只有一个实现**：仓库根的 `merge-latest-json.mjs`（校验每条 platform 的 url/signature，不合法就失败且不写文件）。`release.sh` 与 CI 共用它，不要再另写一份拼装逻辑

## 跨平台构建现状（CI 已通，特性未补）

- `.github/workflows/ci.yml` 在**原生 runner**（macOS ×2 / windows-latest / ubuntu-22.04）跑 `tauri build --no-bundle` + clippy + typecheck。本机交叉编译不可行：Windows 需 MSVC，Linux 需 libdbus/GTK/WebKitGTK（实测 `cargo check` 会在 `libdbus-sys` 处 panic）
- **全局快捷键目前只有 macOS 实现**：`keyboard_hook.rs` 的 CGEventTap 写死了 `KeyMapping::Mac` 与 CoreGraphics `FLAG_COMMAND`，Windows 是 `VK_*` + `GetAsyncKeyState`，Wayland 则根本禁止全局按键捕获。非 macOS 下 `ensure_listener` 提前返回，**划词/快捷键不可用**，CI 只保证能编译
- `HookStatusSnapshot.supported`（= `HOOK_SUPPORTED`）用来区分「本平台不支持」与「用户没授权」—— 前端据此隐藏「输入监控」横幅（那是 macOS 独有门禁）。**不要用 `listening` 推断**，非 macOS 的 stub 同样上报 false
- `moss-tts-nano`/`ort-sys` 已限定为仅 macOS 非 x86_64（无 Win/Linux 预编译库）

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
