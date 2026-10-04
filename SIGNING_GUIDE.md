# Tauri 更新签名与自动更新说明

本文件描述 `tauri-plugin-updater` 的密钥、制品与 `latest.json` 流程。
配套代码：`src-tauri/src/lib.rs`（注册插件）、`src/lib/updater.ts`（前端状态机）、
`release.sh`（构建 + 生成清单 + 双镜像上传）、`src-tauri/tauri.conf.json`（`plugins.updater`）。

## 密钥

| 文件 | 内容 | 能否提交仓库 |
|------|------|--------------|
| `~/.tauri/desktop-translation.key` | minisign **私钥**（加密） | **绝对不能**，丢了就无法再给已安装用户推更新 |
| `~/.tauri/desktop-translation.key.pub` | minisign 公钥 | 可以，但实际用的是内嵌进 `tauri.conf.json` 的那份 |

公钥已写入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`。

> 注意 `~/.tauri/*.key.pub` 文件本身是「base64(注释 + 公钥串)」两层结构，
> **不能**直接把整个文件内容塞进 `pubkey`。Tauri 要的是内层那串公钥
> （形如 `RWRXWhf6ONX3KmfuV4IDhnm7EbWTzdVMDIk9XQtvvZAjiq7kXLTc09nY`）。

### 生成 / 更换密钥

```bash
pnpm tauri signer generate -w ~/.tauri/desktop-translation.key
```

该命令在非交互环境下**总是生成加密私钥**，即使密码传空也会要求密码；
请把密码写进 `~/.config/release-tokens/desktop-translation.env`：

```bash
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<私钥密码>"
```

（该文件已被 gitignore，勿提交。）

换密钥后必须同步更新 `tauri.conf.json` 的 `pubkey`，否则旧客户端会拒绝新版本。

## 构建

`tauri.conf.json` 里已设 `bundle.createUpdaterArtifacts: true`，构建后额外产出：

```
src-tauri/target/release/bundle/macos/Desktop Translation.app.tar.gz
src-tauri/target/release/bundle/macos/Desktop Translation.app.tar.gz.sig
```

`release.sh` 会自动设置 `TAURI_SIGNING_PRIVATE_KEY_PATH` 后调用 `pnpm tauri build`，
不需要手动 export。

## latest.json 不会由 CLI 生成（重要）

**Tauri CLI 只产出 `.app.tar.gz` 与 `.app.tar.gz.sig`，不会生成 `latest.json`。**
生成清单是 GitHub `tauri-action` 的职责；本项目不走 action，所以清单由
`release.sh` 里的内嵌 Python 脚本拼装。

清单的必需字段是 `version` / `platforms.<target>.url` / `platforms.<target>.signature`：

```json
{
  "version": "0.1.6",
  "notes": "...",
  "pub_date": "2026-10-04T08:51:18Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<.sig 内层签名串>", "url": "https://.../DesktopTranslation_0.1.6_aarch64.app.tar.gz" },
    "darwin-x86_64": { "signature": "<...>", "url": "https://.../DesktopTranslation_0.1.6_x64.app.tar.gz" }
  }
}
```

两个坑：

1. **`.sig` 文件要剥一层。** `.sig` 整体是 `base64("注释\n<minisign 签名串>")`；
   `signature` 字段要的是内层那串，不是整个文件内容，也不是路径/URL。
2. **两个架构都要写全。** Tauri 会**先校验整份清单合法性，再比对版本号**；
   少一个 platform key 会导致完全不更新（且没有明显报错）。

## 为什么清单 commit 进仓库，而不是放 Release 资产

因为 **Gitee 没有 `/releases/latest/download/` 这种稳定别名**（实测会跳到
`/repository/archive/` 并 404），而 GitHub 有。要让两个镜像都能提供清单，只能用
仓库 raw 地址：

- `https://gitee.com/<repo>/raw/main/latest.json`（实测 200）
- `https://raw.githubusercontent.com/<repo>/main/latest.json`

这两个地址已写进 `tauri.conf.json` 的 `plugins.updater.endpoints`（Gitee 在前，
因为它在目标用户网络里更可达）。因此 `release.sh` 会把 `latest.json` 提交并推送到
两个远端的 `main` —— **清单必须先 push 出去，客户端才查得到**。

`endpoints` 是按顺序回退的，且**只在上一 个返回非 2XX 时才试下一个**；
网络超时/连不上不一定算非 2XX，所以第一个 endpoint 的可达性很关键。

## 发布流程

```bash
# 1. 三处同步版本号
#    package.json / src-tauri/Cargo.toml / src-tauri/tauri.conf.json
# 2. 质量门
cd src-tauri && cargo check --all-targets && cargo clippy --all-targets -- -D warnings
pnpm typecheck && pnpm test
# 3. 打 tag + 发布（构建 → 签名 → 生成 latest.json → 双镜像上传 → 校验）
git tag v0.1.6
bash release.sh
```

## macOS「输入监控」授权会被每次更新作废

本项目 ad-hoc 签名（`bundle.macOS.signingIdentity = "-"`），没有 Developer ID。
实测已安装 app 的 designated requirement 是：

```
$ codesign -d -r- "/Applications/Desktop Translation.app"
# designated => cdhash H"bf8607cfbdc97c44f124b1dbf711ecc2ea6fe5a3"
```

TCC 存的正是这个 DR。ad-hoc 下 DR 只落 cdhash（bundle ID 进不去），新二进制必然
是新 cdhash → 旧授权记录失效 → 快捷键静默失灵。

- 自动更新把这件事从「每次手动发版」变成「每次自动更新」，所以前端在检测到版本号
  变化（`localStorage` 记录前后对比）时，会主动提示用户去系统设置把开关**关掉再打开**。
- 根治办法是买 Apple Developer Program（$99/年）换 Developer ID 签名，
  DR 会变成 `identifier ... and anchor apple generic`，跨版本稳定。
  届时只需改 `tauri.conf.json` 的 `signingIdentity`，updater 代码不用动。

## 本地测试

```bash
# 在仓库根（有 latest.json 的地方）
python3 -m http.server 8787
# 临时把 tauri.conf.json 的 endpoints 指向
#   http://127.0.0.1:8787/latest.json
# 并设 plugins.updater.dangerousInsecureTransportProtocol = true（仅本地调试）
```