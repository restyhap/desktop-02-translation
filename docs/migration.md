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

- [ ] src 视觉与 front-preview 一致（tokens/组件/页面/弹窗/图标/PageHeader）
- [ ] src 业务逻辑零改动（storage/hooks/listen/init 不动，diff 只允许视觉层）
- [ ] mock/tauri 混线为零（grep "mock" 在 src 无命中——除注释说明）
- [ ] i18n 九语可用（设置可见切换），默认 zh
- [ ] tsc 0 错误 + pnpm build 通过 + smoke 截图
- [ ] 每阶段有 commit；最终报告含映射表核对结果与遗留清单
```
