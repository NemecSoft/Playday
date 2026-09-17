# Playday 开发准则（CONTRIBUTING）

> 本文档是 Playday 的开发规范。**每次改代码前先读这里**，尤其是第 2 节"优先用成熟方案"。

---

## 0. 交互方式：先反向提问，确认后再执行（最重要）

**做任何任务前，先分析、理解需求；然后在动手前反向提问，向用户确认要执行的具体行为。** 不要在理解可能产生歧义的情况下直接开干。

### 什么时候必须反向提问
当需求存在以下任何一种歧义时，必须用 `ask_followup_question` 确认后再执行：
- **匹配规则**（如用 `name` 匹配数据库，命中不了怎么办）
- **覆盖 vs 追加**（新数据是覆盖旧数据还是合并去重）
- **范围**（只动一部分，还是全部）
- **是否真正改数据/库**（直接写，还是先 dry-run 看结果）
- **文件/目录**（处理哪个路径、产物放哪）
- 任何"我理解可能有多种做法"的决策点

### 流程
1. **分析**：读懂需求，读相关的数据文件 / 代码 / 配置，明确有哪些决策点。
2. **提问**：用 `ask_followup_question` 一次性问清最关键的 1~3 个歧义点（不要一次问太多）。
3. **确认**：收到用户答复后，按其选择执行。
4. **同步**：需求、方案、结果如影响项目，同步到记忆与本文档。

### 示例
- "按照 xxx.json 给游戏更新标签" → 问：匹配用 name 吗？命中不了跳过还是报错？是覆盖现有 tags 还是合并去重？
- "改一下卡片样式" → 问：是全局统一改，还是加设置项可调？范围是卡片标题还是也含别名/侧栏？

> 记忆里也存了这条约定（Playday 交互方式：先反向提问确认再执行）。

---

## 1. 技术栈

| 领域 | 选型 |
|------|------|
| 前端框架 | React 18 + Vite |
| 状态管理 | Zustand 5 |
| 样式 | Tailwind v3 + `src/styles/global.css`（CSS 变量驱动多主题） |
| **UI 组件库** | **shadcn/ui**（`src/components/ui/`），基于 Radix + Tailwind |
| 国际化 | i18next（字典在 `src/i18n/locales/{en,zh-CN,zh-TW}.ts`） |
| 桌面端 | Electron（主进程 `electron/`） |
| 网站端 | Node（`server/server.mjs`） |

---

## 2. 核心规范：优先使用成熟方案（最重要的规则）

### 2.1 总原则

> **有成熟的组件、规范、实现，就优先用现成的；能不自己手动实现，就绝不手动实现。**

这条是 Playday 的第一开发规范。一切"通用功能"（UI 控件、弹窗、标签页、开关、滚动条、格式化等）都应优先使用已验证的成熟方案，**不要为了局部需求手写底层实现**。

### 2.2 UI 控件——一律用 shadcn 组件，不手写原生控件

`src/components/ui/` 是 Playday 的 shadcn 组件库，**做 UI 时优先从这里取**，没有的再补 shadcn 组件：

| 场景 | 用这个组件 | 不要手写 |
|------|-----------|---------|
| 按钮 | `Button` | `<button>` |
| 输入框 | `Input` | `<input type="text">` |
| 滑杆 | `Slider` | `<input type="range">` |
| 复选框 | `Checkbox` | `<input type="checkbox">` |
| 开关 | `Switch` | 手写 toggle |
| 下拉选择 | `Select` | `<select>` |
| 多行文本 | `Textarea` | `<textarea>` |
| 弹窗 | `Dialog` | 手写 modal |
| 标签页 | `Tabs` | 手写 tab 状态 |
| 颜色选择 | `ColorInput` | 手写 `<input type="color">` 布局 |
| 标签/说明 | `Label` | 手写 `<span>` |

**硬性要求**：
- 业务组件里**不允许**直接出现原生 `<input>`/`<select>`/`<textarea>` 写 UI 控件；都要用 `src/components/ui/` 的组件。
- 如果某控件 shadcn 没有（如颜色取色器），**在 `ui/` 下封装一个标准组件**（如 `ColorInput`），供多处复用，而不是在业务组件里各写各的。
- 需要新的通用控件时，**先补 shadcn 组件**（Radix + shadcn 规范实现），不要临时手写。

### 2.3 其他通用能力——用生态成熟库，不手写

- HTTP / 文件 / 数据库 / 序列化等基础设施：用生态成熟库（Electron / Node 内置 / sql.js 等），不手写底层。
- 动画：用 framer-motion（已装）；不要手写 CSS 动画模拟复杂交互动效。
- 自研代码只负责"把成熟方案接到本项目的模型与目录约定"，接完要在文档里说明选择了哪个方案、为什么。

### 2.4 为什么这么规定

- 手写控件样式不统一（不同人写出不同样式的 checkbox / slider），观感像"半成品"。
- 手写控件缺无障碍（键盘操作、读屏、焦点管理），可访问性差。
- 手写控件重复实现，后续改样式要改多处。
- shadcn 组件有统一规范 + Radix 的可访问性 + Tailwind 的原子类，一次实现到处复用。

---

## 2.5 数据唯一权威源：游戏标签（tags）

> **`games_tags.json`（`D:/AI/games-web/`）是临时权威源，权威数据库是 `<数据根>/Admin/library.db`，运行时副本是 `<数据根>/library/library.db`，侧边栏按更新后数据库里的标签统计、显示。** json 有多少种标签类别，侧边栏就应该有多少种。

**双库机制（务必分清，否则会改错库）**：
- `paths.ts` 里 `sourceDatabasePath()` = `<库根>/Admin/library.db`（**源库**：数据来源，由手工维护的**整库 JSON**（`dev-data/library-json/`，见 [library-json.md](./design/library-json.md)）+ 脚本写入；客户端启动时复制成运行时库）。
- `runtimeDatabasePath()` = `<库根>/library/library.db`（**运行时副本**：客户端每次启动 `openDb()` 在 `db.ts` 把 Admin 权威库 `copyFileSync` 复制过来再用）。
- `<库根>` 默认是数据根（`settings.libraryDir`），权威库固定在 `<库根>/Admin`（**推导，没有单独字段**）—— 写脚本时别再把数据根拼死，也别写死 `Admin/`。
- **为什么要两级**：玩家可能**正在游戏**，存档要读库里的存档路径；这时一旦"更新"破坏了 `library/library.db`，就存不了档。所以把它做成**可丢弃副本**（读写只在副本上，每次启动从权威库重建）。因此只开放**目录**配置，文件名恒为 `library.db`。
- **所以同步/写标签一律针对 `Admin/library.db`**，改运行时副本是白费——下次启动会被 Admin 覆盖。
- **游戏路径格式**：只有两种合法形态 —— **绝对路径**（`X:\YunGame\Z\a.exe`）或 **`{InstallDir}\相对路径`**（相对安装目录的写法见 [启动与路径规则](./design/launch-and-paths.md)）。
  ⚠️ 2026-09-16 起**库占位符 `{Gamelibrary1}` 已废弃**（`game_libraries` 整套移除），路径按原样入库、不再自动规范化。

**约定**：
- 侧栏标签统计只允许在 `src/components/Sidebar.tsx` 一处聚合（读 `useGamesStore.games`），不要多处各自统计。
- 管理端手动编辑标签走 `IPC upsert_game → db.ts:upsertGame`。

**统一导入/清理脚本（唯一入口）**：
- `scripts/sync-tags-from-json.mjs`：从 json 完全覆盖【权威库 Admin/library.db】的 tags + 兜底清理 `Tag:` 残留。默认 dry-run，`--apply` 才写库并备份 `.bak`。
- 匹配规则：完全覆盖、严格相等 `name` 匹配、库有 json 无则跳过保留（此类残留 `Tag:` 需手动清）、json 有库无则跳过。
- 已删除旧的分散脚本 `restore-tags-from-bak.mjs` / `apply-tags-from-json.mjs` / `clean-auto-tags.mjs`，**不要再创建"能直接改库标签"的第二个脚本**，避免多源不统一。

---

## 3. 工程规范

1. **先读再改**：修改前先读取文件理解上下文。
2. **遵循既有模式**：沿用 `src/components`、`src/stores`、`electron/ipc`、`server` 的现有模式。
3. **架构一致性**：考虑性能、可维护性、可测试性。
4. **代码风格**：匹配现有格式与模式。
5. **构建验证**：改动后运行 `npm run build`（主进程 + 前端一起）。
6. **不主动提交**：除非用户明确要求，否则不 commit / push。
7. **注释用中文、通俗易懂**：所有代码注释（TS / CSS / 脚本）一律中文，用大白话说明"做什么、为什么"，不写晦涩术语（见 system prompt 里的持久化规范）。

---

## 4. 如何新增一个 shadcn 组件

1. 在 `src/components/ui/` 下新建 `xxx.tsx`，按 shadcn 规范实现（用 `cn()` + Radix + Tailwind）。
2. 依赖的 Radix 包先 `npm install @radix-ui/react-xxx`。
3. 参照已存在的 `slider.tsx` / `checkbox.tsx` / `select.tsx` 的风格写。
4. 组件注释用中文说明用途，并补到第 2.2 节的表格里。

---

## 5. 文档同步

数据模型 / 功能 / 目录变更后，更新 `ARCHITECTURE.md`（架构）、本文件（规范）、并视需要追加变更说明。
