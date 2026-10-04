#!/bin/bash
# desktop-translation 一键发布脚本：构建双架构 dmg + .app.tar.gz + 发布 GitHub/Gitee Releases
#
# 用法：bash release.sh
#   1. 读取 ~/.config/release-tokens/desktop-translation.env 中的
#      GH_TOKEN / GITEE_TOKEN / TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PASSWORD
#   2. 从 src-tauri/tauri.conf.json 读版本号
#   3. 构建 aarch64 + x86_64 两个 dmg（Intel 版不含 moss-tts，见 Cargo.toml cfg 门控）
#      同时产出 tauri-plugin-updater 所需的 .app.tar.gz + .sig（需私钥环境变量）
#   4. **自己生成 latest.json**（Tauri CLI 不会生成它，见下方注释）并 commit+push，
#      使两个镜像的 raw URL 都能提供更新清单
#   5. 创建/复用 GitHub Release 并上传资产（已存在的资产自动跳过）
#   6. 创建/复用 Gitee Release 并 attach_files 上传资产（文件名去空格）
#   7. 从 Gitee 实测下载 aarch64 dmg 校验 sha256（-s 跳过下载校验）
set -euo pipefail

REPO_GH="restyhap/desktop-02-translation"
REPO_GITEE="restyhap/desktop-02-translation"
GITEE_API="https://gitee.com/api/v5"
TOKEN_ENV="$HOME/.config/release-tokens/desktop-translation.env"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$TOKEN_ENV" ] && source "$TOKEN_ENV"

# ---------- 签名密钥 ----------
# updater 的制品必须带 minisign 签名，否则客户端拒绝安装。密钥对在
# ~/.tauri/desktop-translation.key(.pub)；**丢了就再也无法给已安装用户推更新**。
# 优先用 PATH 形式（避免把私钥内容写进 shell 历史/进程环境）：
export TAURI_SIGNING_PRIVATE_KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/desktop-translation.key}"
if [ ! -f "$TAURI_SIGNING_PRIVATE_KEY_PATH" ]; then
  echo "找不到更新签名私钥: $TAURI_SIGNING_PRIVATE_KEY_PATH" >&2
  echo "生成方式: pnpm tauri signer generate -w ~/.tauri/desktop-translation.key" >&2
  exit 1
fi
[ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ] && export TAURI_SIGNING_PRIVATE_KEY_PASSWORD

VERSION=$(grep -m1 '"version"' src-tauri/tauri.conf.json | sed 's/[^0-9.]*\([0-9.]*\).*/\1/')
echo "==> 发布版本 v$VERSION"

# ---------- 构建 ----------
# 注意：不要用 `| tail -2` 吞输出。构建失败时（如 bundle_dmg.sh 报错）Tauri 只给一行
# 无信息量的 "failed to run bundle_dmg.sh"，真正的原因在被吞掉的 stderr 里。
# 这里把完整日志落盘，失败时再打印末尾 40 行。
LOGS="$(mktemp -d)"
build_arch() {
  local name="$1"; shift
  echo "==> 构建 $name"
  local log="$LOGS/$name.log"
  if ! pnpm tauri build "$@" > "$log" 2>&1; then
    echo "构建失败: $name（日志 $log）" >&2
    tail -40 "$log" >&2
    exit 1
  fi
  tail -2 "$log"
}

build_arch aarch64
build_arch "x86_64 (Intel)" --target x86_64-apple-darwin

DMG_AARCH64="src-tauri/target/release/bundle/dmg/Desktop Translation_${VERSION}_aarch64.dmg"
DMG_X64="src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Desktop Translation_${VERSION}_x64.dmg"
for f in "$DMG_AARCH64" "$DMG_X64"; do [ -f "$f" ] || { echo "缺少产物: $f"; exit 1; }; done

# ---------- updater 制品 ----------
# createUpdaterArtifacts=true 时 Tauri 额外产出：
#   src-tauri/target/release/bundle/macos/Desktop Translation.app.tar.gz(+.sig)
#   src-tauri/target/<target>/release/bundle/macos/...  （交叉编译时）
# 统一改名为无空格的 <product>-<ver>-<arch>.app.tar.gz，避免 URL 里的空格。
MACOS_AARCH64="src-tauri/target/release/bundle/macos/Desktop Translation.app.tar.gz"
MACOS_X64="src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Desktop Translation.app.tar.gz"
for f in "$MACOS_AARCH64" "$MACOS_X64"; do [ -f "$f" ] || { echo "缺少 updater 产物: $f（检查 createUpdaterArtifacts 与签名私钥）"; exit 1; }; done

ART_AARCH64="$TMP/DesktopTranslation_${VERSION}_aarch64.app.tar.gz"
ART_X64="$TMP/DesktopTranslation_${VERSION}_x64.app.tar.gz"
cp "$MACOS_AARCH64" "$ART_AARCH64"
cp "$MACOS_X64" "$ART_X64"
cp "$MACOS_AARCH64.sig" "$ART_AARCH64.sig"
cp "$MACOS_X64.sig" "$ART_X64.sig"

# ---------- latest.json ----------
# **Tauri CLI 不会生成 latest.json**（那是 GitHub tauri-action 的活）。它只产出
# .app.tar.gz + .sig，清单得自己拼。必需字段：version / platforms.<target>.url /
# platforms.<target>.signature；注意 Tauri 会**先校验整份文件再比版本号**，
# 所以 darwin-aarch64 与 darwin-x86_64 两份都必须完整。
#
# 为什么清单要 commit 进仓库而不是当 Release 资产：
#   GitHub 有 /releases/latest/download/latest.json 这种稳定别名，**Gitee 没有**
#   （实测会跳到 /repository/archive/ 直接 404）。所以改用两个镜像的 raw 地址：
#     gitee.com/<repo>/raw/main/latest.json              （实测 200）
#     raw.githubusercontent.com/<repo>/main/latest.json
#   代价是清单要先 push 到 main 才会生效 —— 顺序上必须先于客户端检查。
NOTES=$(git tag -l "v$VERSION" --format='%(contents:subject)')

# 清单生成交给仓库根的 merge-latest-json.mjs —— 与 CI 共用同一份实现。
# 这里先写两个片段（各自含**真实签名**与直链），再合并；脚本会逐条校验，
# 任何一条不合法就直接失败且**不写出清单**，避免半成品 latest.json 弄坏
# 所有平台的更新（Tauri 会先校验整份清单再比版本号）。
SIG_BASE="https://github.com/$REPO_GH/releases/download/v$VERSION"
node -e '
const fs = require("fs");
const [sigPath, out, platform, url] = process.argv.slice(1);
const raw = fs.readFileSync(sigPath, "utf8").trim();
const signature = Buffer.from(raw.split("\n").pop(), "base64").toString("utf8").trim().split("\n").pop().trim();
fs.writeFileSync(out, JSON.stringify({ platform, url, signature }, null, 2));
' "$ART_AARCH64.sig" "$TMP/frag-darwin-aarch64.json" "darwin-aarch64" \
  "$SIG_BASE/$(basename "$ART_AARCH64")"
node -e '
const fs = require("fs");
const [sigPath, out, platform, url] = process.argv.slice(1);
const raw = fs.readFileSync(sigPath, "utf8").trim();
const signature = Buffer.from(raw.split("\n").pop(), "base64").toString("utf8").trim().split("\n").pop().trim();
fs.writeFileSync(out, JSON.stringify({ platform, url, signature }, null, 2));
' "$ART_X64.sig" "$TMP/frag-darwin-x86_64.json" "darwin-x86_64" \
  "$SIG_BASE/$(basename "$ART_X64")"

node merge-latest-json.mjs --version "$VERSION" --notes "$NOTES" --out latest.json \
  "$TMP/frag-darwin-aarch64.json" "$TMP/frag-darwin-x86_64.json"

# ---------- 代码推送 ----------
# latest.json 必须**先于**客户端检查到达两个远端的 main，否则 app 拉到的还是上一版清单。
echo "==> 推送 main + tags + latest.json 到双远端"
if ! git diff --quiet -- latest.json 2>/dev/null || [ -n "$(git status --porcelain -- latest.json)" ]; then
  git add latest.json
  git commit -m "chore(release): update latest.json to v$VERSION" 2>&1 | tail -1
fi
git push origin main --tags 2>&1 | tail -1
git push gitee main --tags 2>&1 | tail -1

# ---------- GitHub ----------
# ---------- GitHub ----------
# 创建 v$VERSION 发行版；失败（已存在等）则回退查询现有 release 的 id
GH_JSON=$(curl -s -H "Authorization: Bearer ${GH_TOKEN:?需要 GH_TOKEN}" \
  -X POST https://api.github.com/repos/$REPO_GH/releases \
  -d "{\"tag_name\":\"v$VERSION\",\"name\":\"v$VERSION\",\"body\":\"$NOTES\",\"draft\":false,\"prerelease\":false}" 2>/dev/null || echo "{}")
GH_MSG=$(echo "$GH_JSON" | jq -r '.message // ""')
GITHUB_RELEASE_ID=$(echo "$GH_JSON" | jq -r '.id // ""')
if [ -z "$GITHUB_RELEASE_ID" ]; then
  GITHUB_RELEASE_ID=$(curl -s -H "Authorization: Bearer ${GH_TOKEN:?}" \
    https://api.github.com/repos/$REPO_GH/releases/tags/v$VERSION | jq -r '.id')
fi
echo "==> GitHub release id=$GITHUB_RELEASE_ID (msg: ${GH_MSG:-created})"
for SRC in "$DMG_AARCH64" "$DMG_X64" "$ART_AARCH64" "$ART_AARCH64.sig" "$ART_X64" "$ART_X64.sig"; do
  NAME=$(basename "$SRC" | tr -d ' ')
  UPLOADED=$(curl -s -H "Authorization: Bearer ${GH_TOKEN:?}" \
    "https://api.github.com/repos/$REPO_GH/releases/$GITHUB_RELEASE_ID/assets" | jq -r ".[].name" | grep -c "^$NAME$" || true)
  if [ "$UPLOADED" != "0" ]; then echo "  跳过已上传: $NAME"; continue; fi
  cp "$SRC" "$TMP/$(basename "$SRC" | tr -d ' ')"
  curl -s -X POST -H "Authorization: Bearer ${GH_TOKEN:?}" -H "Content-Type: application/octet-stream" \
    --data-binary @"$TMP/$(basename "$SRC" | tr -d ' ')" \
    "https://uploads.github.com/repos/$REPO_GH/releases/$GITHUB_RELEASE_ID/assets?name=$NAME" \
    | jq -r '"  uploaded: \(.name) \(.state)"'
done

# ---------- Gitee ----------
# 优先复用 tag 自动创建的发行版；找不到再显式创建
GITEE_RELEASE_ID=$(curl -s "$GITEE_API/repos/$REPO_GITEE/releases/tags/v$VERSION?access_token=${GITEE_TOKEN:?}" | jq -r '.id')
if [ "$GITEE_RELEASE_ID" = "null" ]; then
  GITEE_RELEASE_ID=$(curl -s -X POST "$GITEE_API/repos/$REPO_GITEE/releases" \
    -d "access_token=${GITEE_TOKEN:?}" -d "tag_name=v$VERSION" -d "name=v$VERSION" \
    -d "target_commitish=main" --data-urlencode "body=$NOTES" | jq -r '.id')
fi
echo "==> Gitee release id=$GITEE_RELEASE_ID"
for SRC in "$DMG_AARCH64" "$DMG_X64" "$ART_AARCH64" "$ART_AARCH64.sig" "$ART_X64" "$ART_X64.sig"; do
  NAME=$(basename "$SRC" | tr -d ' ')
  EXIST=$(curl -s "$GITEE_API/repos/$REPO_GITEE/releases/$GITEE_RELEASE_ID/attach_files?access_token=${GITEE_TOKEN:?}" \
    | jq -r '.[].name' | grep -c "^$NAME$" || true)
  [ "$EXIST" != "0" ] && { echo "  跳过已上传: $NAME"; continue; }
  cp "$SRC" "$TMP/$NAME"
  curl -s -X POST "$GITEE_API/repos/$REPO_GITEE/releases/$GITEE_RELEASE_ID/attach_files" \
    -F "access_token=${GITEE_TOKEN:?}" -F "can_read=true" -F "file=@$TMP/$NAME" \
    | jq -r '"  uploaded: \(.name)"'
done

# ---------- Gitee 下载校验 ----------
echo "==> Gitee 下载校验：aarch64 dmg"
curl -sL -o "$TMP/verify.dmg" \
  "https://gitee.com/$REPO_GITEE/releases/download/v$VERSION/$(basename "$DMG_AARCH64" | tr -d ' ')"
A=$(shasum -a 256 "$TMP/verify.dmg" | cut -c1-16)
B=$(shasum -a 256 "$DMG_AARCH64" | cut -c1-16)
[ "$A" = "$B" ] && echo "  sha256 校验一致 ($A)" || { echo "  校验不一致: gitee=$A local=$B"; exit 1; }

echo "==> 发布完成 v$VERSION"
echo "  GitHub: https://github.com/$REPO_GH/releases/tag/v$VERSION"
echo "  Gitee:  https://gitee.com/$REPO_GITEE/releases/v$VERSION"
echo "  更新清单: https://gitee.com/$REPO_GITEE/raw/main/latest.json"
echo "  提醒: 本应用为 ad-hoc 签名，更新后用户需在系统设置重新授予「输入监控」"
