/**
 * 词典音标段提取（多词典差异化形态，纯函数 node 可直跑）
 *
 * 实现 4 词典展开 HTML 的音标标签实测形态（docs/repair-dict.md R5）：
 * 1. 斜杠型：Longman DOCE5 / LPron3 —— /həˈləʊ, he- -ˈloʊ/（单段）
 * 2. 方括号型：OALD8 —— BrE [həˈləʊ] NAmE [həˈloʊ]（词头左右各一段，取首段=英音；
 *    词形表 [run runs ran running] 含空格 + ASCII 单词 tokens，据此判别跳过）
 * 3. 反斜杠型：MW11 —— \hə-ˈlō, he-\（提取内文后统一以斜杠型归一展示）
 * 4. 无括号型：LPron3 —— hə ˈləʊ he-…（纯文本，无音标段标记，返回 null）
 */

export interface PhoneticExtract {
  /** 净化后的音标（统一以斜杠型 /…/ 展示） */
  phonetic: string;
  /** 音标前（词头行，含 freq badge 文本等） */
  head: string;
  /** 音标后剩余内容 */
  tail: string;
}

/** 斜杠型音标的净化（DOCE5 控制符 $、变体拼接 - -、空逗） */
function cleanSlashPhonetic(pho: string): string {
  return pho
    .replace(/\$\s*/g, "")
    .replace(/-\s+-/g, "-")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 从词头行纯文本（strip-tags 后）提取音标段。
 * 返回 null 表示该词典/词条无括号界定音标（LPron3 等）。
 */
export function extractPhonetic(base: string): PhoneticExtract | null {
  // 1) 斜杠型 /…/
  let m = base.match(/^(.*?)\s*(\/[^/]+\/)\s*([\s\S]*)$/s);
  if (m && m[2]) {
    return { phonetic: cleanSlashPhonetic(m[2]), head: m[1], tail: m[3] };
  }

  // 2) 方括号型：扫描各 bracket 取首个「无空格段」（音标无空格，词形表有）
  const bracket = /\[([^\[\]\n]+?)\]/g;
  let b: RegExpExecArray | null;
  while ((b = bracket.exec(base))) {
    if (!b[1].includes(" ")) {
      // 音标内仍做 DOCE5 控制符净化（stale 美式同形无碍）
      return { phonetic: cleanSlashPhonetic(`/${b[1]}/`), head: base.slice(0, b.index), tail: base.slice(b.index + b[0].length) };
    }
  }

  // 3) 反斜杠型 \…\（MW11）：提取内文归一为 /…/
  m = base.match(/^(.*?)\s*\\([^\\]+?)\\\s*([\s\S]*)$/s);
  if (m && m[2]) {
    // MW11 音标内含转义空格与连字符，斜杠型净化照做
    return { phonetic: cleanSlashPhonetic(`/${m[2]}/`), head: m[1], tail: m[3] };
  }

  return null;
}
