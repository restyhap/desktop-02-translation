# 词典模块全面修复任务卡（R0-R5，以 hello 为验收基准）

> 用户验收标准：**一词一句都对**。以 `hello` 词条为端到端测试样例，覆盖英音/美音/例句发音、多词典匹配、音标排版。
> 纪律：每一步先读真实数据（sqlite3 / node 解析实测），结论必须有证据；禁止臆断；同一步失败 ≥2 换思路上报。

---

## R0 现状取证（先做，产出写入本文件 R0 段）

1. sqlite 查两个库（注意：sqlite3 命令行**不要**用 `2>/dev/null` 内联）：
   - 活跃库 `~/Library/Application Support/desktop-translation/dictionaries.db`
   - 旧库 `~/Library/Application Support/com.desktop-translation/dictionaries.db`
   取证项：dictionaries 全部行（id/name/entry_count/dict_dir）、hello 的 entries_data 行
   （definition 头 200 字符、audio_ref）、resources 中 hello 相关行（kind/filename/zip_file）。
2. 取证 zip 内音频真实格式：`unzip -p <zip> <ame_hello.wav> | head -c 16 | xxd`（RIFF/MPEG 判定）。
3. 读现版 `src-tauri/src/bin/dictbuild.rs` 资源提取与 entries 入库路径，对照旧库行为，
   回答：**为什么活跃库 resources=0 行、entry_count=0**（这是"点喇叭无声/按钮缺失"的总根因候选）。
4. 前端链路现状复核：parseDefinition DSL 分支、DictBody 音标/sounds 渲染、DictEntryView 的
   speak()/speakFile()/playRes/toPlayableAudioUrl（要读，列出每个函数当前行为清单）。

## R1 数据层修复（src-tauri，唯一允许动 Rust 的阶段；R0 取证与 R1 修复产出见下方两个记录段）

## R0 取证记录（2026-09-29 实测，执行者：repair 子代理）

### R0.0 重大事实修正

- **任务分配背景的「活跃库」表述需要修订**：当前 `src-tauri/tauri.conf.json` identifier = `com.desktop-translation`（自 1c15aed 初始提交即如此），`dict.rs get_db_path`（src-tauri/src/dict.rs:64-71）用 `app_data_dir()` → 实际运行库 = `~/Library/Application Support/com.desktop-translation/dictionaries.db`（278MB，mtime 2026-09-29 10:49，4 词典全量健康数据）。原卡片所称「活跃库报废」的 `~/Library/Application Support/desktop-translation/dictionaries.db`（73MB，mtime 2026-09-14 14:15，1 词典/61224 词条/entry_count=0/resources=0/definition 保留原样 [s][c][p] 标签）是**旧版 dictbuild 的历史产物，已不是运行库**。该无点目录的产生来源未确证（4688b46 版 `DEFAULT_OUTPUT` 曾硬编码为 `src-tauri/dictionaries.db`，与此目录不符；git 历史中无该库文件）。
- **卡片 zip 文件名笔误修订**：实物文件为 `En-En-Longman_DOCE5.dsl.files.zip`，**不存在** `En-En-Longman_ZDOCE5.dsl.files.zip`。
- **前端链路现状复核（R0 第 4 项）不在本子任务范围**（前端链路已确认修好、R2 未开始），未重复取证。

### R0.1 双库取证表（sqlite3 原样输出关键行）

| 取证项 | 废弃库 `desktop-translation/`（旧产物） | 运行库 `com.desktop-translation/`（现役） |
|---|---|---|
| dictionaries 行 | `1/En-En_Longman_DOCE5/0//Users/resty/01-build/goldendict_dictionary/En-En_Longman_DOCE5/`（dict_dir=带尾斜杠子目录） | 4 行：`1|En-En_Longman_DOCE5|61212|.../goldendict_dictionary`、`2|En-En_OALD8|72835|...`、`3|En-En_Merriam_Webster11|119777|...`、`4|En-En_Longman_Pronunciation3|68049|...`（dict_dir=父目录） |
| entries_data 行数 | 61224（全部 dictionary_id=1） | 321873 |
| audio_ref 非空行数 | 0 | hello：DOCE5=`bre_hello0205.wav`、OALD8=`z_hello__gb_1.wav`、MW11=`hello001.wav`、LPron3=`uk_hello0205.wav` |
| definition 含 `[s]` 残留 | 55069 行；hello 原样保留 `[c blue]<b>hel</b>‧<b>lo</b>[/c]…[s]bre_hello0205.wav[/s]…` | 0 行；hello=`<b>hel</b>‧<b>lo</b><b> S1</b> /həˈləʊ…`（expand_tags 已处理） |
| resources 行数 | **0** | **589899** |
| hello 的 resources 行（旧库 entry_id=24624） | 无 | `85129|audio|bre_hello0205.wav` … `85138|audio|exa_p008-001725240.wav`（10 行：英音/美音/8 例句音） |
| zip 实物 | — | `/Users/resty/01-build/goldendict_dictionary/En-En_Longman_DOCE5/` 下仅 `En-En-Longman_DOCE5.dsl.files.zip`（1,395,447,857 字节，185,896 files） |

- `unzip -l En-En-Longman_DOCE5.dsl.files.zip | grep -i hello` → `ame_hello.wav / ame_ld42golden_hello.wav / ame_ld5_hello_.wav / bre_hello0205.wav / bre_ld42golden_hello.wav` 5 项；`grep -iE exa_p008` 例句音大量存在（如 `exa_p008-000170875.wav`）。
- `unzip -p … bre_hello0205.wav | head -c 16 | xxd` → `5249 4646 720e 0000 5741 5645 666d 7420` = `RIFF…WAVEfmt`（真 RIFF/WAVE）。

### R0.3 根因结论（回答「为什么 resources=0、entry_count=0」）

**结论：报废数据是旧版 dictbuild 的产物，不是现版代码的缺陷；现版管线已被两路证据证明可产出正确数据。**

1. 废弃库数据形态与现版产物不符：现版 `dictbuild.rs` `expand_tags`（:234-239 将 `[s]…[/s]` 整段丢弃、:252 未知标签剥除）不可能产出原样保留 `[c blue]`/`[p]`/`[s]` 的 definition。
2. 现版代码三处关键入库逻辑健在：audio_ref= `find_sound`（:115,141；实现 :285-291）；resources = `extract_resources`（:293-300）在 zip 存在时 INSERT（zip 探测 :98-102 按后缀 `.files.zip` 兜扫，:119-128 INSERT，与实物文件名吻合，无过滤缺陷）；entry_count = 末尾 UPDATE 回填（:62）。
3. 运行库时间戳+数据自证现版管线成功：`com.desktop-translation/dictionaries.db` mtime 2026-09-29 10:49，4 词典 entry_count 与词条行数完全一致（61212+72835+119777+68049=321873）、resources=589899、hello 三类发音资源齐全。`get_db_path`（dict.rs:64-71）+ 当前 identifier 决定 app 实际读它。
4. 命令行复现（R1.4）：`dictbuild --input …/En-En_Longman_DOCE5 --output /tmp/dict_rebuild_test.db` → 61212 词条、hello audio_ref=bre_hello0205.wav、resources=211713、hello 词条 resources 10 行（三类齐全、zip_file 绝对路径正确）。

## R1 修复记录（2026-09-29）

### 修复 diff 概要

1. `src-tauri/src/bin/dictbuild.rs` `is_audio`（:263-266）：追加 `.spx`。
2. `src-tauri/src/dict.rs` mime 表（:256-267）：追加 `"flac" => "audio/flac"`、`"spx" => "audio/ogg"`。
3. `src-tauri/src/dict.rs` `get_resources`（:216-237）：`WHERE e.word = ?1 OR e.word_raw = ?1` → `WHERE e.word = ?1 COLLATE NOCASE OR e.word_raw = ?1 COLLATE NOCASE`。resources 按 dict 归属由 `entry_id JOIN` 天然保证（资源行 zip_file/dict_dir 随词条归属），词典级过滤调用由 R2 前端负责。
4. **未发现 dictbuild 现版写入缺陷**（见 R0.3），故除以上三项补齐外未改 dictbuild 核心逻辑。

### 修复前后重建对比验证（命令行复现）

`cargo build --bin dictbuild && ./target/debug/dictbuild --input "/Users/resty/01-build/goldendict_dictionary/En-En_Longman_DOCE5" --output <库>`

修复前 `/tmp/dict_rebuild_test.db`：
```text
dictionaries: 1|En-En_Longman_DOCE5|61212
hello: 24624|hello|hello|bre_hello0205.wav
resources: 211713（hello=10 行：bre_hello0205.wav / ame_hello.wav / 8× exa_p008-*.wav）
```
修复后 `/tmp/dict_rebuild_postfix.db`（cargo check 过；cargo test --bin dictbuild → 8 passed, 0 failed）：
```text
dictionaries: 1|En-En_Longman_DOCE5|61212
resources: 211713；.spx 命中 0（本词典无 spx，补齐属健壮性）
NOCASE 验证: JOIN resources WHERE word='HELLO'(大写) → 10 行（修复前 0）
```

hello 三类资源验收行（postfix `select kind,filename,zip_file from resources where entry_id=24624;`）：
```text
audio|bre_hello0205.wav|/Users/resty/01-build/goldendict_dictionary/En-En_Longman_DOCE5/En-En-Longman_DOCE5.dsl.files.zip
audio|ame_hello.wav|/Users/resty/01-build/goldendict_dictionary/En-En_Longman_DOCE5/En-En-Longman_DOCE5.dsl.files.zip
audio|exa_p008-001354151.wav|/…/En-En-Longman_DOCE5.dsl.files.zip
…（共 8 条 exa_p008-*.wav，zip_file 同上）
```

### 运行库处置与用户操作步骤

- **当前运行库 `com.desktop-translation/dictionaries.db` 数据健康且由现版管线产出，本次未覆盖**（不可逆操作留人工审批；重建只会得到等价数据，无收益）。
- 如需端到端再验证（R4 首项）：`pnpm tauri dev` → 设置页确认词典路径 = `/Users/resty/01-build/goldendict_dictionary`（translation.db.dict_settings.paths 实测已如此）→ 词典页点「重建词典」→ 等待数分钟 → hello 验收：英音 bre_hello0205.wav、美音 ame_hello.wav、每例句行尾小喇叭逐行有声。
- 废弃库 `desktop-translation/` 目录待用户确认后可删（未操作）。

---
```text
角色：Rust 迁移工程师。修复 dictbuild 资源提取，使重建后 resources 表非空、
entry_count>0、audio_ref 正确填充；多词典（ 不同 dict_dir）各自归属正确。

要求：
 1. 定位 R0 发现的构建缺陷（候选：zip_path 过滤、[s] 提取时机、files.zip 缺失、
    INSERT 条件错误），最小改动修复；修复前后都用一次重建验证（可用旧 zip 路径）。
 2. 保证 multi-dictionary：resources JOIN 后能按 dict 归属；get_resources 的
    word/word_raw JOIN 大小写问题修掉（LOWER(word)=LOWER(?1) 或 COLLATE NOCASE）。
 3. is_audio 清单补 .spx（GoldenDict 常见）并 mime 表补 flac 分支（dict.rs）。
 4. cargo check 过 → cargo test（若有）/构建 dictbuild → 指导用户跑一次「重建词典」；
    重建后 sqlite 验证 hello 行（resources>0、audio_ref 非空、entry_count>0）。
提交：独立 commit（含 R0 取证记写入）。
```

## R2 前端发音按钮体系（前端唯一大改）

```text
角色：pronunciation UX 实现。展示以 R0 实测 hello 数据为准：
 * 词头行：英音 + 美音 两个带标注胶囊（英音 bre_hello0205.wav / 美音 ame_hello.wav，
   前缀映射表已有 soundTag；**当只有一种时要只显一个并标注**；两个同音文件视为一个）。
 * 词条内任何行（sense/example/subsense）行尾小喇叭逐个对应本行 sound 文件；
   点击 = speakFile(filename)：先在 resources 清单里按 (filename) 匹配→取 zip_file
   精确提取→toPlayableAudioUrl→new Audio 播放；失败静默+console。
 * 多词典正确匹配铁律：只允许使用 entry 所属词典的 zip_file（entry.dictionary_name
   或当前 activeDict 过滤），禁止发起跨库 SELECT。
 * 验收：hello 词条页面可见 = 音标行正确 + [英音][美音] 两钮 + 每个例句行尾小喇叭。
验证：pnpm exec tsc --noEmit 0 + pnpm build 过。
```

## R2 修复记录（2026-09-29，执行者：repair 子代理）

### R2.0 关键事实修正（影响实现架构）

- **运行库 definition 已被 expand_tags 剥掉全部 [s] 标签**（R0 已证：[s] 残留 0 行）。
  R2 卡片设想的「喂 definition 直接解析出逐行 [s]」前提不成立——声音↔行对应只能由
  **resources 表恢复**。测得两条支撑规律（均有大样本证据，非单例归纳）：
  1. **resources 自然行序（rowid）== DSL 原文 [s] 文档序**：hello 逐位一致；
     DOCE5 抽样 290/294 一致（4 失败样本均为跨库同形词配对伪影，见 R2.1 取证脚本输出）。
  2. **展开 HTML 中「3+ 空格缩进行」= 例句槽**：全库 22957/23022 词条满足
     「槽数 == exa_* 资源数」（99.7%）；65 例外全为拟声词特例（applause/boo/caw 等，
     释义行同形缩进）。2 空格缩进是 [m2] 释义正文（非音），3 空格是 [m4]+源缩进例句。
  - 防护规则：**槽数 ≠ exa 数时整条不挂载**（宁缺勿错，防错位播放）。

### R2.1 对应律取证（脚本 /tmp/verify-slots.mjs 实测输出摘录）

```text
可比词条=294
A resources自然序==DSL[s]文档序: 290/294, 失败 4
B 运行库缩进行逐位==DSL含音缩进行: 285/294, 失败 9
slot 律副证: DSL缩进行=503, 含[s]=497, 缩进无声=6
```
全库槽位律（3+ 空格）：`有缩进行或 exa 资源的词条=23022, 相等=22957, 不等=65`。

### R2.2 改动清单

| 文件 | 改动 |
|---|---|
| `src/lib/dictSounds.ts` | **新增**（纯函数零依赖，node 可直跑）：`soundTag`（补 OALD8 `__gb/__us` 中缀）、`isExampleSound`、`scopeResources`（zip_file 含 `/<词典名>/` 段过滤，禁止跨库）、`attachSounds`（词头行挂非 exa 头音 + 例句槽逐位挂 exa，`#槽==#exa` 防护，DSL 已带 [s] 时跳过）、`pickHeadAudio`（audio_ref 优先退化） |
| `src/lib/parseDefinition.ts` | HTML 分支：`split(/<br\s*\/?>\|\n/i)`；trim 前 3+ 空格捕获 → `slot: true` 例句行；sense 行残留句点清理（`.replace(/^\.?\s*/, "")`）；DictLine 增 `slot?` 字段 |
| `src/components/DictBody.tsx` | soundTag 外移引用；pronVariants 按文件去重（同文件并钮）；频率徽章（S1/W3，原 head 行丢弃不显示）；音标行尾 `BrE AmE` 文本清理（与按钮重复） |
| `src/components/DictEntryView.tsx` | 新 prop `dictionaryName`；`scopedResources = scopeResources(...)`；`lines = attachSounds(parsed, scopedResources)`；`speak()` 改为 audio_ref 优先 + 首个 audio 退化、统一走 playRes；`speakFile` 在 scoped 内精确匹配，找不到 console.info 静默；onSpeak 显隐判据保留但改用 scoped 探测（跨库资源不再误显示按钮） |
| `src/pages/DictionaryPanel.tsx` | 传 `dictionaryName={dicts.find(d => d.id === activeDict)?.name}` |

### R2.3 验证

- `pnpm exec tsc --noEmit` → 0 错误
- `pnpm build` → ✓ built in 1.73s（90 modules）
- 浏览器静态骨架目检（dev :1420，无 tauri IPC 属预期）：词典页 chips + 查询框正常渲染，
  截图 `screenshots/r2-dict-page-static.jpg`

## R3 端到端 fixture 测试（node 直跑，无浏览器/无 tauri 依赖）

```text
用 node --experimental-strip-types 写脚本 verify：parseDefinition(hello.definition)
输出断言（逐行）：音标行 1 行、英/美两 sound、n 条例句行每行恰好 1 sound、无 [lang]/[trn]
残留、义项 a. b. 编号正确。多词典：模拟第二个词典（若库里还有）时 speak 匹配不越库。
```

## R3 fixture 记录（2026-09-29）

- 文件：`docs/repair-dict-fixture.mjs`。用法：`node --experimental-strip-types docs/repair-dict-fixture.mjs`
  （node ≥22.6；经 `node:sqlite` 只读直连运行库真数据，期望值取自废弃库 DSL 原文真值）。
- 断言 38 项：DOCE5 hello 全链（entry/audio_ref、resources=10、无 [lang]/[trn]/[*]/[/ex]
  残留、sense 1..6、词头 [bre_hello0205(英音), ame_hello(美音)]、音标 `/həˈləʊ, he- -ˈloʊ/`、
  8 例句逐位对应 exa_p008-*.wav、槽计数 8==8、▪ 行无音）；跨库隔离（15 行混库 →
  scope 后 10 行、他库文件名不可命中、audio_ref 优先、OALD8/MW11/LPron3 各自头音
  正确且无 exa 泄漏）；同文件并钮去重；槽律防护（不齐不挂）；DSL 分支不二次挂载 +
  DSL 回归（17 [ex] 行中 8 行带音）。
- 结果：**PASS=38 FAIL=0**（fixture 曾有 2 处断言写错已修正：guard 应只断言槽行、
  DSL [ex] 行真值实为 17 个含 8 个带音）。


## R4 真机验收清单（转交用户）

前置说明：R2 后前端在**无 tauri 的纯浏览器**下无法查询词条（invoke 缺失属预期），
以下全部需在 `pnpm tauri dev` 真机下验收。运行库本次未重建（R1 已证数据健康）。

- [ ] `pnpm tauri dev`，词典页选 **En-En_Longman_DOCE5**，查 `hello`
- [ ] 词头行：`hello` + `S1` 徽章 + 音标 `/həˈləʊ, he- -ˈloʊ/` + **[英音][美音] 两枚胶囊**
- [ ] 点英音 → bre_hello0205.wav 有声；点美音 → ame_hello.wav 有声；右上喇叭 = audio_ref 优先
- [ ] 8 个例句行尾各 1 枚小喇叭（Hello, John! / Stanley… / Well, hello there… /
      Hello – may I speak to Anne? / Hello! Is there anybody home? /
      You didn't remember her birthday? Hello! / Hello! What's happened here? /
      Promise you'll look in…），逐句有声且**读的正是该句**
- [ ] REGISTER / THESAURUS 的 ▪ 注释行**无**小喇叭（该词典这些行本无音）
- [ ] 换 OALD8 查 hello：[英音][美音]（z_hello__gb_1 / z_hello__us_1）且例句行无喇叭（该库无例句音数据）
- [ ] 换 Merriam_Webster11 查 hello：单枚无标注按钮（hello001.wav）
- [ ] 换 Longman_Pronunciation3 查 hello：[英音][美音]（uk_hello0205 / us_hello）
- [ ] 拖拽排序仍生效；换词典后再查同词，声音归属仍正确（不越库）

## R5 实测取证与三词典优化记录（2026-09-29，OALD8 / MW11 / LPron3）

> 任务：以 DOCE5 已验收路线为基准，对 OALD8 / MW11 / LPron3 做同等的音标-词头钮-例句-音频容器链路优化。
> 全部结论来自运行库直查 + 各词典 .dsl.dz 原文解压 + 资源容器字节实测，无臆断。

### R5.1 各词典词条音频分布实测（行序与 [s] 文档序）

**核心规律三本词典全部成立**：`audio_ref == 该词条 rowid 最小 audio.filename`，全库 100%：
```text
En-En_OALD8:                 55128/55128
En-En_Merriam_Webster11:     69707/69707
En-En_Longman_Pronunciation3: 67223/67223
```
```
```
（audio_ref 是 dictbuild 用 find_sound 取 DSL 第一个 [s]——首音频由此与文档序挂钩，加上 DSL 逐词条抽样对照 OALD8 run/take/world/book/hello 逐位一致，判「resources rowid 序 == DSL [s] 文档序」成立。）

**词条形态（hello 实测）**：
| 词典 | definition 形态 | 头音 | 例句音 |
|---|---|---|---|
| OALD8(id2) | 展开产物有 `<br>` 分行、无 3+ 空格缩进、`•` bullet 例句 | z_hello__gb_1 / z_hello__us_1 | **无**（词典级数据不含例句音，示例仅文本） |
| MW11(id3) | 展开产物 `\hə-ˈlō, he-\` 反斜杠括号音标、多义项词条多 `‹br›` 行 | hello001.wav（无前缀 stem） | **无** |
| LPron3(id4) | `[p]BrE[/p]`/`[p]AmE[/p]` 剥标签后纯文本 + `▷`变体行/`▶`复合行（各自带音） | uk_hello0205 / us_hello | **无**（复合词行有独立音，非例句） |

**3+ 空格槽位律**：400 词条随机抽样各词典（OALD8/MW11/LPron3）含 3+ 空格缩进行词条 = **0/400/0/400/0/400**（DOCE5 独有）。三词典词条 definition 富含 `` 但无 DOCE 式例句槽形态。

**MW11 stem 前缀潜雷（R-B 修正点）**：MW11 词头音文件名常见 `exa*` 前缀（exacer01=exacerbate、exactl01=exactly，24 词条 audio_ref 如此），`/^exa/i` 例句判别会把它们误划入例句音——修复为 `/^exa[_-]/` 分隔锚（DOCE5 86104 个例句音 100% 为 `exa_` 前缀）。

**LPron3 群律（light 实测）**：`▶`复合行与资源分组精确对齐（词头 pair + 8 复合行 pair == 18 音全部逐位），hello 的 ▷ 变体行（ed/es/ing）无音（14/14 待确验；样本 600 词里含复合行 22 群中 20 群对齐，2 例外）。

### R5.2 前端修（R-B）

| 文件 | 改动 |
|---|---|
| `src/lib/dictSounds.ts` | `isExampleSound` 加 `exa[_-]` 分隔锚；`attachSounds` 增 `dictionaryName` 参数，LPron3 分支 attachLpron3（词头 1 组 + 复合行 group 依序，群律 mismatch 时不挂）；接口 SoundHtmlLine |
| `src/lib/dictPhonetic.ts` | **新增** extractPhonetic：`/…/`（DOCE/LPron）+ `[…]`（OALD8 词形表 `[run runs ran running]` 含空格跳过）+ `\…\`（MW11，内文归一 `/…/`）三形态；LPron3 无括号型返回 null |
| `src/components/DictBody.tsx` | 音标提取改走 extractPhonetic（strip-tags + 控制符净化语义不变） |
| `src/components/DictEntryView.tsx` | attachSounds 传 `dictionaryName` |

**音频容器实测（zip 实物头 24B）**：
```text
OALD8  z__babe_didrikson_1_gb_1.wav : RIFF + fmt 30B + wFormatTag=0x55 → 伪 WAV(MP3 载荷)，toPlayableAudioUrl 已适配
MW11   aah00001.wav                  : RIFF + fmt 16B + wFormatTag=0x01 → 真 PCM WAV，直接播
LPron3 uk_ld44a.wav                  : RIFF + fmt 30B + wFormatTag=0x55 → 伪 WAV(MP3 载荷)，toPlayableAudioUrl 已适配
```
mime 推断 `.wav→audio/x-wav` 与容器适配 OK，Rust 侧（dict.rs）无需再改。

### R5.3 验证

- `pnpm exec tsc --noEmit` → 0 错误
- `pnpm build` → ✓ built in 1.65s（91 modules）
- `node docs/repair-dict-fixture.mjs` → PASS=56 FAIL=0
- Rust 侧未改动（无需 cargo check/test）

### R5.4 遗留（需真机确认/后续优化），不掩盖

1. **LPron3 音标行残 `\`（DSL `\\` 转义足迹）**：词头 `hello BrE AmE hə ˈləʊ he- AmE\ -ˈloʊ` 中的 `AmE\`/` -ˈloʊ`（NAmE 段）音标残形不齐（无括号型识别丢框），**展示有瑕疵但无功能缺**。
2. **多 sense 词条的次位音**（OALD8 run 的 z_ran \_\_gb/us 或 MW11 run 的 run00002+runles01 与 LPron3 变体行音）在 head 钮之外；OALD8/MW11 词条头挂全部非 exa 音（hello 词典仅 1-2 音正确多 sense 词条 head 挂 4/3 音钮）。需要词典级锚位精修（行内 stem↔word 匹配需要更大样本）。
3. **LPron3 群律相架层 2/22 例外**（样本 600 词条含复合行 22 群），mismatch 时按「宁缺勿错」只挂词头。需要更大样本验证是否还有形态族（如 uk_lpd_ 与 uk_ld44 词头音分布不规则）。
4. **运行库是权威**：三词典与 DOCE5 无资源差异，无遗留入库呃。

## R5 DoD

全部勾选 R4 + tsc/build/smoke + commits 序列 + 本文件 R0 取证段填写完整。

---

# R6 词典共通化统一记录（2026-09-29，规格 docs/dict-unify.md）

> 任务：按 dict-unify.md 将 4 词典（DOCE5/OALD8/MW11/LPron3）的音标渲染/发音按钮/音频容器处理收敛为单一事实源，消除逐词典补丁式特例。

## R6.1 改动清单

| 文件 | 改动 |
|---|---|
| `src/lib/dictPhonetic.ts` | **重写为统一提取器**：输出统一结构 `{plain, brE?, amE?}`（+head/tail 供 freq 徽章/尾行派生）。四形态按序尝试：`/…/`（DOCE5）→ `标记词[…]`（OALD8 `BrE [x] NAmE [y]`→variants，退化路径保留原「无空格首括号」）→ `\…\`（MW11；内文含标记词=LPron3 残段误配对→拒绝）→ 无括号型（LPron3 **必出结果**）。净化一次收口：strip-tags+空白归一（DSL `\ ` 转义空格=U+00A0→U+0020）、`$`、`/-\s+-/`、残 `\`、语言标记词（BrE/AmE/NAmE）抽出为 variants 不拼 plain、`—` 尾注截断归 tail、LPron3 斜体注释判别（≥3 连 ASCII 字母的 `<i>…</i>`：带 — 为尾注保留原文，行中标签 strong/weak form 置为变体分隔）、段尾 `(i)/(ii)` 族编号清除 |
| `src/lib/dictSounds.ts` | `soundTag` 表化（TAG_RULES 映射表=唯一映射处，语义不变）；新增 `pronTagKey`（标签→i18n 键收口）与 `isPlayableSoundFile`（`.spx`=Ogg/Speex 不可播） |
| `src/lib/audioUrl.ts` | **新增**：`toPlayableAudioUrl` 自 DictEntryView 迁出（唯一嗅探处、node 可直跑）；改为按容器字节判定（去掉 mime 门）；补 OggS/Speex 嗅探→返回 null=不可播；空 catch 补 console.error |
| `src/components/DictBody.tsx` | 渲染接新结构：plain 主体 + BrE/AmE variants 标签展示（i18n）；按钮律=1 音 1 钮无标签、≥2 音分组带标签胶囊；SoundBtns/PronButtons title=`t(tag)·file`；删除本地 `^BrE\s+AmE` 尾清洗（提取器已收口） |
| `src/components/DictEntryView.tsx` | 用 lib/audioUrl；`toPlayableAudioUrl→null` 时 console.info 静默降级（不报错不播）；scopedResources 叠加 `.spx` 过滤（喇叭不渲染=无资源可视化降级） |
| `docs/repair-dict-fixture.mjs` | 新增 uniform.* 断言 21 条（音标统一结构 4 词典 + light 单段形态 + 按钮数据形状/数量律 + 合成字节容器直测 + spx 判定）；oald8.phonetic/phonetic.backslashShape/mw11.phonetic 3 条接新结构（语义真值不变）；其余 56 条零退化 |

## R6.2 LPron3 无括号型语法（DSL 原文取证）

```
[b]word[/b] (<i> strong form</i>)? [p]BrE[/p] [s]uk_…[/s] [p]AmE[/p] [s]us_…[/s]
  [c]英音段[/c] [变体后缀 he-/ɒ-] ([p]AmE[/p]\ [c]美音段[/c])? (<i>, weak forms</i> PHON…)* (<i> —注释</i> 非斜体尾注)*
```
- `\`（`AmE\`）为 DSL 转义空格残迹；`!!`/`§` 为 LPD 自有记号（非语言标记词），保留原文。
- 库内空白实测：DSL `\ ` 展开为 U+00A0（hello 1 处、aachen 2 处），故提取链先空白归一。

## R6.3 统一化前后行为差异（2400 词条抽样 + hello/light 特征词条实证）

| 词典 | 不变 | 变化 |
|---|---|---|
| DOCE5 | 385/600 等值、215 双 null，**零差异**（含 hello `/həˈləʊ, he-ˈloʊ/`、S1 徽章、tail） | 无 |
| MW11 | 294 等值、306 双 null，**零差异**（hello `\hə-ˈlō, he-\`→`/hə-ˈlō, he-/`） | 无 |
| OALD8 | 302 等值、250 双 null | hello/run：`NAmE [həˈloʊ]` 不再泄漏为尾行文本→amE variant；48/600 旧 bug 修复（旧代码把词形表 `[coursebook]` 误当音标显示 `/coursebook/`，新代码经标记词绑定段出真音标） |
| LPron3 | 3 等值、27 双 null（交叉引用/罗马数字多 sense 行，规格排除） | **513/600 由 null→出音标**（规格#1「必须出结果」达成）；57/600 旧残段垃圾修复（如 powys 旧值 `/ -əs AmE/`）；`—` 尾注/strong/weak form 标签不再混入音标；hello={brE:`hə ˈləʊ he-`, amE:`-ˈloʊ`}、light=plain `laɪt` |
| 全词典 | — | 按钮律：单音钮不再带地区标签（如 DOCE5 仅 bre 音词条）、title=`t(tag)·file`；`.spx` 文件喇叭不渲染；OggS 容器播放静默降级 |

**回归=0**（旧值→新 null 2400 抽样 0 例）；DOCE 已定稿行为全 PASS。

## R6.4 验证

- `pnpm exec tsc --noEmit` → 0 错误（exit 0）
- `pnpm build` → ✓ built in 1.57s
- `pnpm test`（vitest）→ 8 passed
- `node --experimental-strip-types docs/repair-dict-fixture.mjs` → **PASS=77 FAIL=0**（56 原有 + 21 uniform.*）
- Rust 侧未改动（4 词典 0 个 spx/ogg 资源实测，mime 表 R1 已补 flac/spx 无缺口）

## R6.5 遗留（不掩盖）

1. **LPron3 strong/weak form 标签不展示**：行中斜体标签（`<i>strong form</i>`）置换为变体分隔符，标签文本未进 UI（音标完整：`ðiː, ði, ðə`）。如需保留需词典级锚位精修（把标签绑定到具体音标段）。
2. **LPD 自有记号 `!!`/`§` 保留原文**（take=`teɪk !!tek`、took=`tʊk § tuːk`）——非语言标记词，语义未确证，不清洗。
3. **多义项次位音**（OALD8 run 第二行 `BrE [ræn]`、LPron3 罗马 I/II 词条首行）仍不在首行提取范围（规格排除，留待后续）。
4. **LPron3 ▷ 变体行的 `AmE\` 残段**仅在首行清洗，▷ 行（如 lighted `ˈlaɪt ɪd -əd AmE\ ˈlaɪt̬ əd`）正文残段未处理（行级音标展示属后续任务）。
5. **多地区段 >2 时只取前两段**（结构槽位仅 brE/amE；实测 OALD8 最多 BrE+NAmE 两段，LPron3 (ii) 发音族第二段丢弃）。
```
