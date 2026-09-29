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

export type PronTag = "英音" | "美音" | null;

/** 例句音文件命名约定（Longman DOCE5: exa_p008-*.wav 等） */
export function isExampleSound(filename: string): boolean {
  return /^exa/i.test(filename);
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
 * 不可变：返回新数组，原行对象不改动。
 */
export function attachSounds<T extends SoundSlotLine>(
  lines: T[],
  resources: ReadonlyArray<Pick<SoundResource, "kind" | "filename">>,
): T[] {
  if (lines.length === 0 || resources.length === 0) return lines;
  // DSL 分支产物已带 [s] 声音，跳过挂载避免双重
  if (lines.some((l) => l.sounds && l.sounds.length > 0)) return lines;

  const audioFiles = resources.filter((r) => r.kind === "audio").map((r) => r.filename);
  if (audioFiles.length === 0) return lines;

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
