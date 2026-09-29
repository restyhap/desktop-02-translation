/**
 * 词典释义结构化解析 — 从 src/lib/parseDefinition.ts 移植 (原样保留)
 * dictbuild 输出的 definition 是干净 HTML (仅含 b/i/u/sub/sup + <br> 分行)
 */
import type { DictLine } from "@/lib/types";

const POS_WORDS =
  "noun|verb|adjective|adverb|preposition|conjunction|pronoun|interjection|" +
  "abbreviation|suffix|prefix|combining form|determiner|predeterminer|" +
  "auxiliary verb|exclamation|particle|phrasal verb|idiom|symbol|prefix";
const POS_RX = new RegExp(
  `(?:transitive |intransitive |also )*(${POS_WORDS})(?:s)?`,
  "i",
);

function stripTagPrefix(line: string, prefix: string): string {
  return line.slice(prefix.length).trim();
}

export function parseDefinition(html: string): DictLine[] {
  const lines = html
    .split("<br>")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const out: DictLine[] = [];

  for (const raw of lines) {
    const line = raw;

    // 词性: <b><i>intransitive verb</i></b>
    let m = line.match(/^<b><i>((?:transitive |intransitive |also )*.+?)<\/i><\/b>/i);
    if (m) {
      const label = m[1].replace(POS_RX, "$1").trim();
      out.push({ type: "pos", label, html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 词性: 罗马数字 <b>I. </b>
    m = line.match(/^<b>\s*([IVXL]+)\.\s*<\/b>/i);
    if (m) {
      out.push({ type: "pos", label: m[1].toUpperCase(), html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 分组标题: 全大写 <b>MOVE FAST ON FOOT</b>
    m = line.match(/^<b>([A-Z][A-Z ,'()-]{3,})<\/b>/);
    if (m) {
      out.push({ type: "group", label: m[1], html: "" });
      continue;
    }

    // 编号义项: <b>1.</b>
    m = line.match(/^<b>\s*(\d{1,3})\.?\s*<\/b>/);
    if (m) {
      out.push({ type: "sense", label: m[1], html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 字母子义项: <b>a.</b>
    m = line.match(/^<b>([a-z])\.<\/b>/);
    if (m) {
      out.push({ type: "subsense", label: m[1], html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 元信息: Etymology / Date / Origin / Usage 等
    m = line.match(
      /^<b>(Etymology|Date|Origin|Usage|Synonyms|Antonyms|Collocations|Pronunciation|Derivatives|Language):?\s*<\/b>/i,
    );
    if (m) {
      out.push({ type: "meta", label: m[1], html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 例句: • 开头
    if (/^[•◦●]\s*/.test(line)) {
      out.push({ type: "example", html: line.replace(/^[•◦●]\s*/, "") });
      continue;
    }

    out.push({ type: "text", html: line });
  }

  return out;
}
