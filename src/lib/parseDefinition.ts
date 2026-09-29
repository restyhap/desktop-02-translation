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
  /** DSL 段落缩进层级 ([m1]..[m6])；非 DSL 分支不设 */
  level?: number;
  /** 本行首个声音文件名（DSL [s]xxx.wav[/s]） */
  sound?: string;
  /** 本行全部声音文件名（DSL 单行可能多个 [s]） */
  sounds?: string[];
}

/** 是否含 DSL 标记（Longman/GoldenDict DSL 原文；含任一即走 DSL 直解分支） */
const DSL_RX = /\[\/?\*(?:\s*\])?|\[m\d?\]|\[\/m\]|\[s\]|\[\/s\]|\[c[ \]]|\[\/c\]|\[p\]|\[\/p\]|\[ex\]|\[\/ex\]/;

/** 已知 DSL 包装标签 → 统一清除（内容保留） */
const DSL_STRAY_RX = /\[\/?(?:m\d?|p|ex|s|ref[^\]\n]*|\*)\]/g;
/** DSL 基础字体标记 → HTML 等价物 */
const DSL_FONT_PAIRS: Array<[{ rx: RegExp; to: string }, { rx: RegExp; to: string }]> = [
  [{ rx: /\[b\]/g, to: "<b>" }, { rx: /\[\/b\]/g, to: "</b>" }],
  [{ rx: /\[i\]/g, to: "<i>" }, { rx: /\[\/i\]/g, to: "</i>" }],
  [{ rx: /\[u\]/g, to: "<u>" }, { rx: /\[\/u\]/g, to: "</u>" }],
  [{ rx: /\[sub\]/g, to: "<sub>" }, { rx: /\[\/sub\]/g, to: "</sub>" }],
  [{ rx: /\[sup\]/g, to: "<sup>" }, { rx: /\[\/sup\]/g, to: "</sup>" }],
];

/**
 * [c 颜色]…[/c] → <span style="color">…</span>
 * DSL [c] 可嵌套，非贪婪匹配先处理最内层，循环至清零。
 */
function convertCtags(s: string): string {
  for (let i = 0; i < 8; i++) {
    if (!/\[c[ ]/.test(s)) break;
    s = s.replace(
      /\[c ([^\]\s]+)\]([\s\S]*?)\[\/c\]/g,
      (_m: string, color: string, body: string) => `<span style="color:${color}">${body}</span>`,
    );
  }
  // 无色 [[c}…[/c]（部分词典用占位色）→ 内容原样保留
  return s.replace(/\[c\]([\s\S]*?)\[\/c\]/g, "$1");
}

/** [p]…[/p] → text 内小徽章 span */
function convertPtags(s: string): string {
  return s.replace(
    /\[p\]([\s\S]*?)\[\/p\]/g,
    (_m: string, body: string) =>
      `<span class="rounded bg-bg-inset px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-3">${body}</span>`,
  );
}

/**
 * DSL 直解：按行型归类为既有 DictLine 七类。
 * 输入形如: `[c blue]<b>hel</b>‧<b>lo</b>[/c]…\n[s]bre_hello0205.wav[/s]\n[*][ex]Hello![/ex][/*]`
 */
function parseDslDefinition(source: string): DictLine[] {
  const out: DictLine[] = [];
  const rawLines = source.split(/\n|<br\s*\/?>/i);

  for (let l of rawLines) {
    let s = l.trim();
    if (!s) continue;

    // 段落缩进: [m1]..[m6] → level
    const mLevel = s.match(/^\[m(\d)?\]\s*/);
    let level = 0;
    if (mLevel) {
      level = mLevel[1] ? Number(mLevel[1]) : 0;
      s = s.slice(mLevel[0].length);
    }
    s = s.replace(/\[\/m\]\s*$/, "").trim(); // 尾部 [/m]

    // 声音标记: [s]xxx.wav[/s] 全部抽出（正文不再显示文件名）
    const sounds: string[] = [];
    s = s.replace(/\[s\]([^\[\]\n]+)\[\/s\]/g, (_m: string, f: string) => {
      sounds.push(f.trim());
      return "";
    });
    s = s.replace(/\[\*\]|\[\/\*\]/g, "").trim(); // [*]/[/*] 强调包装直接去壳

    if (!s) {
      // 整行只有声音 → 保留成空 text 行挂 sounds（不影响视觉）
      if (sounds.length) out.push({ type: "text", html: "", level, sound: sounds[0], sounds: [...sounds] });
      continue;
    }

    // 行型判定（用原始未清洗前缀）
    let type: DictLineType = "text";
    let label: string | undefined;
    let body = s;
    let m: RegExpExecArray | null = null;

    if (!/\[ex\]/.test(s)) {
      // 罗马数字词性: <b>I. </b> / I.
      m = /^<b>\s*([IVXL]{1,6})\.\s*(?:<\/b>)?\s*/.exec(s);
      if (m) {
        type = "pos";
        label = m[1].toUpperCase();
        body = s.slice(m[0].length);
      } else if ((m = /^<b>\s*(\d{1,3})\.?\s*<\/b>\s*/.exec(s))) {
        // 编号义项: <b>1.</b>
        type = "sense";
        label = m[1];
        body = s.slice(m[0].length);
      } else if ((m = /^<b><i>((?:transitive |intransitive |also )*[^<]+?)<\/i><\/b>\s*/i.exec(s))) {
        // 词性短语: <b><i>noun</i></b>
        const cand = m[1].replace(POS_RX, "$1").trim();
        if (POS_RX.test(cand)) {
          type = "pos";
          label = cand;
          body = s.slice(m[0].length);
        }
      } else if ((m = /^<(?:b|i)>\s*([a-z])\.\s*<\/(?:b|i)>\s*/.exec(s))) {
        // 字母子义项: <b>a.</b>
        type = "subsense";
        label = m[1].toLowerCase();
        body = s.slice(m[0].length);
      }
    } else {
      type = "example"; // [ex]…[/ex]（[*][ex]…[/ex][/*] 壳已去）
    }

    // 清洗正文: c→span、p→徽章、已知杂牌清除、b/i/u/sub/sup→HTML
    body = convertPtags(convertCtags(body)).replace(DSL_STRAY_RX, "");
    for (const [open, close] of DSL_FONT_PAIRS) {
      body = body.replace(open.rx, open.to).replace(close.rx, close.to);
    }
    body = body.trim();

    const line: DictLine = { type, html: body };
    if (label !== undefined) line.label = label;
    if (type === "text" && level > 0) line.level = level;
    if (sounds.length) {
      line.sound = sounds[0];
      line.sounds = sounds;
    }
    out.push(line);
  }

  return out;
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
  // DSL 原文（如 Longman）走直解分支；纯 HTML 维持原路径
  if (DSL_RX.test(html)) return parseDslDefinition(html);

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