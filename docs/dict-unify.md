# 词典共通化统一任务 v1（跨 4 词典，不再逐词典补丁）

> 背景：DOCE5/LPron3/OALD8/MW11 已各自按实测修至可用但规则分散（音标三套提取、按钮前缀映射散装、LPron3 有遗留瑕疵）。
> 本任务目标 = **规则统一化**：一次解析、统一渲染、统一按钮行为、统一资源容器处理，禁止单词典特例分支继续增殖。
> 调研依据：网络环境不可用（websearch 取消/webfetch 超时，实测于本轮），以下「业界惯例」为知识性对照（GoldenDict DSL [s] 音频标记机制、欧路/Eudic 英美分钮、有道双标准音标），标记为【知识，未联网验证】，实现决策以本地实测样本为准。

## 业界惯例对照（知识性，供决策参考）

| 软件性样本 | 做法 | 对本软件的启示 |
|---|---|---|
| GoldenDict | DSL `[s]file[/s]` 声音标记，内部播放器解码 spx/ogg/wav/mp3 多格式 | 音频容器处理应集中在**一处**嗅探/归一化，不该散在词典分支 |
| 欧路 Eudic | 音标按 BrE/AmE 分列，发音按钮带地区标注 | 英美钮=数据驱动标签，不是文件名猜 |
| 有道/欧路 | 音标永远纯文本渲染（一次清洗，无残留控制符） | 音标提取→净化→渲染应是一条纯函数链 |
| Google/DeepL | TTS 或不发声（不依赖词典资源） | 不动（本软件定位词典真发音优先，缺资源静默） |

## 统一规格（唯一事实源，实现必须收敛到这里）

1. **音标**：`src/lib/dictPhonetic.ts` 是唯一提取器。输出统一结构 `{plain: string, brE?: string, amE?: string} | null`：
   - 输入顺序尝试：`/…/` → `[…]`（OALD8）→ `\…\`（MW11/LPron3 残段）→ 无括号型（LPron3 DSL 音标行）；
   - 净化规则一次收口：strip-tags、`/-\s+-/`、`\n`/转义残段（`\…\` 尾 `\` 与 LoU 残迹）、语言标记词（BrE/AmE 前后缀）抽出为 variants 而非拼进 plain；
   - **LPron3 无括号型必须出结果**（从 `[p]`/首行音标段构建），不许返回 null（现遗留）。
2. **发音按钮**：`soundTag` 前缀→标签映射表是唯一映射处。统一行为规格：
   - 1 个音=1 钮（无标签）；≥2 音=分组带标签胶囊（数据驱动标签：soundTag 输出标签文件名序对 solids）；
   - 词头钮组=单词头；行尾 SoundBtns=该行挂载文件（slot 律产出）；
   - `title = t(tag)·file`（已有 i18n 键），样式 token 同 DictBody 现有。
3. **音频容器**：`toPlayableAudioUrl` 是唯一嗅探处。支持链：真 PCM WAV 直过 / RIFF fmtTag=0x55 → audio/mpeg 重打包 / OggS(Speex/Vorbis) → WKWebView 不支持 Speex：标记为不可播（文件名带 .spx 时喇叭隐藏，可视化降级而非报错）；mime 表缺口在 dict.rs 已补 flac/spx。
4. **数据挂载**：`attachSounds` 槽位律/`scopeResources` 越库过滤不变（已全 fixture 56 断言）。
5. **禁止事项**：为单词典加 UI 分支；硬编码文件名；播放失败时甜吃 error 口只 console（已有标准）。

## 实现提示词（S1）

```text
role：负责统一化的前端实现者。读 docs/dict-unify.md 规格 + src/lib/{dictSounds,dictPhonetic}.ts +
src/components/{DictBody,DictEntryView}.tsx 现状 + docs/repair-dict-fixture.mjs。

改动范围（收敛改）：
 1. dictPhonetic.ts：实现规格#1（统一输出 + LPron3 无括号型），删散装提取；DictBody 接收新结构渲染
   （plain 主体 + BrE/AmE variants 不再逐文件猜前缀拼标签——标签由 soundTag 数据驱动）。
 2. soundTag：迁移到 spec#2 规则（含 LPron3 残段 AmE\ 清洗 → 文件名 tag map）；
   DictBody/DictEntryView 相关调用点同步收敛。
 3. toPlayableAudioUrl：补 OggS/Speex 识别（返回 null → 调用点喇叭按「无资源」处理）。
 4. fixture：docs/repair-dict-fixture.mjs 新增 uniform.* 断言（4 词典各 1 条：音标对象统一结构 +
   按钮数据形状），DOCE/OALD8/MW11/LPron3 原有断言零退化。
验证链：pnpm exec tsc --noEmit → pnpm build → node docs/repair-dict-fixture.mjs 全 PASS → commit。
```

## 测试提示词（S2）

```text
role：实测 Tester。fixture 主验证 + node 直窗口冒烟（agent-browser :1420 的无 tauri 隐态
只可静态目检，真实播放属 tauri 命令，留真机验收）：
 1. node docs/repair-dict-fixture.mjs → 全 PASS 原文。
 2. 静态冒烟截图 4 词典页各一张（布局未因统一化破）。
 3. 真机验收清单（用户执行）：4 词典各查 hello + 各 1 个特征词
   （OALD8 run / MW11 exacerbate / LPron3 light），检查：音标无残段、按钮组形状符合规格#2、
   播放有声（Speex 词条预期=喇叭不出现，不报错）、不越库。
输出：PASS/FAIL + 截图路径 + 真机清单。
```

## 已知实测样本（实现时起手用，勿重跑）

- 活跃库=~/Library/Application Support/com.desktop-translation/dictionaries.db（8.9 万 resources 58 万+4 词典健康）
- LPron3 残段样本：hello 音标=uning `AmE\ -ˈloʊ`（DSL 转义残迹）
- MW11 音标=\hə-ˈlō, he-\；OALD8=[həˈləʊ]（方括号）；LPron3 纯文本无括号型
- 多义项次位音（run z_ran 等的精准归属）仍未做（规格排除，留待后续任务）
