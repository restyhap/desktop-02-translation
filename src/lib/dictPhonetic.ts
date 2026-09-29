/**
 * 词典音标段提取（统一事实源，纯函数 node 可直跑）
 *
 * 规格（docs/dict-unify.md #1）：本文件是唯一提取器，输出统一结构
 * `{ plain, brE?, amE? }`（head/tail 为渲染派生所需伴随信息）。
 * 输入形态按序尝试：/…/ → […] → \…\ → 无括号型：
 * 1. 斜杠型：Longman DOCE5 —— /həˈləʊ, he- $ -ˈloʊ/（$ 为 DSL 控制符残迹）
 * 2. 方括号型：OALD8 —— `BrE  [həˈləʊ]  NAmE  [həˈloʊ]`（语言标记词绑定段 →
 *    variants；词形表 [run runs ran running] 含空格 + ASCII tokens，据此跳过）
 * 3. 反斜杠型：MW11 —— \hə-ˈlō, he-\（提取内文后统一归一为斜杠型展示；
 *    内文含语言标记词者为 LPron3 残段误配对，拒绝并落回无括号型）
 * 4. 无括号型：LPron3 —— `hello  BrE  AmE  hə ˈləʊ he- AmE\ -ˈloʊ`
 *    （DSL [p]BrE[/p]/[p]AmE[/p] 展开后的裸音标行；**必须出结果**，不许返回 null）
 *
 * 净化一次收口：strip-tags、$、`/-\s+-/` 拼接、DSL 转义残段（AmE\ 尾随反斜杠）、
 * 语言标记词（BrE/AmE/NAmE 前后缀）抽出为 variants 而非拼进 plain。
 * LPD 自有记号（!!、§）非语言标记词，保留原文（docs/repair-dict.md R6 遗留）。
 */

/** 统一音标结构（规格 #1 唯一输出形状） */
export interface PhoneticData {
  /** 净化后的音标主体（斜杠/反斜杠型归一为 /…/；无括号型保留词典原样记法）。
   *  源行显式按地区分段（brE/amE 存在）时为空串，由 variants 完整表达。 */
  plain: string;
  /** 英音变体（OALD8 `BrE […]` / LPron3 英音段） */
  brE?: string;
  /** 美音变体（OALD8 `NAmE […]` / LPron3 `AmE\` 后段） */
  amE?: string;
}

export interface PhoneticExtract {
  /** 统一音标结构 */
  phonetic: PhoneticData;
  /** 音标前（词头行剩余文本，供频率徽章 S1/W3 派生） */
  head: string;
  /** 音标后剩余内容（语言标记词已抽出，与发音按钮不再重复） */
  tail: string;
}

/** 语言标记词（DSL [p] 展开后的裸文本；抽出为 variants，不拼进 plain） */
function markerWords(): RegExp {
  return /\b(BrE|NAmE|AmE)\b/g;
}

/** 地区标记词 → 统一结构槽位（BrE→brE，NAmE/AmE→amE） */
function markerSlot(marker: string): "brE" | "amE" {
  return marker === "BrE" ? "brE" : "amE";
}

/**
 * 音标文本净化（一次收口）：
 * - `$`：DOCE5 DSL 控制符残迹
 * - `-\s+-`：DOCE5 变体拼接残形（he- -ˈloʊ → he-ˈloʊ）
 * - 空逗、多空白归一
 * - stripBackslash：无括号型的 DSL 转义残段（`AmE\` 的尾随 `\`、`§\` 等）
 */
function cleanPhonetic(text: string, opts?: { stripBackslash?: boolean }): string {
  let s = text;
  if (opts?.stripBackslash) s = s.replace(/\\+/g, "");
  return s
    .replace(/\$\s*/g, "")
    .replace(/-\s+-/g, "-")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 去掉段首连续的孤立语言标记词（DOCE5 词尾 `BrE  AmE  ` 发音文件标签等） */
function stripLeadingMarkers(text: string): string {
  let s = text;
  for (;;) {
    const m = s.match(/^\s*\b(BrE|NAmE|AmE)\b\s*/);
    if (!m) break;
    s = s.slice(m[0].length);
  }
  return s;
}

/** 组装统一结构：head 去尾空白（freq 徽章端锚匹配），tail 段首标记词抽出后作为剩余正文归还 */
function finish(head: string, phonetic: PhoneticData, tail: string): PhoneticExtract {
  return { phonetic, head: head.trim(), tail: stripLeadingMarkers(tail).trim() };
}

/** 词头行 HTML → 纯文本（strip-tags + 空白归一收口）：DSL `\ ` 转义空格在库中为
 *  U+00A0（nbsp），统一归一为 U+0020，使 `includes(" ")` 等空格判定与 \s 类正则全链一致 */
function plainText(source: string): string {
  return source.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
}

/**
 * 从词头行 HTML 提取音标（strip-tags 在此收口，调用方传原始行 HTML）。
 * 返回 null 表示该行无音标段（无括号型也仅在行内确无音标文本时才为 null）。
 */
export function extractPhonetic(source: string): PhoneticExtract | null {
  const base = plainText(source);

  // 1) 斜杠型 /…/（DOCE5；先在纯文本里找，避免被闭合标签里的 "/" 干扰）
  let m = base.match(/^(.*?)\s*(\/[^/]+\/)\s*([\s\S]*)$/s);
  if (m && m[2]) {
    return finish(m[1], { plain: cleanPhonetic(m[2]) }, m[3]);
  }

  // 2) 方括号型（OALD8）：a) 语言标记词直接绑定的音标段 → variants
  const marked = collectMarkedBrackets(base);
  if (marked) return marked;

  // 2) b) 退化路径：首个「无空格」方括号段（音标无空格，词形表有 → 跳过）
  const bracket = /\[([^\[\]\n]+?)\]/g;
  let b: RegExpExecArray | null;
  while ((b = bracket.exec(base))) {
    if (!b[1].includes(" ")) {
      return finish(base.slice(0, b.index), { plain: cleanPhonetic(`/${b[1]}/`) }, base.slice(b.index + b[0].length));
    }
  }

  // 3) 反斜杠型 \…\（MW11）：提取内文归一为 /…/；内文含标记词 = LPron3 残段误配对，拒绝
  m = base.match(/^(.*?)\s*\\([^\\]+?)\\\s*([\s\S]*)$/s);
  if (m && m[2] && !/\b(BrE|NAmE|AmE)\b/.test(m[2])) {
    return finish(m[1], { plain: cleanPhonetic(`/${m[2]}/`) }, m[3]);
  }

  // 4) 无括号型（LPron3）：从 [p] 标记词簇 + 首行音标段构建
  //    （传原始 HTML：斜体注释需在剥标签前判别）
  return extractUnbracketed(source);
}

/** 2a) OALD8 形态：`BrE  [həˈləʊ]  NAmE  [həˈloʊ]` —— 标记词绑定的方括号音标段 */
function collectMarkedBrackets(base: string): PhoneticExtract | null {
  const rx = /\b(BrE|NAmE|AmE)\b\s*\[([^\[\]\s]+)\]/g;
  const hits: Array<{ start: number; end: number; marker: string; pho: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(base))) {
    hits.push({ start: m.index, end: m.index + m[0].length, marker: m[1], pho: m[2] });
  }
  if (hits.length === 0) return null;
  // 结构槽位只有 brE/amE 两个：取前两段，多余段（实测 OALD8 最多 BrE+NAmE 两段）丢弃
  const phon: PhoneticData = { plain: "" };
  for (const h of hits.slice(0, 2)) {
    const slot = markerSlot(h.marker);
    if (!phon[slot]) phon[slot] = `/${cleanPhonetic(h.pho)}/`;
  }
  // 两地区同音形（OALD8 run：BrE/AmE 同为 [rʌn]）→ 收敛为单段 plain，不重复标注
  const tail = base.slice(hits[hits.length - 1].end);
  if (phon.brE && phon.amE && phon.brE === phon.amE) {
    return finish(base.slice(0, hits[0].start), { plain: phon.brE }, tail);
  }
  return finish(base.slice(0, hits[0].start), phon, tail);
}

/**
 * 4) 无括号型（LPron3）：`hello  BrE  AmE  hə ˈləʊ he- AmE\ -ˈloʊ`
 * 实测语法（docs/repair-dict.md R6，LPron3 DSL 原文取证）：
 * - 词头（可带 (i)/(ii) 发音族编号）后紧跟 [p] 标记词簇（彼此只隔空白的连续标记词）；
 * - 簇后裸音标文本 = 英音段（LPD 惯例英音在前，uk_ 文件恒先于 us_）；
 * - 行中再现的标记词（`AmE\` —— `\` 为 DSL 转义空格残迹）切出后续美音段；
 * - `—` 起为词典注释（DSL `<i>—Welsh</i>` 斜体段）→ 截断归入 tail，不混入音标；
 * - 段尾 `, (ii)` 发音族编号残段清除；LPD 自有记号 !!/§ 非语言标记词，保留在段内。
 * 必须出结果（规格 #1）；仅当行内确无音标文本（纯复合词行/交叉引用行）或
 * 段文本呈英文散文特征（≥5 连 ASCII 字母，如 DOCE5 `(also Queen's English) noun`）时返回 null。
 */
function extractUnbracketed(source: string): PhoneticExtract | null {
  // LPron3 注释为斜体段（DSL 实测：<i> strong form</i>、<i>, weak forms</i>、<i> —Welsh</i>）：
  // 含 ≥3 连 ASCII 字母的 <i>…</i> 判为注释 —— 内含 — 者为尾注，保留原文（自带 — 触发
  // 截断归 tail，注释文本不丢失）；行中标签斜体（strong/weak form）置换为「,」变体分隔，
  // 音标得以同列展示（标签文本不进音标区，见 R6 遗留）；
  // 短音标斜体（音节化 <i>ə</i>/<i>ʊ</i>、(i)/(ii) 族编号）保留内容由后续规则处理
  const prepped = source.replace(/<i>([^<]*)<\/i>/gi, (_m: string, inner: string) => {
    const t = inner.replace(/<[^>]+>/g, "");
    if (!/[A-Za-z]{3,}/.test(t)) return inner;
    return t.includes("—") ? inner : " , ";
  });
  const base = plainText(prepped);

  const rx = markerWords();
  const marks: RegExpExecArray[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = rx.exec(base))) marks.push(mm);
  if (marks.length === 0) return null;

  // 首标记前的文本须是纯词头（拒绝含斜杠/方括号/圆括号 —— 防 OALD8 行尾说明误入；
  // (i)/(ii) 发音族编号为 LPD 惯例，剥离后再判）
  const first = marks[0];
  const pre = base.slice(0, first.index).replace(/\((?:[ivx]+)\)/gi, "");
  if (/[/\[\]()]/.test(pre)) return null;

  // 词头标记簇：首标记 + 仅隔空白的后续标记（LPron3 `[p]BrE[/p] [p]AmE[/p]` 双标记头）
  let clusterEnd = first.index + first[0].length;
  let k = 1;
  while (k < marks.length && /^\s+$/.test(base.slice(clusterEnd, marks[k].index))) {
    clusterEnd = marks[k].index + marks[k][0].length;
    k++;
  }

  // `—` 起为词典注释段（LPD 斜体注记）→ 截断归入 tail
  const dashIdx = base.indexOf("—", clusterEnd);
  const regionEnd = dashIdx === -1 ? base.length : dashIdx;
  const tailAnno = dashIdx === -1 ? "" : base.slice(dashIdx);

  // 簇后切段：以下一个标记词为界；标记词与段文本绑定（AmE\ → 美音段）
  const sections: Array<{ marker: string; text: string }> = [];
  let cursor = clusterEnd;
  let currentMarker = "BrE"; // 簇后首段按 LPD 惯例为英音（实测 uk_ 文件恒在前）
  for (let j = k; j < marks.length && marks[j].index < regionEnd; j++) {
    const mark = marks[j];
    const text = cleanSectionText(base.slice(cursor, mark.index));
    if (text) sections.push({ marker: currentMarker, text });
    currentMarker = mark[1];
    cursor = mark.index + mark[0].length;
  }
  const rest = cleanSectionText(base.slice(cursor, regionEnd));
  if (rest) sections.push({ marker: currentMarker, text: rest });

  if (sections.length === 0) return null; // 行内确无音标文本（纯复合词行等）

  // 音标相似性防护：段文本须含非 ASCII 字符（英语 IPA 音标必含 IPA 专属符号，
  // 如 ə ɪ ˈ ː）；不得呈英文散文特征（≥5 连 ASCII 字母，如 Empire/English/noun）；
  // 不得含括号/斜杠（该形态应由前序 /…/、[…]、\…\ 分支消费，如 OALD8 带空格音标括号），
  // 防止把其他词典词头行尾的说明词/带空格音标括号误判为无括号音标
  if (!sections.every((s) => !/[/\[\]]/.test(s.text) && /[^\x00-\x7f]/.test(s.text) && !/[A-Za-z]{5,}/.test(s.text))) {
    return null;
  }

  // 单段 → plain（无标签展示）；≥2 段 → 按标记词落 brE/amE 槽位，plain 置空
  const phon: PhoneticData = { plain: "" };
  if (sections.length === 1) {
    phon.plain = cleanPhonetic(sections[0].text, { stripBackslash: true });
  } else {
    for (const s of sections.slice(0, 2)) {
      const slot = markerSlot(s.marker);
      if (!phon[slot]) phon[slot] = cleanPhonetic(s.text, { stripBackslash: true });
    }
  }
  return finish(base.slice(0, first.index), phon, tailAnno);
}

/** 无括号型段文本净化：剥段尾发音族编号残段（`…, (ii)`），空段归一为空串 */
function cleanSectionText(text: string): string {
  return text.replace(/\s*,?\s*\((?:[ivx]+)\)\s*$/i, "").trim();
}
