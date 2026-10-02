#!/bin/bash
# desktop-translation 一键发布脚本：构建双架构 dmg + 发布 GitHub/Gitee Releases
#
# 用法：scripts/release.sh
#   1. 读取 ~/.config/release-tokens/desktop-translation.env 中的 GH_TOKEN / GITEE_TOKEN
#      （GitHub token 已由 gh auth login 存 keyring 时，GH_TOKEN 可为空）
#   2. 从 src-tauri/tauri.conf.json 读版本号
#   3. 构建 aarch64 + x86_64 两个 dmg（Intel 版不含 moss-tts，见 Cargo.toml cfg 门控）
#   4. 创建/复用 GitHub Release 并上传资产（已存在的资产自动跳过）
#   5. 创建/复用 Gitee Release 并 attach_files 上传资产（文件名去空格）
#   6. 从 Gitee 实测下载 aarch64 dmg 校验 sha256（-s 跳过下载校验）
set -euo pipefail

REPO_GH="restyhap/desktop-02-translation"
REPO_GITEE="restyhap/desktop-02-translation"
GITEE_API="https://gitee.com/api/v5"
TOKEN_ENV="$HOME/.config/release-tokens/desktop-translation.env"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$TOKEN_ENV" ] && source "$TOKEN_ENV"

VERSION=$(grep -m1 '"version"' src-tauri/tauri.conf.json | sed 's/[^0-9.]*\([0-9.]*\).*/\1/')
echo "==> 发布版本 v$VERSION"

# ---------- 构建 ----------
echo "==> 构建 aarch64"
pnpm tauri build 2>&1 | tail -2
echo "==> 构建 x86_64 (Intel)"
pnpm tauri build --target x86_64-apple-darwin 2>&1 | tail -2

DMG_AARCH64="src-tauri/target/release/bundle/dmg/Desktop Translation_${VERSION}_aarch64.dmg"
DMG_X64="src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Desktop Translation_${VERSION}_x64.dmg"
for f in "$DMG_AARCH64" "$DMG_X64"; do [ -f "$f" ] || { echo "缺少产物: $f"; exit 1; }; done

# ---------- 代码推送 ----------
echo "==> 推送 main + tags 到双远端"
git push origin main --tags 2>&1 | tail -1
git push gitee main --tags 2>&1 | tail -1

NOTES=$(git tag -l "v$VERSION" --format='%(contents:subject)')

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
for SRC in "$DMG_AARCH64" "$DMG_X64"; do
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
for SRC in "$DMG_AARCH64" "$DMG_X64"; do
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
