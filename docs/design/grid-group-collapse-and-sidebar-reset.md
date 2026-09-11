# 分组折叠 + 侧栏重置 设计文档

> 状态：设计定稿 v1.0（2026-09-11 决策确认）
> 前置：`docs/design/game-facet-filter-and-grouping.md`（侧栏多维筛选与主界面分组，已完成）。
> 本文档只做两件事：给分组加**折叠**和**明显分界框**；给侧栏加**重置**按钮。

## 一、需求

1. **主界面分组可折叠**：每个分组的「标题 + 该组卡片」用一个**明显的分界框**框住，标题可点击折叠/展开。
2. **侧栏加重置按钮**：常驻显示，把已勾选的项重置。

**已确认的决策**：

| 维度 | 决策 |
| --- | --- |
| 重置范围 | **只清空已勾选的值**；维度（标签/类型/…）和 AND/OR 保持不变 |
| 分组默认状态 | **全部展开** |
| 折叠状态存哪 | 放 `gamesStore`（本次会话内记忆），**不写 config.json** |
| 「全部展开/折叠」按钮 | **不做**（用户未要求，YAGNI） |

## 二、分界框的实现（关键设计）

分组的行由 `useVirtualGrid` 拍平成「header 行 + 若干 cards 行」，每行都是 `.vg-window` 里的
**绝对定位 div**（`transform: translateY(offset)`），偏移量是各行高度的累加 —— 也就是说
**相邻行的上下边缘严丝合缝**（行高里已经包含了卡片间距 `cardRowGap`）。

利用这一点，把边框**分散画在每行的元素上**就能拼成一个连续的框，不需要额外容器：

| 行 | 元素 | 边框 |
| --- | --- | --- |
| header | `.group-header`（标题栏） | `border`（四边）+ 上圆角 |
| cards（非末行） | `.game-grid` | `border-left` + `border-right` |
| cards（末行） | `.game-grid.group-last` | 再加 `border-bottom` + 下圆角 |

- 组与组的间隔：标题栏加 `margin-top: 22px`。因为标题栏的高度会被 `CardRowMeasurer`
  实测并回写给虚拟列表，所以这个 margin 不会造成行高错位。
- 折叠后该组只剩标题栏一行，此时标题栏改为**四角圆角**（`border-radius` 全圆），自成一条闭合的框。
- **不做**"绕过虚拟化的整组容器"：整组一次性渲染会退回"1000+ 卡片全挂载"的老问题。

## 三、折叠的实现

`useVirtualGrid` 新增入参 `collapsedGroups?: ReadonlySet<string>`；拍平时若某组已折叠，
**不生成该组的 cards 行**（header 行照常保留，计数照常显示）。

行类型扩展（`VirtualGridRow`）：

```ts
| { type: "header"; key: string; groupKey: string; label: string; count: number; collapsed: boolean }
| { type: "cards"; key: string; groupKey: string; games: Game[]; isLastInGroup: boolean }
```

- `groupKey` 供点击时回传；`collapsed` 供标题栏画箭头方向；`isLastInGroup` 供画下边框。
- `collapsedGroups` 必须是从 store 数组 `useMemo` 出来的 **Set**，引用稳定，否则拍平 memo 每次渲染都会重算。

`gamesStore` 新增：

```ts
collapsedGroups: string[];                       // 默认 []
toggleGroupCollapsed: (key: string) => void;
```

## 四、侧栏重置按钮

- 位置：`.sidebar-header` 内、标题右侧（`margin-left: auto`）。
- 常驻显示；`facetValues.length === 0` 时 `disabled`。
- 点击调 `clearFacetValues()`（已有 action）。
- 原来"已选 N 个XX"那一行里的「清空」按钮**移除**（与重置重复），该行只保留信息文字。
  `sidebar_clear` 这个 key 变成未引用（保留在 JSON 里，无害）。

## 五、i18n

只加一个 key 到顶层 `locales/{zh-CN,zh-TW,en}.json`：

| key | zh-CN | zh-TW | en |
| --- | --- | --- | --- |
| `sidebar_reset` | 重置 | 重設 | Reset |

## 六、影响面

| 文件 | 改动 |
| --- | --- |
| `src/hooks/useVirtualGrid.ts` | `VirtualGridRow` 扩展；新增 `collapsedGroups` 入参；拍平时跳过已折叠组的卡片行 |
| `src/stores/gamesStore.ts` | `collapsedGroups` + `toggleGroupCollapsed` |
| `src/components/views/GridView.tsx` | 标题栏改成可点按钮（带箭头）；cards 行加 `group-rows` / `group-last` class |
| `src/styles/global.css` | 重写 `.group-header`（标题栏 + 分界框）；新增 `.group-chev`、`.game-grid.group-rows`、`.sidebar-reset` |
| `src/components/Sidebar.tsx` | 标题右侧加重置按钮；移除清空行里的按钮 |
| `locales/*.json` ×3 | `sidebar_reset` |

## 七、非目标

1. 不做"全部展开/全部折叠"。
2. 不把折叠状态持久化到 config.json。
3. 不改分组维度选项、不改筛选逻辑。
4. 星球视图不参与分组折叠。

## 八、验证

1. 工具栏选「分组 类型」→ 每组被一个方框框住：标题栏有色底、组内卡片左右有边框、最后一行封底圆角；组与组之间有间隔。
2. 点标题栏 → 该组卡片收起，只剩一条闭合的标题框，箭头转成 `▸`；再点 → 展开。
3. 折叠若干组后切到「星球」视图再切回「网格」→ 折叠状态还在（store 记忆）。
4. 折叠状态下滚动列表，位置不错乱、不重叠（虚拟列表行数变化后已重新测量）。
5. 侧栏勾选若干值 → 标题右侧「重置」可点；点击后勾选清空、**维度不变、AND/OR 不变**。
6. 侧栏没勾选任何值时 →「重置」按钮为禁用态。
7. `npx tsc -p tsconfig.json --noEmit` 报错数仍为 43（基线）；`npx tsc -p tsconfig.main.json --noEmit` 无错误；`npm run build` 通过。
