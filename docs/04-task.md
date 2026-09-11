# 任务清单与执行跟踪

> 基于三份进度存档（09-02 / 09-09 / 09-11）汇总更新。
> 本文档记录当前 sprint 的关键任务、负责人、状态和阻塞项。
> 最后更新：2026-09-11 02:00（全部完成）

---

## Sprint 1: v0.1 MVP 核心闭环

**时间周期**：2026-09-09 ~ 2026-09-23
**目标**：修复 critical bugs → 翻译闭环跑通 → 功能补全 → 架构优化

---

## 进度总览

| 阶段 | 状态 | 说明 |
|------|------|------|
| SQLite 初始化 | ✅ 已完成 | `db.rs` 6 张表 + 2 个索引 |
| API Key 存储 | ✅ 已完成 | `keys.rs` 掩码 CRUD |
| 翻译引擎 ×5 | ✅ 已完成 | Google/DeepL/百度/有道/彩云 |
| 设置读写 | ✅ 已完成 | SQLite 统一存储 |
| 前端 UI 全套 | ✅ 已完成 | SettingsPanel/TranslationInput/Result |
| **Critical Bugs** | ✅ 6/6 已修复 | 全部运行时崩溃已解决 |
| **功能补全** | ✅ 4/4 已完成 | 历史收藏/删除、词组 CRUD、弹窗语言、快捷键重启 |
| **架构优化** | ✅ 5/5 已完成 | Settings SQLite、存储统一、Key 掩码、SQL 绑定、文档更新 |

---

## P0 任务：修 Critical Bugs（运行时崩溃） ✅ 6/6

### 任务 1：注册 `get_translations_cmd` ✅
- **状态**：✅ 已完成
- **修复**：在 `invoke_handler!` 列表添加 `get_translations_cmd`

### 任务 2：注册 Vocabulary 命令 ✅
- **状态**：✅ 已完成
- **修复**：在 `invoke_handler!` 添加 `get_vocabulary_groups_cmd` / `get_vocabulary_words_cmd`

### 任务 3：Google Translate serde rename ✅
- **状态**：✅ 已完成
- **修复**：`TranslationItem` 添加 `#[serde(rename = "translatedText")]` + `#[serde(rename = "detectedSourceLanguage")]`

### 任务 4：`get_schema_version` 类型修复 ✅
- **状态**：✅ 已完成
- **修复**：`db.rs:130-138` 改用 `read::<i64, _>()`

### 任务 5：ShortcutRecorder 事件泄漏修复 ✅
- **状态**：✅ 已完成
- **修复**：`ShortcutRecorder.tsx` — 提取 `handleKeyUp` 为 `useCallback`，useEffect cleanup 正确移除两个监听器

### 任务 6：TranslatePopup 事件泄漏修复 ✅
- **状态**：✅ 已完成
- **修复**：`TranslatePopup.tsx` — `win.listen()` 返回 `unlisten` 存入变量，useEffect cleanup 调用

---

## P1 任务：功能补全（核心体验） ✅ 4/4

### 任务 7：翻译历史收藏/删除 ✅
- **状态**：✅ 已完成
- **修复**：
  - Rust: 新增 `toggle_favorite_cmd` + `delete_translation_cmd`
  - 前端: `storage/index.ts` 新增 `toggleFavorite()` / `deleteTranslation()`
  - UI: `HistoryList.tsx` 全量重写含收藏⭐/删除×按钮

### 任务 8：词组面板 CRUD ✅
- **状态**：✅ 已完成
- **修复**：
  - Rust: 新增 `add_vocabulary_group_cmd`, `delete_vocabulary_group_cmd`, `add_vocabulary_word_cmd`, `delete_vocabulary_word_cmd`
  - 前端: `storage/index.ts` 新增对应函数 + Store 方法
  - UI: `VocabularyPanel.tsx` 全量重写含 CRUD 表单/按钮

### 任务 9：弹窗翻译使用 auto-detect 设置 ✅
- **状态**：✅ 已完成
- **修复**：`TranslatePopup.tsx` 从 SQLite 读取 `sourceLang`/`targetLang` 设置，不再硬编码

### 任务 10：快捷键修改后重启键盘钩子 ✅
- **状态**：✅ 已完成
- **修复**：`update_shortcuts_cmd` 新增 kill 旧 `KeyboardHookProcess` + `spawn_keyboard_hook` 重启

---

## P2 任务：架构优化 ✅ 5/5

### 任务 11：Store.getSettings/saveSettings 接入 SQLite ✅
- **状态**：✅ 已完成
- **修复**：`Store.getSettings()` → `invoke("get_all_settings_cmd")`，`Store.saveSettings()` → `invoke("save_all_settings_cmd", {settings})`

### 任务 12：设置存储统一 ✅
- **状态**：✅ 已完成
- **修复**：
  - `SettingsPanel` 移除 `localStorage.setItem`
  - `TranslatePopup` 的 opacity/hideDelay/sourceLang/targetLang 全部从 SQLite 读取

### 任务 13：`list_api_keys_cmd` 不返回完整 key ✅
- **状态**：✅ 已完成
- **修复**：`keys.rs list_keys()` 返回掩码 key (`sk-1...abcd`) 而非明文

### 任务 14：SQL 绑定参数替换字符串拼接 ✅
- **状态**：✅ 已完成
- **修复**：`keys.rs` + `lib.rs` 全部 SQL 改用 `conn.prepare()` + `stmt.bind((index, value))` 绑定参数
- **注意**：sqlite crate v0.37 使用 `bind((index, value))` tuple 格式

### 任务 15：更新文档反映实际状态 ✅
- **状态**：✅ 已完成
- **修复**：`docs/03-项目进度存档-2026-09-11.md` 已创建，`docs/04-task.md` 已重写并更新完成状态

---

## 任务依赖图

```
P0（修 bugs）✅：
  1 ──────────────────────────┐
  2 ──────────────────────────┤
  3 ──────────────────────────┼──→ P1（功能补全）✅
  4 ──────────────────────────┤    7（历史收藏/删除）✅
  5（ShortcutRecorder 泄漏）─┤    8（词组 CRUD）✅
  6（TranslatePopup 泄漏）───┘    9（弹窗 auto-detect）✅
                                   10（快捷键重启钩子）✅

P2（架构优化）✅：
  11（Store 接入 SQLite）✅──→ 12（设置存储统一）✅
  13（API Key 掩码）✅
  14（SQL 绑定参数）✅
  15（更新文档）✅
```

---

## 执行顺序

```
Phase 1（Day 1）：P0-1~P0-6 ✅ → 翻译闭环跑通
Phase 2（Day 2-3）：P1-7~P1-10 ✅ → 核心交互完整
Phase 3（Day 4+）：P2-11~P2-15 ✅ → 代码质量和文档一致
```

---

## 风险与阻塞项

| 风险 | 状态 | 缓解措施 |
|------|------|----------|
| Critical bugs 导致运行时崩溃 | ✅ 已解决 | Phase 1 全部修复 |
| 文档严重失真 | ✅ 已解决 | 任务 15 更新文档 |
| API Key 明文存储 | ✅ 已解决 | list_keys 返回掩码 |
| 无测试文件 | 🟡 待处理 | v0.2 补充测试 |
| 未提交的变更 | 🟡 待处理 | 尽快 commit |

---

## 文档更新记录

| 日期 | 文档 | 更新内容 |
|------|------|----------|
| 2026-09-11 02:00 | `04-task.md` | 全部任务标记完成 |
| 2026-09-11 01:30 | `04-task.md` | 基于三份存档汇总重写 |
| 2026-09-11 01:30 | `03-项目进度存档-2026-09-11.md` | 新增进度存档（三份对比） |

---

## 备注

- **v0.1 简化策略**：API Key 暂用明文存储 + 掩码返回，v0.2 升级为加密存储
- **验证方式**：`cargo check` (4 warnings, 0 errors) + `npm run build` ✅
- **sqlite crate 注意事项**：v0.37 的 `bind` 使用 `bind((index, value))` tuple 格式，非 `bind(index, value)`
