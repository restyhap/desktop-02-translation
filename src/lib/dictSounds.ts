/**
 * 词典发音资源挂载与作用域工具（纯函数，无运行时依赖，node 可直跑）
 *
 * 数据前提（2026-09-29 实测取证，见 docs/repair-dict.md R0/R2 段）：
 * 1. dictbuild expand_tags 产出展开 HTML 时丢弃了 [s]…[/s]，但 resources 表保留
 *    全部声音文件，且**自然行序 == DSL 原文 [s] 文档序**（hello 逐位一致，
 *    DOCE5 抽样 290/294 一致；4 失败样本均为跨库同形词配对伪影）。
 * 2. 展开定义中「3+ 空格缩进行」为例句槽：全库 22957/23022 词条满足
 *    「槽数 == exa_* 资源数」；65 例外为拟声词特例（释义行同形缩进）。
 *    防护：槽数与 exa 数不等时整条不挂载（宁可无音、不可错音）。
 * 3. 词头发音 = 非 exa 前缀的 audio 资源（DOCE5: bre_/ame_，OALD8: z_*__gb/_us，
 *    MW11: 无前缀，LPron3: uk_/us_）。
 */

export interface SoundSlotLine {
  type: string;
  /** DOCE5 例句槽（3+ 空格缩进行），音频资源按文档序逐位挂载位 */
  slot?: boolean;
  /** 本行声音文件名（挂载后填充） */
  sounds?: string[];
}

/** 最小资源形状（兼容 storage 层 DictResource，仅取用到的字段） */
export interface SoundResource {
  kind: string;
  filename: string;
  zip_file: string;
}

/** 解析行最小形状（含 html，供 LPron3 复合行文本判别） */
export interface SoundHtmlLine extends SoundSlotLine {
  html: string;
}

export type PronTag = "英音" | "美音" | null;

/**
 * 例句音文件命名约定（Longman DOCE5: exa_p008-000170875.wav 等）。
 * 分隔符必须有 `exa_`/`exa-`：MW11 的词头音也常以 exa 开头（exacer01.wav=exacerbate、
 * exactl01.wav=exactly，stem 折叠产物，2026-09-29 实测 24 词条 audio_ref 如此），
 * `/^exa/i` 无锚会把它们误判为例句音 → 头行漏挂。实测 DOCE5 例句音 86104 个 100% 带 `exa_`。
 */
export function isExampleSound(filename: string): boolean {
  return /^exa[_-]/i.test(filename);
}

/** 发音前缀 → 英/美标注（词头胶囊用；无前缀返回 null 只显喇叭） */
export function soundTag(file: string): PronTag {
  const f = file.toLowerCase();
  // 前缀系：DOCE5/LPron3（bre_/ame_/uk_/us_）
  if (/^(bre[_-]|en[_-]?uk|uk[_-]|brit)/.test(f)) return "英音";
  if (/^(ame[_-]|en[_-]?us|us[_-]|amer)/.test(f)) return "美音";
  // 中缀系：OALD8（z_hello__gb_1.wav / z_hello__us_1.wav）
  if (/_(gb|uk)([_\-.]|\d|$)/.test(f)) return "英音";
  if (/_(us|na)([_\-.]|\d|$)/.test(f)) return "美音";
  return null;
}

/**
 * 词典作用域过滤：只保留 zip_file 路径中含「/<词典名>/」目录段的资源行。
 * 实测 4 词典 zip 路径均为 …/goldendict_dictionary/<词典名>/<zip 名> 形态；
 * 带「//」定界可防词典名互为子串（Longman / Longman_DOCE5）误命中。
 * dictionaryName 缺失时不过滤（退化为 word 级全域，仅兜底场景）。
 */
export function scopeResources<T extends { zip_file: string }>(resources: T[], dictionaryName?: string | null): T[] {
  if (!dictionaryName) return resources;
  const needle = `/${dictionaryName}/`;
  return resources.filter((r) => r.zip_file.includes(needle));
}

/**
 * 把 resources（词条归属、自然行序）挂载到解析行上：
 * - 词头行（首个 text 行）：非 exa 前缀 audio 资源（英/美发音变体）
 * - 例句槽行（slot 标记行）：exa_* 资源按文档序逐位挂载（槽数==资源数才挂）
 * - definition 自带 [s]（DSL 分支已解析出 sounds）时整体跳过，信任原文
 * - LPron3 专属分支（见 attachLpron3）：词头 1 组 + ▶ 复合词行按「英/美对组」逐位挂
 * 不可变：返回新数组，原行对象不改动。
 */
export function attachSounds<T extends SoundHtmlLine>(
  lines: T[],
  resources: ReadonlyArray<Pick<SoundResource, "kind" | "filename">>,
  dictionaryName?: string | null,
): T[] {
  if (lines.length === 0 || resources.length === 0) return lines;
  // DSL 分支产物已带 [s] 声音，跳过挂载避免双重
  if (lines.some((l) => l.sounds && l.sounds.length > 0)) return lines;

  const audioFiles = resources.filter((r) => r.kind === "audio").map((r) => r.filename);
  if (audioFiles.length === 0) return lines;

  // LPron3：资源行序 == DSL [s] 文档序（audio_ref == 首 audio 100%），头组=首 2，
  // 余下每 2 个一组对应 definition 中 ▶ 复合词行（群律见 R5 实测）
  if (dictionaryName && isLpron3(dictionaryName)) {
    return attachLpron3(lines, audioFiles);
  }

  const headFiles = dedupeKeepOrder(audioFiles.filter((f) => !isExampleSound(f)));
  const exaFiles = dedupeKeepOrder(audioFiles.filter((f) => isExampleSound(f)));

  const slots = lines.filter((l) => l.slot === true);
  // 防错位：槽数与例句音数不一致时整条不挂（拟声词等特例数据形态）
  const slotsAlign = slots.length > 0 && slots.length === exaFiles.length;

  let exaCursor = 0;
  let headDone = false;
  return lines.map((line) => {
    if (line.sounds && line.sounds.length > 0) return line;
    if (!headDone && line.type === "text") {
      headDone = true;
      return headFiles.length > 0 ? { ...line, sounds: headFiles } : line;
    }
    if (slotsAlign && line.slot === true) {
      const file = exaFiles[exaCursor++];
      return file ? { ...line, sounds: [file] } : line;
    }
    return line;
  });
}

/** 保序去重 */
function dedupeKeepOrder(files: string[]): string[] {
  return [...new Set(files)];
}

/**
 * LPron3（Longman Pronunciation）判别：仅按词典名前缀，结构律按实测资源行序推理，
 * 不做词条级硬编码。
 */
function isLpron3(dictionaryName: string): boolean {
  return dictionaryName.startsWith("En-En_Longman_Pronunciation");
}

/**
 * LPron3 专属挂载（与 DOCE5 槽位律同思路的「结构群律」分支）：
 * 实测规律（docs/repair-dict.md R5）：
 * 1. resources 行序 == DSL 原文 [s] 文档序（audio_ref == rowid 首音频 67223/67223）。
 * 2. 词头占首 2 个音频（uk_…+us_…，抽查 13 词条首对 100% uk 先 us 后）；
 *    之后每 2 个相邻音频为一组，依序对应 definition 中「▶ 开头复合词行」。
 * 3. ▷ 词形变体行（hello|ed 等）一般不带音，不挂。
 * 防错律（沿 DOCE5 宁缺勿错）：复合行数 ≠ 组数时只挂词头，其余不挂；
 * 无复合行词条（hello 等）词头照挂首组。
 */
function attachLpron3<T extends SoundHtmlLine>(lines: T[], audioFiles: string[]): T[] {
  if (audioFiles.length < 2) return lines;
  const headFiles = audioFiles.slice(0, 2);
  const pairs: string[][] = [];
  for (let i = 2; i + 1 < audioFiles.length; i += 2) pairs.push(audioFiles.slice(i, i + 2));

  // 复合行定位：第 0 行是词头，其后 text 行以 ▶ 开头视为复合词行
  const compoundIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 || lines[i].type !== "text") continue;
    const text = lines[i].html.replace(/<[^>]+>/g, "").trim();
    if (text.startsWith("▶")) compoundIdx.push(i);
  }

  const aligned = pairs.length > 0 && pairs.length === compoundIdx.length;
  let headDone = false;
  let cursor = 0;
  return lines.map((line, idx) => {
    if (line.sounds && line.sounds.length > 0) return line;
    if (!headDone && idx === 0 && line.type === "text") {
      headDone = true;
      return { ...line, sounds: headFiles };
    }
    if (aligned && compoundIdx.includes(idx)) {
      const pair = pairs[cursor++];
      return pair ? { ...line, sounds: pair } : line;
    }
    return line;
  });
}

/**
 * 词头 speak() 播放选择：优先 audio_ref 精确命中，退化取首个 audio 资源。
 * 调用方须先经 scopeResources 限定本词典范围。
 */
export function pickHeadAudio<T extends Pick<SoundResource, "kind" | "filename">>(
  resources: ReadonlyArray<T>,
  audioRef?: string | null,
): T | undefined {
  const audio = resources.filter((r) => r.kind === "audio");
  if (audioRef) {
    const hit = audio.find((r) => r.filename === audioRef);
    if (hit) return hit;
  }
  return audio[0];
}
