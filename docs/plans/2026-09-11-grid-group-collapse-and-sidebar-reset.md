# 分组折叠 + 侧栏重置 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主界面每个分组用一个明显的方框框住、标题可点击折叠/展开；侧栏标题右侧加一个常驻的「重置」按钮，只清空已勾选的值。

**Architecture:** 折叠在**拍平阶段**实现 —— `useVirtualGrid` 跳过已折叠组的卡片行，行数变化后虚拟列表自动重新测量。分界框**不用额外容器**：因为相邻行上下边缘严丝合缝，把边框分散画在标题栏（四边+上圆角）、组内卡片行（左右）、组内最后一行（左右+下+下圆角）上，即可拼成一个连续闭合的框。

**Tech Stack:** React 18 + Zustand + TypeScript + Tailwind + 原生 CSS（`src/styles/global.css`）、`@tanstack/react-virtual`。

## Global Constraints

- 分组**默认全部展开**；折叠状态放 `gamesStore`（会话内记忆），**不写 config.json**。
- **不做**「全部展开 / 全部折叠」按钮；**不做**绕过虚拟化的整组容器（会退回全量挂载）。
- 侧栏「重置」= **只清空 `facetValues`**；`facet`（维度）和 `facetMode`（AND/OR）保持不动。
- 重置按钮**常驻显示**，`facetValues.length === 0` 时 `disabled`。
- 原来「已选 N 个XX」行里的「清空」按钮**移除**（与重置重复）；`sidebar_clear` key 保留在 JSON 里（变为未引用，无害）。
- i18n 只改顶层 `locales/{zh-CN,zh-TW,en}.json`；**不要动** `src/i18n/locales/*.ts`（死代码）。
- 前端 `tsc` 基线报错 = **43 行**；`npx tsc -p tsconfig.json --noEmit` 任何时刻不得超过该基线。
- 项目**没有可运行的测试框架**（`vitest` 未安装），验证用 `tsc --noEmit` + `npm run build` + 手工验收。

---

### Task 1: `useVirtualGrid.ts` —— 折叠支持

**Files:**
- Modify: `src/hooks/useVirtualGrid.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `VirtualGridRow` 变为
    `{ type:"header"; key; groupKey; label; count; collapsed } | { type:"cards"; key; groupKey; games; isLastInGroup }`
  - `UseVirtualGridOptions` 新增 `collapsedGroups?: ReadonlySet<string>`

- [ ] **Step 1: 扩展行类型**

把：

```ts
/** A single windowable row: either a group header or a row of cards. */
export type VirtualGridRow =
  | { type: "header"; key: string; label: string; count: number }
  | { type: "cards"; key: string; games: Game[] };
```

替换为：

```ts
/** A single windowable row: either a group header or a row of cards. */
export type VirtualGridRow =
  | {
      type: "header";
      key: string;
      /** 分组原始 key（点击折叠时回传）。 */
      groupKey: string;
      label: string;
      count: number;
      /** 该组当前是否折叠（决定箭头方向）。 */
      collapsed: boolean;
    }
  | {
      type: "cards";
      key: string;
      groupKey: string;
      games: Game[];
      /** 是否是该组的最后一行（画下边框 + 下圆角，给分组框封底）。 */
      isLastInGroup: boolean;
    };
```

- [ ] **Step 2: 选项加 `collapsedGroups`**

在 `UseVirtualGridOptions` 里，`headerHeight?: number;` 之后加：

```ts
  /** 已折叠的分组 key 集合。折叠时不生成该组的卡片行（标题行保留）。 */
  collapsedGroups?: ReadonlySet<string>;
```

- [ ] **Step 3: 解构参数**

把：

```ts
export function useVirtualGrid({
  groups,
  cardWidth,
  cardGap,
  cardRowGap = 8,
  titleHeight = 46,
  groupGap = 22,
  headerHeight = 28,
}: UseVirtualGridOptions): UseVirtualGridResult {
```

替换为：

```ts
export function useVirtualGrid({
  groups,
  cardWidth,
  cardGap,
  cardRowGap = 8,
  titleHeight = 46,
  groupGap = 22,
  headerHeight = 28,
  collapsedGroups,
}: UseVirtualGridOptions): UseVirtualGridResult {
```

- [ ] **Step 4: 拍平时跳过已折叠组，并补新字段**

把：

```ts
    let cardIndex = 0;
    for (const group of groups) {
      flat.push({
        type: "header",
        key: `h:${group.key}`,
        label: group.label,
        count: group.games.length,
      });
      meta.push(headerRowHeight);
      if (cols > 0 && group.games.length > 0) {
        for (let i = 0; i < group.games.length; i += cols) {
          const key = `r:${group.key}:${i}`;
          flat.push({
            type: "cards",
            key,
            games: group.games.slice(i, i + cols),
          });
          meta.push(rowHeight);
          starts.set(key, cardIndex);
          cardIndex += Math.min(cols, group.games.length - i);
        }
      }
    }
    return { allRows: flat, rowMeta: meta, rowStartIndex: starts };
  }, [groups, cols, rowHeight, headerRowHeight]);
```

替换为：

```ts
    let cardIndex = 0;
    for (const group of groups) {
      const collapsed = collapsedGroups?.has(group.key) ?? false;
      flat.push({
        type: "header",
        key: `h:${group.key}`,
        groupKey: group.key,
        label: group.label,
        count: group.games.length,
        collapsed,
      });
      meta.push(headerRowHeight);
      // 已折叠的组不生成卡片行 —— 行数变少后虚拟列表会重新测量，
      // 折叠/展开因此天然生效，不需要额外的显隐逻辑。
      if (!collapsed && cols > 0 && group.games.length > 0) {
        const rowCount = Math.ceil(group.games.length / cols);
        for (let i = 0; i < group.games.length; i += cols) {
          const key = `r:${group.key}:${i}`;
          flat.push({
            type: "cards",
            key,
            groupKey: group.key,
            games: group.games.slice(i, i + cols),
            isLastInGroup: Math.floor(i / cols) === rowCount - 1,
          });
          meta.push(rowHeight);
          starts.set(key, cardIndex);
          cardIndex += Math.min(cols, group.games.length - i);
        }
      }
    }
    return { allRows: flat, rowMeta: meta, rowStartIndex: starts };
  }, [groups, cols, rowHeight, headerRowHeight, collapsedGroups]);
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: `GridView.tsx` 会因 `row.groupKey` / `row.isLastInGroup` 新增报错（预期的中间状态），
Task 3 消掉；总数最终回到 43。

---

### Task 2: `gamesStore.ts` —— 折叠状态

**Files:**
- Modify: `src/stores/gamesStore.ts`

**Interfaces:**
- Consumes: 无
- Produces: `collapsedGroups: string[]`、`toggleGroupCollapsed(key: string): void`

- [ ] **Step 1: 加 state 字段声明**

在 `groupBy: string;` 之后加：

```ts
  /** 已折叠的分组 key（仅本次会话记忆，不写 config.json）。 */
  collapsedGroups: string[];
```

- [ ] **Step 2: 加 action 声明**

在 `setGroupBy: (g: string) => void;` 之后加：

```ts
  toggleGroupCollapsed: (key: string) => void;
```

- [ ] **Step 3: 加初始值**

在 `groupBy: "none",` 之后加：

```ts
  collapsedGroups: [],
```

- [ ] **Step 4: 加实现**

在 `setGroupBy: (g) => set({ groupBy: g }),` 之后加：

```ts
  // 折叠/展开某个分组；key 就是分组的 label（groupGames 的 Group.key）。
  toggleGroupCollapsed: (key) =>
    set((s) => ({
      collapsedGroups: s.collapsedGroups.includes(key)
        ? s.collapsedGroups.filter((k) => k !== key)
        : [...s.collapsedGroups, key],
    })),
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: `gamesStore.ts` 自身无报错。

---

### Task 3: `GridView.tsx` —— 可点标题栏 + 行 class

**Files:**
- Modify: `src/components/views/GridView.tsx`

**Interfaces:**
- Consumes: `collapsedGroups` / `toggleGroupCollapsed`（Task 2）、`VirtualGridRow` 新字段（Task 1）
- Produces: 无（叶子组件）

- [ ] **Step 1: 订阅折叠状态**

在：

```ts
  const saveGridScroll = useScrollStore((s) => s.saveGridScroll);
  const takeGridScroll = useScrollStore((s) => s.takeGridScroll);
```

之前加：

```ts
  const collapsedGroups = useGamesStore((s) => s.collapsedGroups);
  const toggleGroupCollapsed = useGamesStore((s) => s.toggleGroupCollapsed);
  // Set 的引用必须稳定，否则 useVirtualGrid 的拍平 memo 每次渲染都会重算。
  const collapsedSet = useMemo(() => new Set(collapsedGroups), [collapsedGroups]);
```

同时把顶部 import 的 React 解构补上 `useMemo`：

```ts
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: 把 `collapsedGroups` 传给虚拟列表**

把：

```ts
  const { scrollRef, cols, totalSize, items, virtualizer, rowStartIndex, measureRow } =
    useVirtualGrid({ groups, cardWidth, cardGap, cardRowGap, titleHeight: titlePlusDesc });
```

替换为：

```ts
  const { scrollRef, cols, totalSize, items, virtualizer, rowStartIndex, measureRow } =
    useVirtualGrid({
      groups,
      cardWidth,
      cardGap,
      cardRowGap,
      titleHeight: titlePlusDesc,
      collapsedGroups: collapsedSet,
    });
```

- [ ] **Step 3: `renderRow` 的 header 改成可点标题栏，cards 加 class**

把：

```tsx
    if (row.type === "header") {
      return (
        <div className="group-header">
          {row.label}
          <span className="count">{row.count}</span>
        </div>
      );
    }
```

替换为：

```tsx
    if (row.type === "header") {
      return (
        <button
          type="button"
          className={`group-header ${row.collapsed ? "collapsed" : ""}`}
          onClick={() => toggleGroupCollapsed(row.groupKey)}
          aria-expanded={!row.collapsed}
          title={row.label}
        >
          <span className="group-chev">{row.collapsed ? "▸" : "▾"}</span>
          <span className="group-title">{row.label}</span>
          <span className="count">{row.count}</span>
        </button>
      );
    }
```

把：

```tsx
      <div className="game-grid" style={gridStyle}>
```

替换为：

```tsx
      <div
        className={`game-grid group-rows ${row.isLastInGroup ? "group-last" : ""}`}
        style={gridStyle}
      >
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 回到 **43 行**（基线）。

---

### Task 4: `global.css` —— 分组框 + 侧栏重置样式

**Files:**
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Task 3 产生的 class（`group-header` / `group-chev` / `group-title` / `group-rows` / `group-last`）、`sidebar-reset`
- Produces: 无

- [ ] **Step 1: 重写 `.group-header` 样式块**

把这一整块（含注释）：

```css
/* Group headers：改为"编辑部式"栏目题头——小号标签 + 延伸发丝线 + 末尾计数。
   原来是一个通栏填充药丸，体积和卡片一样大，喧宾夺主；
   现在它只做一件事：告诉你在哪一组，然后让开。 */
.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 12px;
  color: var(--text-secondary);
  background: none;
  padding: 2px 4px;
  margin: 4px 4px 12px;
  letter-spacing: 0.08em;
  /* 发丝线：从标题之后延展到行尾（结构分隔，不是装饰块） */
  border-bottom: 1px solid var(--hairline);
  padding-bottom: 7px;
}
.group-header .count {
  order: -1; /* 计数放在最前，作为"这一组有多少"的量化标签 */
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
```

替换为：

```css
/* 分组标题栏：可点击折叠/展开，同时充当"分组方框"的顶边。
   方框由标题栏（四边 + 上圆角）+ 组内卡片行（左右边框）+ 组内末行（左右 + 下边框 + 下圆角）
   拼成 —— 因为相邻虚拟行的上下边缘严丝合缝，边框能连成一条闭合的线。 */
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  /* 组与组之间的间隔：靠标题栏的上外边距撑开（高度会被 CardRowMeasurer 实测回写，
     所以不会造成虚拟列表行高错位）。 */
  margin-top: 22px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  background: var(--bg-item-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 10px) var(--radius-lg, 10px) 0 0;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease;
}
.group-header:hover {
  color: var(--text-primary);
  background: var(--bg-item-active);
}
/* 折叠时该组只剩这一行，改成四角圆角自成一条闭合的框。 */
.group-header.collapsed {
  border-radius: var(--radius-lg, 10px);
}
.group-chev {
  flex: none;
  width: 12px;
  font-size: 10px;
  line-height: 1;
  opacity: 0.75;
}
.group-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-header .count {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

/* 组内卡片行的左右边框，与该组标题栏连成一体。 */
.game-grid.group-rows {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}
/* 组内最后一行：封底 + 下圆角。 */
.game-grid.group-rows.group-last {
  border-bottom: 1px solid var(--border);
  border-radius: 0 0 var(--radius-lg, 10px) var(--radius-lg, 10px);
}
```

- [ ] **Step 2: 侧栏重置按钮样式**

在 `.sidebar-header-title` 规则块之后追加：

```css
/* 侧栏标题右侧的「重置」按钮：常驻显示，无勾选时禁用。 */
.sidebar-reset {
  margin-left: auto;
  flex: none;
  padding: 3px 9px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
  background: var(--bg-item-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius, 6px);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}
.sidebar-reset:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-item-active);
}
.sidebar-reset:disabled {
  opacity: 0.4;
  cursor: default;
}
```

---

### Task 5: `Sidebar.tsx` 重置按钮 + i18n

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `locales/zh-CN.json`、`locales/zh-TW.json`、`locales/en.json`

**Interfaces:**
- Consumes: `clearFacetValues`（已在 store）、`sidebar_reset`（本任务新增）
- Produces: 无

- [ ] **Step 1: 三个 locale 文件加 `sidebar_reset`**

`locales/zh-CN.json`：把

```json
  "toolbar_groupBy": "分组"
}
```

替换为：

```json
  "toolbar_groupBy": "分组",
  "sidebar_reset": "重置"
}
```

`locales/zh-TW.json`：把

```json
  "toolbar_groupBy": "分組"
}
```

替换为：

```json
  "toolbar_groupBy": "分組",
  "sidebar_reset": "重設"
}
```

`locales/en.json`：把

```json
  "toolbar_groupBy": "Group"
}
```

替换为：

```json
  "toolbar_groupBy": "Group",
  "sidebar_reset": "Reset"
}
```

- [ ] **Step 2: 标题行右侧加重置按钮**

把：

```tsx
          {/* 顶部：标题 */}
          <div className="sidebar-header">
            <span className="sidebar-header-title">{t("sidebar_title")}</span>
          </div>
```

替换为：

```tsx
          {/* 顶部：标题 + 重置（重置只清空已勾选的值，维度与 AND/OR 不变） */}
          <div className="sidebar-header">
            <span className="sidebar-header-title">{t("sidebar_title")}</span>
            <button
              type="button"
              className="sidebar-reset"
              onClick={clearFacetValues}
              disabled={facetValues.length === 0}
              title={t("sidebar_reset")}
            >
              {t("sidebar_reset")}
            </button>
          </div>
```

- [ ] **Step 3: 移除「已选 N 个XX」行里重复的清空按钮**

把：

```tsx
            <div className="sidebar-clear-row">
              <span className="sidebar-clear-info">
                {`已选 ${facetValues.length} 个${t(facetLabelKey)}`}
              </span>
              <button className="sidebar-clear-btn" onClick={clearFacetValues}>
                {t("sidebar_clear")}
              </button>
            </div>
```

替换为：

```tsx
            <div className="sidebar-clear-row">
              {/* 清空动作已移到标题右侧的「重置」按钮，这里只保留已选数量的提示。 */}
              <span className="sidebar-clear-info">
                {`已选 ${facetValues.length} 个${t(facetLabelKey)}`}
              </span>
            </div>
```

- [ ] **Step 4: 校验 JSON 合法**

Run: `node -e "for (const f of ['zh-CN','zh-TW','en']) { const j = require('./locales/'+f+'.json'); if (!j.sidebar_reset) throw new Error('missing sidebar_reset in '+f); } console.log('LOCALES OK')"`
Expected: `LOCALES OK`

---

### Task 6: 全量验证

**Files:** 无（只验证）

**Interfaces:**
- Consumes: Task 1~5 的全部产出
- Produces: 无

- [ ] **Step 1: 前端类型检查（对比基线）**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 报错行数 **= 43**（与基线一致，无新增）。

- [ ] **Step 2: 主进程类型检查**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无输出。

- [ ] **Step 3: 全量构建**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: 手工验收**

Run: `npm run dev`，逐条确认：

1. 分组选「类型」→ 每组一个方框：标题栏有色底、组内卡片左右有边框、末行封底圆角，组间有间隔。
2. 点标题栏 → 组收起只剩一条闭合标题框、箭头变 `▸`；再点 → 展开。
3. 折叠几组后切「星球」再切回「网格」→ 折叠状态仍在。
4. 折叠状态下滚动 → 行位置正确、不重叠。
5. 侧栏勾几个值 →「重置」可点；点击后勾选清空，**维度与 AND/OR 不变**。
6. 侧栏无勾选时 →「重置」为禁用态。
