# src 迁移计划 v1：front-preview v2 界面 → src（保留业务逻辑）

> 目标：把 front-preview 的界面/样式/交互整版迁移进 `src/`，**src 的全部业务逻辑零改动保留**。
> 原则：src 是业务事实层（tauri invoke/listen/storage/hooks），preview 是视觉事实层（tokens/组件/页面布局）。
> 迁移 = 替换 src 的「视觉层」，嫁接到 src 的「业务层」上；禁止把 mock/tauri 依赖混入组件。

---

## M0 契约冻结（先于一切实现）

1. **证据清单**：通读 front-preview/src 全部文件与 src 全部文件，产出两张映射表（写入本文件附录，修订需同步）：
   - 「组件映射表」：preview 组件 → src 目标文件（替换/合并/新增），标注差异点；
   - 「数据源映射表」：preview `@/mock/*` 导入 → src `@/storage`（Store/函数），标注签名差异（snake_case 残留、favorite 0/1、TranslationRecord 字段）。
2. **快照**：git 已有回滚点 `d18c011`；迁移全程在同一分支小步 commit（每 Phase 至少 1 个）。
3. **红灯纪律**：src 侧的 `src-tauri/`、`storage/index.ts`、`storage/*.ts`、`translate.html` 入口配置、
   `main.tsx` 的 Provider 顺序**只允许增不允许改语义**；破坏性 diff 必须单独说明理由。

## S1 基建层移植提示词（Phase 1 先行）

```text
角色：谨慎的迁移工程师。目标：让 src 获得 front-preview 的全部「地基」，不碰业务。

改动范围（仅这些，其余禁止）：
 1. styles.css：以 preview 版为基底重写（@theme tokens、light/dark 双主题、
    rise-in、细滚动条、font-display、--shadow-card/lift/popup）；若 src 既有
    shadcn 语义 token（--color-bg 等）被别处引用，保留同名注释或映射，禁止删引用。
 2. 新增 src/lib/i18n.ts（preview 同版本，0 依赖）；main.tsx 最外层包 LocaleProvider。
 3. icons.tsx：整版替换为 preview 版（🌐地球/⏱时钟回拨/📜卷轴/📖对开书/⚙️齿轮…全套）。
 4. ui/*：Button/Input/Misc(Select,Badge,EmptyState)/Toast 替换为 preview 版
    （Toast 保留 src 现有调用点 MenuItem/DictionarySection/ApiKeySection 的 showToast 形状）。
 5. 新增 components/PageHeader.tsx、TranslateChipsRow.tsx、RecentStrip.tsx、
    TTSButton/DictBody/DictEntryView/ShortcutRecorder 以 preview 版覆盖。
 6. hooks：useTheme（preview 版）并入 src（src 原无 useTheme）。
红线：所有新文件 import 只允许指向 src 内部路径；禁止 import "@/mock/*"。
验证：pnpm exec tsc --noEmit 0 错误 + pnpm build 成功（src 目录）。
```

## S2 组件/页面映射提示词（Phase 2）

```text
角色：迁移实现者。按「组件映射表」逐项迁移，每项三步：以 preview 版为视觉蓝本 →
把数据获取换成 src storage（组件内禁止 import mock）→ 保持 preview 的 props 形状。

关键映射（以实际读取为准，表冲突时以 src 代码为准）：
 - HistoryList → 套用 preview HistoryPanel 时间线视觉；数据 = store.getTranslations、
   toggleFavorite/deleteTranslation（src 既有）；{key=historyVersion} 强刷机制保留。
 - VocabularyPanel → preview 分组画布视觉；数据 = src storage 组/词 CRUD 六命令。
 - DictionaryPanel+DictEntryView → preview hero 查询 + 文章式词条卡；数据 = src dict_* 命令。
 - SettingsPanel → preview 双栏（w-44 rail 整层高 + 右列独立滚动 + 锚点跳转）；
   数据/交互 = src getSettings/saveSettings/getShortcuts/updateShortcuts/
   getDictPaths/saveDictPaths/listApiKeys/add/reorder/delete 等，dnd-kit 沿用 src 依赖。
 - TranslationInput → preview 一体化卡（纯句子翻译职责：无联想、无词典芯片、Enter 恒译）；
   onTranslate 走 src useTranslationState.translateAndApply。
 - TranslationResultPanel → 回信卡视觉；engine 列表来自 src listApiKeys。
 - TranslatePopup → preview 视觉 + focus trap + 自动隐藏；**事件源改为 src 的
   getCurrentWindow().listen("show-translate")**（preview 是 mock/bus，禁止带入）；
   settings 的 opacity/hideDelay 从 src getSettings 读取。
 - App.tsx → 保留 src 全部业务（init_database/listen/dbError/useTranslationState/
   词典状态机），布局壳替换为 preview 单页单焦点舞台 + Sidebar/PageHeader 路由；
   TranslateChipsRow（仅引擎）放输入框与结果卡之间；RecentStrip 数据 = getTranslations 前 5 条。
 1:1 换数据源时注意：src 返回 snake_case 字段由 src storage 已映射，组件层按 camelCase 写。
自验证链：tsc 0 错误 → pnpm build → 提交 commit（Phase 2 完成点）。
```

## S3 验证提示词（Phase 3）

```text
role：Tester。验证矩阵：
 1. pnpm typecheck/tsc --noEmit（src）0 错误；pnpm build 成功。
 2. pnpm dev 起 :1420，agent-browser 打开——预期：无 tauri 环境会出现
    dbError/命令失败占位（这是正常失败态，不算 bug），但**布局壳/Sidebar/
    样式 token/i18n 中文默认**必须完整渲染；截图 src-smoke-*.png。
 3. pnpm tauri dev（若环境可跑）：主窗口真实渲染 + 划词弹窗窗口可见 =
    完整验证；跑不完则如实标注「窗口级验证未覆盖」。
 4. i18n：设置切 en→布局无溢出；回 zh。
报告：PASS/FAIL + 截图；禁止口头通过。
```

## S4 完成定义（DoD）

- [x] src 视觉与 front-preview 一致（tokens/组件/页面/弹窗/图标/PageHeader）
- [x] src 业务逻辑零改动（storage/hooks/listen/init 不动，diff 只允许视觉层）
- [x] mock/tauri 混线为零（grep "mock" 在 src 无命中——除注释说明）
- [x] i18n 九语可用（设置可见切换），默认 zh
- [x] tsc 0 错误 + pnpm build 通过 + smoke 截图
- [x] 每阶段有 commit；最终报告含映射表核对结果与遗留清单

---

## 附录：迁移映射表（实施后核对版，2026-09-29）

### A. 组件映射表（preview → src 目标文件）

| preview 文件 | src 目标 | 处理 | 实测差异点（以代码为准） |
|---|---|---|---|
| src/styles.css | src/styles.css | 整版替换 | 追加旧 shadcn 语义 token 的 @theme 别名段（兼容层，增量保留） |
| src/lib/i18n.ts | src/lib/i18n.ts 整版迁入 | 新增 | 剔除 footer.popupPreview*/mock.previewTag 九语词条；footer.notice/app.docTitle 改正式文案；保留 tr/getUiLocale（无 mock import，注释注明出处） |
| src/components/icons.tsx | 整版迁入 | 新增 | 与 preview 完全一致 |
| src/hooks/useTheme.ts | 整版迁入 | 新增 | import 改自 @/types/settings（同形状） |
| src/components/ui/Button.tsx | 替换为 preview 版 | 重写 | 无消费者旧版直接替换；src 旧 4 变体 API 无引用方（grep 证实） |
| src/components/ui/Input.tsx | 替换（含 Textarea 同文件） | 重写 | 旧 ui/Textarea.tsx/ui/Select.tsx/ui/Badge.tsx/ui/Card.tsx 删除（零引用方） |
| src/components/ui/Misc.tsx | 新增（Select/Badge/EmptyState） | 新增 | 旧 ui/Select 的 options-prop API 无引用方，直接以 preview 口径为准 |
| src/components/ui/Toast.tsx | 替换 | 重写 | 保留 showToast(message, type) 形状（调用点 ApiKeySection/DictionarySection 已并入新 SettingsPanel）；多 Toast 队列 + 状态色条 |
| src/components/PageHeader.tsx | 整版迁入 | 新增 | 一致 |
| src/components/TranslateChipsRow.tsx | 整版迁入 | 新增 | 仅引擎芯片；数据源 App.listApiKeys→EngineChip{service,label}（camelCase 边界映射） |
| src/components/RecentStrip.tsx | 迁入 | 新增 | 数据类型改为 UI 形态 TranslationResult（mapRecordToUi 后），字段 sourceText/translatedText；视觉与 preview 一致 |
| src/components/TTSButton.tsx | 替换为 preview 版 | 重写 | 视觉缩到 h-7 胶囊；src 版 h-10 圆形废弃 |
| src/components/DictBody.tsx | 整版迁入 | 新增 | DictLine 改从 src/lib/parseDefinition 导入（src 文件 + 既有测试保留） |
| src/components/DictEntryView.tsx | 重写 | 替换 | 视觉 preview；资源 API 换 src dictLoadResources/dictGetResource（zip_file/mime/data_base64）；DictEntry 本地接口保留（+dictionary_name 可选）；onClose 可选 |
| src/components/ShortcutRecorder.tsx | 重写 | 替换 | 交互 = src 版（e.key 解析/序列窗/disabled 保护）；视觉 = preview（h-8 min-w-32 + kbd chips + i18n title） |
| src/components/Sidebar.tsx | 整版迁入 | 新增 | 语言图标替代 src 版 logo + emoji 导航 |
| src/components/TranslationInput.tsx | 重写 | 替换 | 一体化卡；去掉 src 版联想/词典芯片/判词分流（职责移交词典页）；EngineChip 导出保留 |
| src/components/TranslationResultPanel.tsx | 重写 | 替换 | 回信卡；引擎切换移交 TranslateChipsRow；收藏星为静态视觉（与 preview 相同） |
| src/components/TranslatePopup.tsx(root) | 重写 | 替换 | 事件源 = getCurrentWindow().listen("show-translate")；拖拽 + 8 向 resize 热区保留 src 原生窗口能力；预览 overlay（App 内弹窗）未迁（src 为独立窗口） |
| src/pages/HistoryPanel.tsx | 迁入 | 新增 | 数据 store.getTranslations+mapRecordToUi；toggleFavorite 返回 void → 本地翻转；key={historyVersion} 保留 |
| src/pages/VocabularyPanel.tsx | 迁入 | 新增 | Store 六命令 async；toast 全 i18n；颜色调色板对齐 |
| src/pages/DictionaryPanel.tsx | 迁入 | 新增 | DictInfo 复用 @/storage/dict；进度条：src 全库构建无进度回传 → 不确定态脉冲条（标签沿用 i18n 文案） |
| src/pages/SettingsPanel.tsx | 重写 | 替换 | preview 双栏（w-44 rail + 右列滚动 + 锚点跳转）；业务全 src：dnd-kit react（非 preview 的 @dnd-kit/core，依赖表没有）+ RestrictToParentElement、AddKeyModal（名称/ID/Key/URL/默认引擎 Switch）、字典目录 plugin-dialog、快捷键 getShortcuts/updateShortcuts + disabled、check_update 按钮（原 src UpdateButton 内联收编） |
| src/components/DictChipsBar.tsx(preview) | 未迁 | — | preview 自身未接线（主页不混词典芯片），src 亦无 enabledDicts 状态机；遗留清单注明 |
| src/components/HistoryList.tsx 等旧组件 | 删除 | — | git rm：HistoryList/settings/*(6)/UpdateButton/VocabularyPanel/DictionaryPanel/SettingsPanel 旧版 |

### B. 数据源映射表（preview mock → src storage）

| preview 调用（@/mock/store|engine|bus） | src 数据源 | 签名差异 / 处理 |
|---|---|---|
| getDbStatus/initDatabase | getDBStatus/initDB（storage/index） | src getDBStatus→boolean（异步就绪轮询）；init 启动流程保留 src listen(__tauri__init)+500ms 重试 |
| getTranslations | store.getTranslations | src 返回 TranslationRecord(snake) → mapRecordToUi 转 UI 形态（HistoryPanel/RecentStrip 消费 camelCase） |
| toggleFavorite（返回 0/1） | store.toggleFavorite（void） | 调用后本地翻转状态（失败回正说明见代码注释） |
| deleteTranslation | store.deleteTranslation | 无差异（async 化） |
| saveTranslation(mock) | — | UI 不直接落历史；落库在 useTranslationState.translateAndApply（src 原逻辑） |
| getVocabularyGroups/Words/addGroup/deleteGroup/addWord/deleteWord | store.同名六命令 | mock 同步返回对象；src addVocabularyGroup 返回新 id（Promise<string>），add 后 refetch |
| listApiKeys | storage.listApiKeys | mock ApiKeyItem{service,display_name,key_tail}；src ApiKeyOption{service_name,display_name}+可选 app_id/api_key；App/popup 处映射为 EngineChip{service,label}（camelCase 纪律） |
| addApiKey/deleteApiKey/reorderApiKeys/addEngine/deleteEngine/getEngines | storage 同名 | 语义对齐 src ApiKeySection 原交互（含 AddKeyModal） |
| listDicts/dictHasDb/dictLookup/dictBuild/dictSuggest | storage/dict 同名 | src dictLookup 返回 {found, entry}（mock 返回 entry 直接判空）；dictSuggest 主页不再使用（职责移交词典页）；dictBuild 全库无进度 → buildingId 视觉记账 + 脉冲条 |
| dictLoadResource/dictGetResource(mock) | dictLoadResources/dictGetResource | src 返回 {mime,data_base64} 由前端拼 dataUrl；kind 为 string（非 mock 的 "audio"\|"image" 字面量），按值比较渲染 🔊/🖼 |
| getDictPaths/saveDictPaths | storage 同名 | mock「＋选择目录」插假路径 → src plugin-dialog open(directory) |
| getSettings/saveAllSettings | getSettings/saveSettings | 全量 AppSettings 对象；App 持有 + patch 深拷贝回传；popup 只取 translation.defaultSourceLang/defaultTargetLang 与 appearance.opacity/hideDelay |
| checkUpdate(mock) | invoke("check_update") | src UpdateButton 业务保留，视觉并入新面板 |
| mockTranslate/detectLanguage | —（禁止迁） | UI 用 useTranslationState.translateAndApply 落库翻译；检测不迁移（src 无该能力，保持 src 行为） |
| emitShowTranslate/onShowTranslate（mock/bus） | getCurrentWindow().listen("show-translate") | App 内不挂 bus；弹窗窗口语义为 src 独有（preview 仅红点演示） |
```
