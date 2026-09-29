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

## R3 端到端 fixture 测试（node 直跑，无浏览器/无 tauri 依赖）

```text
用 node --experimental-strip-types 写脚本 verify：parseDefinition(hello.definition)
输出断言（逐行）：音标行 1 行、英/美两 sound、n 条例句行每行恰好 1 sound、无 [lang]/[trn]
残留、义项 a. b. 编号正确。多词典：模拟第二个词典（若库里还有）时 speak 匹配不越库。
```

## R4 真机验收清单（转交用户）

- [ ] pnpm tauri dev，词典页点「重建词典」（R1 后必须）
- [ ] hello：英音有声、美音有声、每个例句小喇叭有声
- [ ] 换词典（若有第二本）查询另一个词，声音归属正确
- [ ] 拖拽排序仍生效

## R5 DoD

全部勾选 R4 + tsc/build/smoke + commits 序列 + 本文件 R0 取证段填写完整。
```
