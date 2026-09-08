# Mock-Driven UI 开发规则

## 核心理念

**UI 优先，数据 Mock 先行，最终收敛到数据库模型。**

```
界面设计 → Mock 数据填充 → 类型定义 → 本地存储 → 数据库建表
   ↑                                              ↓
   └──────────── 持续迭代 ←─────────────────────────┘
```

## 开发流程

### 阶段一：界面原型（当前）

1. **先画界面**：用静态数据/硬编码文本搭建 UI 骨架
2. **定义 Mock 数据结构**：在 `src/mocks/` 目录创建 mock 数据
3. **组件接入 Mock**：组件从 mock 文件读取数据，不硬编码
4. **界面评审**：确认布局、交互、视觉效果

### 阶段二：类型收敛

1. **提取 TypeScript 类型**：从 mock 数据结构推导出 interface/type
2. **统一类型定义**：所有 mock 数据必须有对应类型
3. **Mock 数据工厂**：使用 faker.js 或手写工厂函数生成测试数据

### 阶段三：本地存储

1. **Storage 层抽象**：创建 `src/storage/` 目录，定义 CRUD 接口
2. **Mock → Storage 迁移**：将 mock 数据源切换到 localStorage/IndexedDB
3. **数据迁移脚本**：mock 数据 → 本地存储的迁移工具

### 阶段四：数据库建表

1. **从 TypeScript 类型推导 SQL Schema**：类型 → Prisma/SQL schema
2. **Rust 后端集成**：通过 Tauri IPC 调用 Rust 端数据库操作
3. **数据迁移**：本地存储 → SQLite 的迁移脚本

## 目录结构

```
src/
├── mocks/                    # Mock 数据目录
│   ├── index.ts              # Mock 数据统一导出
│   ├── translations.ts       # 翻译历史 mock
│   ├── dictionaries.ts       # 词典 mock
│   ├── settings.ts           # 设置 mock
│   └── types.ts              # Mock 数据类型定义
├── types/                    # TypeScript 类型定义
│   ├── translation.ts        # 翻译相关类型
│   ├── dictionary.ts         # 词典相关类型
│   └── settings.ts           # 设置相关类型
├── storage/                  # 本地存储层（阶段三）
│   ├── index.ts              # 存储接口定义
│   └── localStorage.ts       # localStorage 实现
└── components/               # UI 组件
    └── ...                   # 从 mock 读取数据
```

## Mock 数据规范

### 1. 每个 Mock 文件必须导出类型

```typescript
// src/mocks/translations.ts
import type { TranslationHistory } from '../types/translation';

export const mockTranslations: TranslationHistory[] = [
  {
    id: '1',
    sourceText: 'Hello, world!',
    translatedText: '你好，世界！',
    sourceLang: 'en',
    targetLang: 'zh',
    engine: 'google',
    timestamp: Date.now(),
    favorite: false,
  },
  // ...更多 mock 数据
];
```

### 2. Mock 数据必须覆盖边界情况

- 空数据：`[]`
- 大量数据：≥50 条（测试滚动/分页）
- 特殊字符：emoji、RTL 文本、超长文本
- 错误状态：网络错误、API 限流

### 3. Mock 数据接口

```typescript
// src/mocks/index.ts
export { mockTranslations } from './translations';
export { mockDictionaries } from './dictionaries';
export { mockSettings } from './settings';

// 统一的 mock 数据获取函数
export function getMockData<T>(key: string): T[] {
  // 阶段一：返回静态 mock
  // 阶段二：返回带类型的 mock
  // 阶段三：返回 localStorage 数据
  // 阶段四：调用 Rust IPC
}
```

## 禁止事项

- ❌ 组件内硬编码数据（必须从 mock 导入）
- ❌ mock 数据无类型定义
- ❌ 跳过类型收敛直接写数据库
- ❌ 不同组件使用不同格式的 mock 数据

## 检查清单

每个 PR 提交前：
- [ ] 新增/修改的 mock 数据有对应类型
- [ ] 组件从 mock 读取数据，无硬编码
- [ ] mock 数据覆盖正常和边界情况
- [ ] 类型定义与 mock 数据结构一致
