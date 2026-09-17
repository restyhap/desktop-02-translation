/**
 * 词典释义结构化解析
 *
 * dictbuild 输出的 definition 是干净 HTML (仅含 b/i/u/sub/sup + <br> 分行)。
 * 按行分类: 词性段落 / 编号义项 / 字母子义项 / 例句 / 分组标题 / 元信息。
 * 规则基于对 DOCE5 / OALD8 / MW11 / Longman_Pronunciation 实测样本归纳。
 */

export type DictLineType =
  | "pos"
  | "group"
  | "sense"
  | "subsense"
  | "example"
  | "meta"
  | "text";

export interface DictLine {
  type: DictLineType;
  /** pos 名称 / 编号 / 分组标题等 */
  label?: string;
  /** 该行剩余 HTML (已去除被识别的标签前缀) */
  html: string;
}

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

    // 词性: <b><i>intransitive verb</i></b> / <b><i>noun</i></b>
    let m = line.match(/^<b><i>((?:transitive |intransitive |also )*.+?)<\/i><\/b>/i);
    if (m) {
      const label = m[1].replace(POS_RX, "$1").trim();
      out.push({ type: "pos", label, html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 词性: 罗马数字 <b>I. </b> / <b>II.</b> (MW11)
    m = line.match(/^<b>\s*([IVXL]+)\.\s*<\/b>/i);
    if (m) {
      out.push({ type: "pos", label: m[1].toUpperCase(), html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 分组标题: 全大写 <b>MOVE FAST ON FOOT</b> (OALD8)
    m = line.match(/^<b>([A-Z][A-Z ,'()-]{3,})<\/b>/);
    if (m) {
      out.push({ type: "group", label: m[1], html: "" });
      continue;
    }

    // 编号义项: <b>1.</b> / <b>1</b>. / <b> 2 </b>
    m = line.match(/^<b>\s*(\d{1,3})\.?\s*<\/b>/);
    if (m) {
      out.push({ type: "sense", label: m[1], html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 字母子义项: <b>a.</b> / <b>b.</b> (MW11)
    m = line.match(/^<b>([a-z])\.<\/b>/);
    if (m) {
      out.push({ type: "subsense", label: m[1], html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 元信息: Etymology / Date / Origin / Usage 等 (冒号可能在 <b> 内: <b>Usage:</b>)
    m = line.match(
      /^<b>(Etymology|Date|Origin|Usage|Synonyms|Antonyms|Collocations|Pronunciation|Derivatives|Language):?\s*<\/b>/i,
    );
    if (m) {
      out.push({ type: "meta", label: m[1], html: stripTagPrefix(line, m[0]) });
      continue;
    }

    // 例句: • 开头 (OALD8 用 •)
    if (/^[•◦●]\s*/.test(line)) {
      out.push({ type: "example", html: line.replace(/^[•◦●]\s*/, "") });
      continue;
    }

    // 默认文本
    out.push({ type: "text", html: line });
  }

  return out;
}