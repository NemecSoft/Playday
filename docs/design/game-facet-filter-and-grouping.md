# 侧栏多维筛选 + 主界面分组 设计文档

> 状态：设计定稿 v1.0（2026-09-11 决策确认）
> 关联：`docs/design/tag-filter-navigation.md`（详情页标签云 → 主页筛选的跨 iframe 通信，本文档沿用其
> 入口语义，只把"设 selectedTags"改为"设 facet=tag + facetValues=[tag]"）。

## 一、需求与背景

**现状**：左侧抽屉侧栏只能按**标签**筛选（`selectedTags`，勾选多个为 AND 语义）。主界面有
`groupBy` 状态和完整的 `groupGames()` 实现（含 `GridView` 的分组头渲染、虚拟列表 header 行），
但**没有任何 UI 入口**，始终是 `"none"`。`setGroupBy` 定义了却无人调用。

**需求**：

1. 侧栏顶部加一个「按什么来」的**下拉框**，维度有：标签（默认）/ 类型 / 系列 / 地区 / 年代；
   下方的值列表随之切换。
2. 侧栏再加一个 **AND / OR 下拉框**，默认 **AND**。
3. 主界面**也可以分组**：不分组 / 类型 / 系列 / 地区 / 年代。

**已确认的决策**：

| 维度 | 决策 |
| --- | --- |
| 侧栏筛选 vs 主界面分组 | **两个独立设置**，互不影响（可以一边按标签筛、一边按类型分组） |
| 多选语义 | 由侧栏的 **AND/OR 下拉框**决定，**默认 AND**（保持现有标签行为不变） |
| 「年代」数据来源 | **`releaseDate`** 解析十年段（`2010s`），取不到归「未知」 |
| 主界面分组选项 | **只放 5 个**：不分组 / 类型 / 系列 / 地区 / 年代（`groupGames` 已有的平台/分类/开发商/来源/收藏保持代码支持但 UI 不暴露） |
| 切换维度时已勾选的值 | **清空**（不同维度的值混在一起没有意义） |
| AND/OR 作用范围 | **全局一个**，不按维度分别记忆 |

### 数据可用性（实测，为什么「年代」现阶段基本是空的）

`release/data/Admin/library.db` 与运行时库（1276 个游戏）：

| 字段 | 有值的游戏数 |
| --- | --- |
| `genre`（类型） | 1276 / 1276 |
| `series`（系列） | 227 / 1276 |
| `region`（地区） | 45 / 1276 |
| `releaseDate`（年代） | **11 / 1276** |

`releaseDate` 目前严重缺失，所以「按年代」筛/分组出来基本全是「未知」。功能照做，后续补数据即生效。
`releaseDate` 格式不统一（`2013-10-25` 与 `2023-8-25` 混用），解析只取开头 4 位数字。

## 二、维度模型（`src/utils/selectors.ts`）

```ts
/** 侧栏可筛选的维度。 */
export type FacetKey = "tag" | "genre" | "series" | "region" | "decade";

/** 主界面分组维度：none + 可筛选维度 + 代码已支持但 UI 暂不暴露的维度。 */
export type GroupKey =
  | "none"
  | FacetKey
  | "platform"
  | "category"
  | "developer"
  | "source"
  | "favorite";
```

新增两个纯函数：

```ts
/** 从 releaseDate 取十年段标签（如 "2010s"）。取不到返回 null。 */
export function decadeOf(releaseDate?: string): string | null;

/** 取某游戏在某维度上的所有值（decade 最多 1 个，无值返回空数组）。 */
export function facetValuesOf(game: Game, facet: FacetKey): string[];
```

`ViewOptions` 里把 `selectedTags: string[]` 替换为：

```ts
  /** 侧栏当前维度（决定用哪个字段筛选）。 */
  facet: FacetKey;
  /** 侧栏该维度下勾选的值。 */
  facetValues: string[];
  /** 多选语义：and=全部命中 / or=任一命中。 */
  facetMode: "and" | "or";
```

`filterGames` 里的标签筛选块替换为维度化筛选：

```ts
if (opts.facetValues.length > 0) {
  const want = new Set(opts.facetValues);
  out = out.filter((g) => {
    const vals = facetValuesOf(g, opts.facet);
    return opts.facetMode === "or"
      ? vals.some((v) => want.has(v))
      : [...want].every((w) => vals.includes(w));
  });
}
```

> AND 语义下，**该维度没有任何值的游戏会被排除**（与现有标签筛选行为一致，这是预期行为）。

`groupGames` 增加 4 个 case：`tag` → `g.tags`、`series` → `g.series`、`region` → `g.region`、
`decade` → `decadeOf(g.releaseDate) ?? [L.unknown]`。

**顺带修一个潜在缺陷**：现有 `switch` 的 `default: values = []` 会让游戏**不进入任何分组**
（即从界面上凭空消失）。改为兜底归入「未知」，这样即使传入尚未实现的维度也不会丢游戏。

## 三、状态（`src/stores/gamesStore.ts`）

`selectedTags` / `toggleTag` / `clearTags` 三个成员替换为：

| 成员 | 默认 | 说明 |
| --- | --- | --- |
| `facet: FacetKey` | `"tag"` | 侧栏当前维度 |
| `facetValues: string[]` | `[]` | 该维度下勾选的值 |
| `facetMode: "and" \| "or"` | `"and"` | 多选语义 |
| `setFacet(f)` | — | 切维度，**同时清空 `facetValues`** |
| `toggleFacetValue(v)` | — | 勾选/取消，**顺带清空 `searchQuery`**（沿用"搜索与筛选互斥"） |
| `clearFacetValues()` | — | 清空勾选 |
| `setFacetMode(m)` | — | 切换 AND/OR |

`setSearch` 与 `clearFilters` 里原有的 `selectedTags: []` 一并改为 `facetValues: []`。

`groupBy: string` 保持现状（默认 `"none"`）；`setGroupBy` 已存在，本次只补 UI 入口。

`facet` / `facetMode` **不持久化**到 config.json（与 `selectedTags` 保持一致，都是会话内状态）。

## 四、侧栏（`src/components/Sidebar.tsx`）

抽屉顶部排布：

```
[按   标签 ▾]          ← 维度下拉：标签 / 类型 / 系列 / 地区 / 年代
[匹配 全部匹配 ▾]       ← AND / OR 下拉：全部匹配 / 任一匹配
[搜索框]               ← 只过滤下面的列表项，不影响全局搜索
[已选 3 个 · 清空]
[☐ 动作   412]
[☑ 冒险    98]
```

- 列表项由 `facetValuesOf(games, facet)` 聚合计数。
- **排序**：`decade` 按时间正序（1980s → 2020s）；其余按计数倒序，同计数按名称 `localeCompare`。
- `#` 前缀只保留给标签维度，其他维度显示纯名称。
- 「已选 N 个标签」的"标签"随维度变化（如"已选 N 个类型"）：维度词取 `t("facet_xxx")`，前面的
  `已选 N 个` 继续用 JS 模板字符串硬编码 —— 这一行**现状就是硬编码中文**（没走 i18n），本次不改变
  该现状，也不引入 i18next 插值（代码里原有注释说明插值在这里踩过坑）。
- 空态文案改为「该维度下没有可选项」。
- 侧栏搜索框输入**不**清空勾选（它只过滤列表显示，本来就是这么设计的，保持）。

## 五、工具栏（`src/components/Toolbar.tsx`）

在 `view-switcher` 内新增分组下拉：

```
分组： [不分组 ▾]     ← 不分组 / 类型 / 系列 / 地区 / 年代
```

绑定 `groupBy` / `setGroupBy`。

**无需改动 `GridView`**：它已支持 `groups` 渲染分组头（`.group-header` + 计数），
`useVirtualGrid` 也已支持 `header` 类型的行。

## 六、i18n

**单一事实来源是顶层 `locales/{zh-CN,zh-TW,en}.json`**（`src/i18n/config.ts` 直接 import 它们）。
`src/i18n/locales/*.ts` 三个文件**没有任何引用方**（死代码，且带重复键导致 `tsc` 报 `TS1117`），
本次不动它们。

新增 key：

| key | zh-CN | en |
| --- | --- | --- |
| `facet_label` | 按 | Group by |
| `facet_tag` | 标签 | Tags |
| `facet_genre` | 类型 | Genre |
| `facet_series` | 系列 | Series |
| `facet_region` | 地区 | Region |
| `facet_decade` | 年代 | Decade |
| `facet_mode_and` | 全部匹配 | Match all |
| `facet_mode_or` | 任一匹配 | Match any |
| `facet_mode_label` | 匹配 | Match |
| `group_none` | 不分组 | No grouping |
| `sidebar_noFacetValues` | 该维度下没有可选项 | No values for this facet |
| `toolbar_groupBy` | 分组 | Group |

## 七、影响面

| 文件 | 改动 |
| --- | --- |
| `src/utils/selectors.ts` | `FacetKey`、`GroupKey` 扩充、`decadeOf`、`facetValuesOf`、`ViewOptions`、`filterGames`、`groupGames` |
| `src/stores/gamesStore.ts` | facet 三件套替换 `selectedTags`/`toggleTag`/`clearTags` |
| `src/components/Sidebar.tsx` | 维度下拉 + AND/OR 下拉 + 列表按维度渲染 |
| `src/components/Toolbar.tsx` | 分组下拉 |
| `src/components/views/GamesView.tsx` | 传 `facet`/`facetValues`/`facetMode` |
| `src/App.tsx` | 详情页标签云跳转：`setState({ selectedTags:[tag] })` → `{ facet:"tag", facetValues:[tag] }` |
| `src/utils/__tests__/selectors.test.ts` | `emptyOpts` 跟着改（不改会新增 `tsc` 报错） |
| `locales/zh-CN.json`、`zh-TW.json`、`en.json` | 新增上述 key |

## 八、非目标（明确不做）

1. 不改数据库、不改主进程（纯前端筛选/分组）。
2. 不把 `platform` / `category` / `developer` / `source` / `favorite` 暴露到 UI（`groupGames` 继续支持，只是没有入口）。
3. 不改 `ViewMode`（网格/星球/列表）本身；星球视图继续跟随筛选结果，不参与分组。
4. 不清理 `src/i18n/locales/*.ts` 死代码（另开任务）。
5. 不给侧栏筛选结果加"筛选项在结果中被过滤掉"的联动（`faceted search`），保持当前简单行为。

## 九、验证

1. 打开侧栏 → 顶部两个下拉存在；默认「标签」+「全部匹配」；值列表是标签及各标签计数。
2. 勾选两个标签 → 与改动前行为一致（AND，交集）。
3. 把 AND/OR 切到「任一匹配」→ 变成并集。
4. 维度切到「类型」→ 列表变成类型 + 计数，**之前勾选的标签被清空**；勾两个类型 → 交集（默认 AND）。
5. 维度切到「系列」/「地区」→ 列表正确；多选两个地区 + 「任一匹配」→ 并集，有结果（不是 0）。
6. 维度切到「年代」→ 列表出现 `1980s`…`2020s`（目前绝大多数游戏归「未知」），按时间正序。
7. 工具栏选「按 类型 分组」→ 网格出现分组头 `动作 412` 等；选「不分组」→ 恢复单块。
8. 侧栏按「标签」筛 + 主界面按「类型」分组 → **两者同时生效**，互不干扰。
9. 详情页点标签云 → 返回主页后侧栏维度自动变「标签」且勾选该标签。
10. `npx tsc -p tsconfig.main.json --noEmit` 无错误；`npx tsc -p tsconfig.json --noEmit` 报错数与改动前一致（无新增）；`npm run build` 通过。
