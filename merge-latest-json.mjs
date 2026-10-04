/**
 * 合并各平台的 updater 清单片段 → latest.json
 *
 * 存在的理由：**Tauri 会先校验整份 latest.json，再比对版本号。** 只要有一个
 * platform 条目缺 url 或 signature，整个更新检查就会失败 —— 而且是**所有平台**
 * 一起失败，不只是那个残缺的平台。所以在 CI 里「每个 job 各写一份清单再拼」这种
 * 做法极易把 macOS 的更新一起弄坏。
 *
 * 因此统一走本脚本：每个平台产出一个**片段**（含真实签名与直链），合并时逐条
 * 校验，校验不过就**直接报错退出**，绝不允许写出半成品清单。
 *
 * 用法：
 *   node merge-latest-json.mjs --version 0.1.6 --notes "..." --out latest.json \
 *     frag-darwin-aarch64.json frag-darwin-x86_64.json ...
 *
 * 片段格式（每个 CI job 各自生成）：
 *   { "platform": "darwin-aarch64",
 *     "url": "https://.../DesktopTranslation_0.1.6_aarch64.app.tar.gz",
 *     "signature": "<minisign 签名串>" }
 */
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}

const version = flag("version");
const notes = flag("notes", "");
const out = flag("out", "latest.json");
const fragments = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));

if (!version) {
  console.error("缺少 --version");
  process.exit(1);
}
if (fragments.length === 0) {
  console.error("没有任何片段，拒绝写出空清单（会破坏所有平台的更新）");
  process.exit(1);
}

/**
 * 从 Tauri/minisign 的 .sig 文件内容里剥出内层签名串。
 * .sig 整体是 base64("注释\n<签名串>")，latest.json 要的是内层那串。
 */
export function signatureFromSigFile(sigText) {
  const inner = sigText.trim().split("\n").pop();
  return Buffer.from(inner, "base64").toString("utf8").trim().split("\n").pop().trim();
}

const platforms = {};
const problems = [];

for (const path of fragments) {
  let frag;
  try {
    frag = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    problems.push(`${path}: 无法解析 —— ${err.message}`);
    continue;
  }
  const { platform, url, signature } = frag;
  if (!platform || !url || !signature) {
    problems.push(`${path}: 缺少 platform/url/signature 字段`);
    continue;
  }
  if (!url.startsWith("https://")) {
    problems.push(`${platform}: url 必须是 https（生产模式 Tauri 强制 TLS）—— ${url}`);
    continue;
  }
  // minisign 签名串是 64 字节 Ed25519 的 base64（88 字符）。长度不对基本等于没签名。
  if (signature.length < 80) {
    problems.push(`${platform}: signature 长度异常（${signature.length}），疑似未剥壳或签名无效`);
    continue;
  }
  if (platforms[platform]) {
    problems.push(`${platform}: 片段重复，放弃后一个（${path}）`);
    continue;
  }
  platforms[platform] = { signature, url };
}

if (problems.length) {
  console.error("latest.json 合并失败，以下条目不合法：");
  for (const p of problems) console.error("  - " + p);
  console.error("\n已中止，未写出 latest.json（避免发布半成品清单弄坏所有平台更新）。");
  process.exit(1);
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  platforms,
};

writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(`latest.json 已写出（${out}）：version=${version}`);
for (const [k, v] of Object.entries(platforms)) {
  console.log(`  ${k}: ${v.url}`);
}