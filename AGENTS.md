# desktop-translation — 项目须知（索引）

> 本文件自动注入每次会话。**详细内容按需读子文档**：先看下表「何时读」，匹配任务再读对应文件。
> 规则优先级：用户全局 AGENTS.md > 本文件。

## 会话约定

- 【语言】用中文回复；代码注释用中文。（与用户全局规范一致）

## 项目一句话

Tauri 2 + React 19 桌面划词翻译应用（macOS + Windows 划词；macOS aarch64/x64 + Windows x64 + Linux x64 三平台发布，GitHub + Gitee 双远端）。macOS 是主战场。

## 子文档索引（.opencode/agents/ 目录；不自动加载，按需 read）

| 文件 | 何时读 |
|---|---|
| `.opencode/agents/项目结构.md` | 首次全局探索、代码地图、设置/窗口/词典/前端改动 |
| `.opencode/agents/自启动与快捷键.md` | 全局快捷键、事件 tap、WH_KEYBOARD_LL、输入监控授权、开机自启动 |
| `.opencode/agents/文件同步.md` | 发布、版本号、tag→CI、Release、GitHub/Gitee、安装包打包 |
| `.opencode/agents/语音与构建差异.md` | 跨平台构建、Intel/moss-tts、ort-sys |

> 布局约定与全局一致：`~/.config/opencode/AGENTS.md`（全局常驻）/ `~/.config/opencode/agents/`（跨项目知识）；本层对应项目根 `AGENTS.md`（项目常驻）/ `.opencode/agents/`（项目知识）。`.opencode` 整目录被 .gitignore 屏蔽，勿将需提交的内容放于此。

## 命令速查（照抄执行，勿自行拼凑）

```bash
# 质量门（改动代码后必须全跑；clippy 失败即阻断）
cd src-tauri && cargo check --all-targets && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo check --target x86_64-apple-darwin   # 触及 cfg 门控/依赖时必跑
pnpm typecheck
pnpm test

# 发布：改版本号三处 → 提交 → 打 annotated tag 推两个远端 → CI 出四平台产物
git tag -a v0.1.7 -m "v0.1.7 说明"
git push origin main --tags && git push gitee main --tags

# 本机 macOS 双架构快捷构建（**不是发布入口**，且会拒绝覆盖多平台清单）
bash release.sh
```

- 前端 dev：`pnpm dev`（Vite）；整应用 dev：`pnpm tauri dev`
- 发布产物由 CI 产出（收集时去空格）：`DesktopTranslation_{ver}_{aarch64|x64}.dmg`（macOS）、`DesktopTranslation_{ver}_x64-setup.exe`（NSIS）、`DesktopTranslation_{ver}_amd64.AppImage`
- **CI 必须用 `npm ci` 不能用 `pnpm`**：仓库按约定只提交 `package-lock.json`（`pnpm-lock.yaml` 被 gitignore），`--frozen-lockfile` / `cache: pnpm` 会直接失败

## 交付前必做清单

1. **版本号三处同步**：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`（发布脚本只认 tauri.conf.json）
2. **质量门全绿**：见上方命令速查（触及 cfg 门控/依赖时加跑双 macOS target；Windows/Linux 代码靠 CI 四平台验证）
3. **新增 i18n key 九语齐备**：zh/en/de/fr/es/it/pt/ru/ko（单文件 `src/lib/i18n.ts` 内按语言分块）
4. **静默失败必须有 UI 侧可见提示**：本应用用户看不到后台日志，`eprintln!` 不是交付物。**「本平台不支持」也算静默失败**（Linux 划词已在主页出中性提示 `app.shortcutUnsupported`）
5. **要发布才**打 annotated tag 推两个远端（凭据在 `~/.config/release-tokens/`，勿提交仓库）；CI secrets 需 `GH_TOKEN`/`GITEE_TOKEN`/`TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 四个齐全

## 应用内更新（v0.1.6 起）

- 已接入 `tauri-plugin-updater` + `tauri-plugin-process`；前端状态机在 `src/lib/updater.ts`（模块级 store + `useSyncExternalStore`，主页 `UpdateBanner` 与设置页「通用」分区共用同一份状态），横幅在**主页**不在设置页
- **Tauri CLI 不生成 `latest.json`**（那是 GitHub tauri-action 的活），只产出 `.app.tar.gz` + `.sig`；清单由 `release.sh` 与 CI **共用的 `merge-latest-json.mjs`** 拼装
- `.sig` 文件要剥一层：`signature` 字段要的是 `base64(注释\n<minisign 签名串>)` 的**内层串**，不是整个文件、也不是路径
- 清单必须 `darwin-aarch64` / `darwin-x86_64` / `windows-x86_64` / `linux-x86_64` **四份都写全** —— Tauri 先校验整份清单再比版本号，少一个 key 就不更新且无明显报错。这也是 `release.sh` 加「拒绝覆盖多平台清单」守卫的原因
- **Gitee 没有 `/releases/latest/download/` 稳定别名**（实测跳 `/repository/archive/` 直接 404），GitHub 有。故清单 **commit 进仓库**，端点用两个镜像的 raw 地址（Gitee 在前，它在目标用户网络里更可达）；`release.sh` 会先 push `latest.json` 再让客户端查得到
- `endpoints` 只在上一个返回**非 2XX** 时才回退，网络超时不一定算非 2XX
- `plugins.updater.pubkey` 必须写 `.key.pub` 的**内容**，写文件路径会让四平台构建全挂在 `failed to decode pubkey`（v0.1.6 首次发布即因此失败）
- **ad-hoc 签名 ⇒ 每次更新后「输入监控」授权必然失效**（DR 只落 cdhash，见下条）。前端靠 `localStorage` 比对前后版本号识别「刚更新完」，主动提示用户去系统设置把开关关掉再打开；根治要买 Developer ID 换 `signingIdentity`
- 签名私钥在 `~/.tauri/desktop-translation.key`（**加密**，密码在 `~/.config/release-tokens/`）；丢了就无法再给已安装用户推更新。详见 `SIGNING_GUIDE.md`
- 清单生成**只有一个实现**：仓库根的 `merge-latest-json.mjs`（校验每条 platform 的 url/signature，不合法就失败且不写文件）。`release.sh` 与 CI 共用它，不要再另写一份拼装逻辑

## 跨平台构建现状（CI 四平台已通；Windows 划词已实现但未实机验证）

- `.github/workflows/ci.yml` 在**原生 runner**（macOS ×2 / windows-latest / ubuntu-22.04）跑 `tauri build --no-bundle` + clippy + typecheck。本机交叉编译不可行：Windows 需 MSVC，Linux 需 libdbus/GTK/WebKitGTK（实测 `cargo check` 会在 `libdbus-sys` 处 panic）
- **划词拆成「平台中立核心 + 平台事件源」**：`hook_core.rs`（规则解析/序列匹配/状态/弹窗动作，全平台编译）+ 三个事件源，`app/mod.rs` 按 cfg 路由
  - macOS `keyboard_hook.rs`：自建 ListenOnly CGEventTap（挂主线程 run loop）+ 输入监控授权自愈
  - Windows `keyboard_hook_windows.rs`：`WH_KEYBOARD_LL` 低级键盘钩子，装在**带消息泵的专用线程**上，**所有按键 `CallNextHookEx` 放行**（第一个 Ctrl+C 必须由系统真实复制，第二个才触发划词）
  - 其余 `keyboard_hook_unsupported.rs`：同 API 空实现，`install_raw_sink` 恒 false ⇒ 不启消费线程
- 键码查表产出 `KeyEntry { id, modifier_bit }`，用 `OnceLock` 缓存整表，**修饰键位由 `modifier_bit(KeyMappingId)` 按具名变体左右合并**（`KeyModifiers` 是 bitflags、位序不可枚举，别用它判）。取数方式分平台：
  - macOS：`build_key_table(256, |c| KeyMapping::Mac(c))`，`keycode` crate 编译期从 Chromium `keycode_converter_data.inc` 生成，可用
  - Windows：**不能用 `KeyMapping::Win(vk)`** —— 该 crate 把六个编号空间写进同一个无 guard 的 `match` arm，反查必然串台（`Win(0x41)` 返回 `F7`），且 `KeyMap.win` 列本身误解析成了 evdev 值（`KeyA` 的 win=30，真实 `VK_A`=65）。改为 `vk_code_name(vk)`（103 个 VK）→ `hook_core::lookup_code(name)`，键名数据仍出自同一份 Chromium 数据，不硬编码 `KeyMappingId` 变体名
- 跨平台事件表示 `RawInput{KeyDown,KeyUp,Modifiers(u8)}`，`Modifiers` 是**整体覆盖**语义，让 macOS FlagsChanged 与 Windows 手工 held 集合共用同一套匹配代码
- **Windows 无需任何授权** ⇒ `supported=true`、`listen_event` 恒 true、`open_listen_event_settings()` 恒 false；**Linux `supported=false`**（Wayland 禁止捕获全局按键，非授权问题）
- `HookStatusSnapshot.supported` 用来区分「本平台不支持」与「用户没授权」—— 前端据此分别渲染能力缺失横幅与授权告警横幅。**不要用 `listening` 推断**，非 macOS 的 stub 同样上报 false
- 默认快捷键按平台分：Windows `Ctrl+C+C` / `Ctrl+C+V`（⌘=Win 键会撞小组件面板/剪贴板历史），其余 `⌘+C+C` / `⌘+C+V`
- **Windows 划词只有编译级验证**（CI build + clippy），功能未在 Windows 实机验证过 —— 改动后必须找实机回归
- `moss-tts-nano`/`ort-sys` 已限定为仅 `cfg(all(macos, not(x86_64)))`（无 Intel/Win/Linux 预编译库），非 macOS 走系统 `speechSynthesis`
- `tauri-plugin-global-shortcut` 在 `Cargo.toml` + capabilities 里存在但**零引用**：其底层 `global-hotkey` 只会 `RegisterHotKey`，表达不了连击语义且会吞键

## 高频事实（不读子文档也该知道的）

- **全局快捷键 = 自建钩子，无第三方监听库、无 sidecar 进程、无心跳协议**：macOS 是挂在主线程 run loop 的 ListenOnly CGEventTap（`keyboard_hook.rs`，手写 CoreGraphics/CoreFoundation FFI，**rdev 已移除**），Windows 是 `WH_KEYBOARD_LL`（`keyboard_hook_windows.rs`）
- tap 门禁是 macOS「**输入监控**」（`kTCCServiceListenEvent`），不是「辅助功能」；mask 刻意只申请 `KeyDown|KeyUp|FlagsChanged`（少申请一位就少一类门禁）
- **授权判据只用 `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted`**（`IOKit` framework FFI，在公开 SDK 里有声明）。三个信号里只有它可靠：`CGEventTapCreate` 未授权时照样返回非 NULL（实测证伪）；`CGPreflightListenEventAccess` 只看「有没有允许记录」、**不校验 csreq 是否匹配当前二进制**，对不上时仍返回 true —— 这正是「明明授权了却没反应」的成因。`kIOHIDAccessTypeUnknown`(2) 按未授权处理（csreq 对不上正是这个值）
- **tap 回调只能在主线程，且绝不能碰 TIS/AppKit API** —— rdev 0.5.3 在回调里调 `TISGetInputSourceProperty` 会触发 `dispatch_assert_queue` → `ud2` → SIGILL 崩溃（v0.1.2 的死法，详见 `.opencode/agents/自启动与快捷键.md`）
- **授权失效的头号根因是 app bundle 没签名**，不是代码：`tauri.conf.json` 的 `bundle.macOS.signingIdentity` 必须是 `"-"`（ad-hoc）。缺了它 Tauri 只留链接器的 linker-signed 签名（Identifier 是 target-triple 哈希、`Info.plist=not bound`、无 `_CodeSignature` 目录），TCC 无法建立稳定身份 → 授权永远不生效
- 本项目 ad-hoc 签名、无 Developer ID → TCC 授权 csreq 只落 cdhash → **每次重新打包都会作废已有授权**。ad-hoc 下 macOS 不会主动弹授权窗，用户须去系统设置把开关**关掉再打开**才能刷新（单纯「已经是开的」不刷新）
- 授权故障横幅在**主页**（`src/components/ShortcutPermBanner.tsx`），不在设置页；判定式 `!listening || (listen_event !== true && key_events === 0)` —— `key_events === 0` 是反向保险，本次会话收到过事件就证明授权有效，绝不误报。`!supported`（Linux）走**另一个分支**渲染中性色能力缺失横幅，不再 `return null`
- moss-tts-nano 被 cfg 门控排除出 Intel 构建（因 ort-sys 无 x86_64-macos 预编译库）
- 用户数据全在 app 包外，替换 .app / 重装安装包都无损：macOS `~/Library/Application Support/com.desktop-translation/`、Windows `%APPDATA%\com.desktop-translation\`、Linux `~/.local/share/com.desktop-translation/`
- `scripts/`/`docs/`/`.opencode` 目录整体 gitignore（产物/私有知识区）；可提交脚本放仓库根
- 开发日志：`/Users/resty/03-repository/_inbox/YYYY/MM/DD/`
