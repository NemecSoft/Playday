# 侧栏多维筛选 + 主界面分组 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 侧栏从"只能按标签筛"升级为"可在 标签/类型/系列/地区/年代 之间切换维度筛选（AND/OR 可选，默认 AND）"；主界面新增 分组 下拉（不分组/类型/系列/地区/年代）。

**Architecture:** 抽出统一的"维度"概念（`FacetKey`）到 `selectors.ts`，筛选与分组共用同一套取值函数 `facetValuesOf()`。store 用 `facet` + `facetValues` + `facetMode` 三个成员取代原 `selectedTags`。UI 侧栏与工具栏各自独立持有自己的维度设置。

**Tech Stack:** React 18 + Zustand + TypeScript + Tailwind、Radix Select（`src/components/ui/select.tsx`）、i18next（单一事实来源是顶层 `locales/*.json`）。

## Global Constraints

- **默认维度 = 标签**（`facet: "tag"`），**默认语义 = AND**（`facetMode: "and"`）。
- **侧栏筛选与主界面分组是两个独立设置**，互不影响。
- 侧栏**切换维度时清空已勾选的值**。
- 「年代」= `releaseDate` 取开头 4 位数字算十年段（`2010s`）；取不到归 `group_unknown`（"未知"）。
- i18n 只改顶层 `locales/{zh-CN,zh-TW,en}.json`；**不要动** `src/i18n/locales/*.ts`（死代码）。
- 不暴露 `platform`/`category`/`developer`/`source`/`favorite` 到 UI；`groupGames` 继续支持它们。
- 项目**没有可运行的测试框架**（`vitest` 未安装、无 `test` 脚本）。验证一律用
  `npx tsc -p tsconfig.main.json --noEmit`、`npx tsc -p tsconfig.json --noEmit`（对比报错数不增加）、
  `npm run build` + 手工验收。不要新增跑不起来的测试文件。
- 改动前前端 `tsc` 基线报错 = **43 行**（既有问题：`vitest` 缺失、`AppearanceSection` 的
  `CardTextStyle` 局部更新、i18n 重复键等）。任何时刻不得超过该基线。

---

### Task 1: `selectors.ts` —— 维度模型 + 筛选 + 分组

**Files:**
- Modify: `src/utils/selectors.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type FacetKey = "tag" | "genre" | "series" | "region" | "decade"`
  - `type GroupKey = "none" | FacetKey | "platform" | "category" | "developer" | "source" | "favorite"`
  - `decadeOf(releaseDate?: string): string | null`
  - `facetValuesOf(game: Game, facet: FacetKey): string[]`
  - `ViewOptions` 含 `facet: FacetKey`、`facetValues: string[]`、`facetMode: "and" | "or"`（**不再有** `selectedTags`）

- [ ] **Step 1: 替换 `ViewOptions` 的标签字段**

把：

```ts
  developerFilter: string;
  /** Tags to AND-filter by. Game must contain every selected tag. */
  selectedTags: string[];
}
```

替换为：

```ts
  developerFilter: string;
  /** 侧栏当前维度（决定用哪个字段做筛选）。 */
  facet: FacetKey;
  /** 侧栏该维度下勾选的值。 */
  facetValues: string[];
  /** 多选语义：and=全部命中（交集）/ or=任一命中（并集）。 */
  facetMode: "and" | "or";
}

/** 侧栏可筛选的维度。 */
export type FacetKey = "tag" | "genre" | "series" | "region" | "decade";

/**
 * 从 releaseDate 取十年段标签（如 "2010s"）。
 * 数据格式不统一（"2013-10-25" / "2023-8-25" / "2013-10" / "2013"），所以只取开头 4 位数字。
 * 取不到（空值、非数字开头）返回 null。
 */
export function decadeOf(releaseDate?: string): string | null {
  const m = /^(\d{4})/.exec((releaseDate ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  if (!Number.isFinite(year) || year < 1000) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

/** 取某游戏在某维度上的所有值（decade 最多 1 个；无值返回空数组）。 */
export function facetValuesOf(game: Game, facet: FacetKey): string[] {
  switch (facet) {
    case "tag":
      return (game.tags ?? []).filter(Boolean);
    case "genre":
      return (game.genre ?? []).filter(Boolean);
    case "series":
      return (game.series ?? []).filter(Boolean);
    case "region":
      return (game.region ?? []).filter(Boolean);
    case "decade": {
      const d = decadeOf(game.releaseDate);
      return d ? [d] : [];
    }
  }
}
```

- [ ] **Step 2: 替换 `filterGames` 里的标签筛选块**

把：

```ts
  // Tag filter (AND): keep games whose tags include every selected tag.
  if (opts.selectedTags.length > 0) {
    out = out.filter((g) => opts.selectedTags.every((t: string) => g.tags.includes(t)));
  }
```

替换为：

```ts
  // 侧栏维度筛选：在同一维度内按 AND（交集）或 OR（并集）匹配。
  // 注意：AND 语义下，该维度没有任何值的游戏会被排除（与原有标签筛选行为一致）。
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

- [ ] **Step 3: 扩充 `GroupKey`**

把：

```ts
export type GroupKey =
  | "none"
  | "platform"
  | "category"
  | "genre"
  | "developer"
  | "source"
  | "favorite";
```

替换为：

```ts
export type GroupKey =
  | "none"
  | FacetKey
  | "platform"
  | "category"
  | "developer"
  | "source"
  | "favorite";
```

- [ ] **Step 4: `groupGames` 补 4 个 case，并把 `default` 改成兜底归"未知"**

把 `groupGames` 里的 `switch (groupBy) { ... }` 整块替换为：

```ts
    switch (groupBy) {
      case "tag":
        values = g.tags.length ? g.tags : [L.unknown];
        break;
      case "genre":
        values = g.genre.length ? g.genre : [L.unknown];
        break;
      case "series":
        values = g.series.length ? g.series : [L.unknown];
        break;
      case "region":
        values = g.region.length ? g.region : [L.unknown];
        break;
      case "decade": {
        const d = decadeOf(g.releaseDate);
        values = d ? [d] : [L.unknown];
        break;
      }
      case "platform":
        values = g.platform.length ? g.platform : [L.unknown];
        break;
      case "category":
        values = g.category.length ? g.category : [L.uncategorized];
        break;
      case "developer":
        values = g.developer.length ? g.developer : [L.unknown];
        break;
      case "source":
        values = g.source.length ? g.source : [L.manual];
        break;
      case "favorite":
        values = g.favorite ? [L.favorites] : [L.other];
        break;
      default:
        // 兜底归"未知"而不是空数组 —— 空数组会让游戏不进入任何分组，
        // 在界面上"凭空消失"。
        values = [L.unknown];
    }
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 报错行数 **> 43**（基线 43）。此时 `Sidebar.tsx` / `GamesView.tsx` / `App.tsx` /
`selectors.test.ts` 会因为 `selectedTags` / `toggleTag` / `clearTags` 不存在而**新增**报错。
**这是预期的中间状态**，Task 2~6 会逐个消掉；到 Task 6 Step 3 必须回到 43。

---

### Task 2: `gamesStore.ts` —— facet 状态

**Files:**
- Modify: `src/stores/gamesStore.ts`

**Interfaces:**
- Consumes: `FacetKey`（Task 1）
- Produces: store 上的 `facet` / `facetValues` / `facetMode` / `setFacet` / `toggleFacetValue` / `clearFacetValues` / `setFacetMode`（**不再有** `selectedTags` / `toggleTag` / `clearTags`）

- [ ] **Step 1: 加类型 import**

把文件顶部的：

```ts
import type { Game, GameAction } from "../types/models";
```

替换为：

```ts
import type { Game, GameAction } from "../types/models";
import type { FacetKey } from "../utils/selectors";
```

- [ ] **Step 2: 替换 state 字段声明**

把：

```ts
  /** Tags checked in the sidebar (AND semantics: keep games that contain all of them). */
  selectedTags: string[];
```

替换为：

```ts
  /** 侧栏当前筛选维度（标签/类型/系列/地区/年代）。 */
  facet: FacetKey;
  /** 侧栏该维度下勾选的值。 */
  facetValues: string[];
  /** 多选语义：and=全部命中（交集）/ or=任一命中（并集）。 */
  facetMode: "and" | "or";
```

- [ ] **Step 3: 替换 actions 声明**

把：

```ts
  toggleTag: (tag: string) => void;
  clearTags: () => void;
```

替换为：

```ts
  setFacet: (f: FacetKey) => void;
  toggleFacetValue: (v: string) => void;
  clearFacetValues: () => void;
  setFacetMode: (m: "and" | "or") => void;
```

- [ ] **Step 4: 替换初始值**

把：

```ts
  selectedTags: [],
```

替换为：

```ts
  facet: "tag",
  facetValues: [],
  facetMode: "and",
```

- [ ] **Step 5: `setSearch` 清空改为 `facetValues`**

把：

```ts
  setSearch: (q) => set({ searchQuery: q, selectedTags: [] }),
```

替换为：

```ts
  setSearch: (q) => set({ searchQuery: q, facetValues: [] }),
```

- [ ] **Step 6: 替换 `toggleTag` / `clearTags` 两个实现**

把：

```ts
  // Picking a tag clears the search query (search and tags are exclusive).
  toggleTag: (tag) =>
    set((s) => {
      const has = s.selectedTags.includes(tag);
      return {
        selectedTags: has ? s.selectedTags.filter((t) => t !== tag) : [...s.selectedTags, tag],
        searchQuery: "",
      };
    }),
  clearTags: () => set({ selectedTags: [] }),
```

替换为：

```ts
  // 切换维度时清空已勾选的值：不同维度的值混在一起没有意义。
  setFacet: (f) => set({ facet: f, facetValues: [] }),
  // 勾选/取消一个值；顺带清空搜索框（搜索与筛选互斥，沿用原有行为）。
  toggleFacetValue: (v) =>
    set((s) => {
      const has = s.facetValues.includes(v);
      return {
        facetValues: has ? s.facetValues.filter((x) => x !== v) : [...s.facetValues, v],
        searchQuery: "",
      };
    }),
  clearFacetValues: () => set({ facetValues: [] }),
  setFacetMode: (m) => set({ facetMode: m }),
```

- [ ] **Step 7: `clearFilters` 里的字段跟着改**

在 `clearFilters` 的实现里，把：

```ts
      selectedTags: [],
```

替换为：

```ts
      facetValues: [],
```

- [ ] **Step 8: 类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 仍只有 Task 1 老组件留下的报错（`Sidebar.tsx`/`GamesView.tsx`/`App.tsx`/`selectors.test.ts`），
`gamesStore.ts` 本身无报错。

---

### Task 3: i18n 新增 key（顶层 `locales/*.json`）

**Files:**
- Modify: `locales/zh-CN.json`
- Modify: `locales/zh-TW.json`
- Modify: `locales/en.json`

**Interfaces:**
- Consumes: 无
- Produces: 下列 key 可被 `t()` 取到：
  `facet_label`、`facet_tag`、`facet_genre`、`facet_series`、`facet_region`、`facet_decade`、
  `facet_mode_label`、`facet_mode_and`、`facet_mode_or`、`group_none`、`sidebar_noFacetValues`、`toolbar_groupBy`

- [ ] **Step 1: `locales/zh-CN.json`**

在文件末尾的 `"backup_no": "否"` 之后追加（注意前一行加逗号）：

```json
  "backup_no": "否",
  "facet_label": "按",
  "facet_tag": "标签",
  "facet_genre": "类型",
  "facet_series": "系列",
  "facet_region": "地区",
  "facet_decade": "年代",
  "facet_mode_label": "匹配",
  "facet_mode_and": "全部匹配",
  "facet_mode_or": "任一匹配",
  "group_none": "不分组",
  "sidebar_noFacetValues": "该维度下没有可选项",
  "toolbar_groupBy": "分组"
```

- [ ] **Step 2: `locales/zh-TW.json`**

```json
  "backup_no": "否",
  "facet_label": "按",
  "facet_tag": "標籤",
  "facet_genre": "類型",
  "facet_series": "系列",
  "facet_region": "地區",
  "facet_decade": "年代",
  "facet_mode_label": "匹配",
  "facet_mode_and": "全部匹配",
  "facet_mode_or": "任一匹配",
  "group_none": "不分組",
  "sidebar_noFacetValues": "該維度下沒有可選項",
  "toolbar_groupBy": "分組"
```

- [ ] **Step 3: `locales/en.json`**

```json
  "backup_no": "No",
  "facet_label": "Group by",
  "facet_tag": "Tags",
  "facet_genre": "Genre",
  "facet_series": "Series",
  "facet_region": "Region",
  "facet_decade": "Decade",
  "facet_mode_label": "Match",
  "facet_mode_and": "Match all",
  "facet_mode_or": "Match any",
  "group_none": "No grouping",
  "sidebar_noFacetValues": "No values for this facet",
  "toolbar_groupBy": "Group"
```

> `facet_label` 在英文里会显示成 "Group by  Tags"，而工具栏的 `toolbar_groupBy` 是 "Group"。
> 英文侧栏这两个词有轻微重复，属可接受范围（中文无此问题）。

- [ ] **Step 4: 校验 JSON 合法**

Run: `node -e "for (const f of ['zh-CN','zh-TW','en']) { const j = require('./locales/'+f+'.json'); if (!j.facet_tag || !j.group_none) throw new Error('missing key in '+f); } console.log('OK')"`
Expected: `OK`

---

### Task 4: `Sidebar.tsx` —— 维度下拉 + AND/OR 下拉 + 按维度渲染

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `FacetKey`、`facetValuesOf`（Task 1）；store 的 facet 成员（Task 2）；i18n key（Task 3）
- Produces: 无（叶子组件）

- [ ] **Step 1: 改 import**

把：

```ts
import { Input } from "./ui/input";
import WhoIsOnline from "./community/WhoIsOnline";
```

替换为：

```ts
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { facetValuesOf, type FacetKey } from "../utils/selectors";
import WhoIsOnline from "./community/WhoIsOnline";
```

- [ ] **Step 2: 加维度选项常量（放在 `SIDEBAR_MAX` 之后）**

```ts
// 侧栏可选的筛选维度（下拉框选项）。默认是「标签」。
const FACET_OPTIONS: { value: FacetKey; labelKey: string }[] = [
  { value: "tag", labelKey: "facet_tag" },
  { value: "genre", labelKey: "facet_genre" },
  { value: "series", labelKey: "facet_series" },
  { value: "region", labelKey: "facet_region" },
  { value: "decade", labelKey: "facet_decade" },
];
```

- [ ] **Step 3: 换掉 store 选择器**

把：

```ts
  const selectedTags = useGamesStore((s) => s.selectedTags);
  const toggleTag = useGamesStore((s) => s.toggleTag);
  const clearTags = useGamesStore((s) => s.clearTags);
```

替换为：

```ts
  const facet = useGamesStore((s) => s.facet);
  const facetValues = useGamesStore((s) => s.facetValues);
  const facetMode = useGamesStore((s) => s.facetMode);
  const setFacet = useGamesStore((s) => s.setFacet);
  const toggleFacetValue = useGamesStore((s) => s.toggleFacetValue);
  const clearFacetValues = useGamesStore((s) => s.clearFacetValues);
  const setFacetMode = useGamesStore((s) => s.setFacetMode);
```

- [ ] **Step 4: 把 `tagQuery` 改成通用名 `listQuery`**

把：

```ts
  // 标签搜索词：只过滤侧边栏里显示的标签，不影响 gamesStore 的全局搜索。
  const [tagQuery, setTagQuery] = useState("");
```

替换为：

```ts
  // 列表搜索词：只过滤侧边栏里显示的值，不影响 gamesStore 的全局搜索。
  const [listQuery, setListQuery] = useState("");
```

- [ ] **Step 5: 替换 `tagStats` / `visibleTags` 两个 useMemo**

把从 `// 按标签聚合（含计数，按频次排序）。` 开始的整块（`tagStats` 与 `visibleTags` 两个 useMemo）替换为：

```ts
  // 按当前维度聚合（含计数）。标签维度跳过 "Tag: " 开头的旧自动标签残留。
  const facetStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of games) {
      for (const raw of facetValuesOf(g, facet)) {
        const k = raw.trim();
        if (!k) continue;
        if (facet === "tag" && /^Tag:\s*/i.test(k)) continue; // 跳过旧的自动标签
        map.set(k, (map.get(k) || 0) + 1);
      }
    }
    const list = Array.from(map.entries()).map(([name, count]) => ({ name, count }));
    if (facet === "decade") {
      // 年代按时间正序（1980s → 2020s），"未知"之类非年份标签排最后。
      const yearOf = (n: string) => (/^\d{4}s$/.test(n) ? Number(n.slice(0, 4)) : Number.MAX_SAFE_INTEGER);
      return list.sort((a, b) => yearOf(a.name) - yearOf(b.name) || a.name.localeCompare(b.name));
    }
    return list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [games, facet]);

  // 根据搜索词过滤列表（不区分大小写、中文包含匹配）。
  const visibleFacetValues = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return facetStats;
    return facetStats.filter(({ name }) => name.toLowerCase().includes(q));
  }, [facetStats, listQuery]);

  // 当前维度名（用于"已选 N 个XX"文案）。
  const facetLabelKey = FACET_OPTIONS.find((o) => o.value === facet)?.labelKey ?? "facet_tag";
```

- [ ] **Step 6: 顶部加两个下拉（`sidebar-header` 之后、搜索框之前）**

把：

```tsx
          <div className="sidebar-tag-search">
            <Input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder={t("sidebar_tagSearch")}
              aria-label={t("sidebar_tagSearch")}
            />
          </div>
```

替换为：

```tsx
          {/* 维度下拉：决定侧栏列什么、拿什么筛。默认「标签」。 */}
          <div className="sidebar-facet-row">
            <span className="sidebar-facet-label">{t("facet_label")}</span>
            <Select value={facet} onValueChange={(v) => setFacet(v as FacetKey)}>
              <SelectTrigger className="sidebar-select" aria-label={t("facet_label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 多选语义下拉：全部匹配（AND，默认）/ 任一匹配（OR）。 */}
          <div className="sidebar-facet-row">
            <span className="sidebar-facet-label">{t("facet_mode_label")}</span>
            <Select
              value={facetMode}
              onValueChange={(v) => setFacetMode(v as "and" | "or")}
            >
              <SelectTrigger className="sidebar-select" aria-label={t("facet_mode_label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">{t("facet_mode_and")}</SelectItem>
                <SelectItem value="or">{t("facet_mode_or")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sidebar-tag-search">
            <Input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder={t("sidebar_tagSearch")}
              aria-label={t("sidebar_tagSearch")}
            />
          </div>
```

- [ ] **Step 7: 清空行与列表块改用 facet**

把：

```tsx
          {/* 已勾选的标签：显示清空按钮，方便用户快速取消全部筛选 */}
          {selectedTags.length > 0 && (
            <div className="sidebar-clear-row">
              {/* 用 JS 模板字符串直接拼数字，避免 i18next 插值不稳定。 */}
              <span className="sidebar-clear-info">
                {`已选 ${selectedTags.length} 个标签`}
              </span>
              <button className="sidebar-clear-btn" onClick={clearTags}>
                {t("sidebar_clear")}
              </button>
            </div>
          )}

          <div className="sidebar-tag-list">
            {visibleTags.map(({ name, count }) => {
              const checked = selectedTags.includes(name);
              return (
                <label
                  key={name}
                  className={`sidebar-tag ${checked ? "checked" : ""}`}
                  title={`#${name} (${count})`}
                >
                  <span className="sidebar-tag-name">#{name}</span>
                  <span className="sidebar-tag-meta">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTag(name)}
                    />
                    <span className="count">{count}</span>
                  </span>
                </label>
              );
            })}
            {visibleTags.length === 0 && (
              <div className="sidebar-empty">{t("sidebar_noTags")}</div>
            )}
          </div>
```

替换为：

```tsx
          {/* 已勾选的值：显示清空按钮，方便用户快速取消全部筛选。
              数字用 JS 模板字符串直接拼（不走 i18next 插值，"已选 N 个"这行现状就是硬编码中文）。 */}
          {facetValues.length > 0 && (
            <div className="sidebar-clear-row">
              <span className="sidebar-clear-info">
                {`已选 ${facetValues.length} 个${t(facetLabelKey)}`}
              </span>
              <button className="sidebar-clear-btn" onClick={clearFacetValues}>
                {t("sidebar_clear")}
              </button>
            </div>
          )}

          <div className="sidebar-tag-list">
            {visibleFacetValues.map(({ name, count }) => {
              const checked = facetValues.includes(name);
              // "#" 前缀是标签的语义，其他维度显示纯名称。
              const display = facet === "tag" ? `#${name}` : name;
              return (
                <label
                  key={name}
                  className={`sidebar-tag ${checked ? "checked" : ""}`}
                  title={`${display} (${count})`}
                >
                  <span className="sidebar-tag-name">{display}</span>
                  <span className="sidebar-tag-meta">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFacetValue(name)}
                    />
                    <span className="count">{count}</span>
                  </span>
                </label>
              );
            })}
            {visibleFacetValues.length === 0 && (
              <div className="sidebar-empty">{t("sidebar_noFacetValues")}</div>
            )}
          </div>
```

- [ ] **Step 8: 加样式（`src/styles/global.css`）**

在 `.sidebar-tag-search` 规则附近追加：

```css
/* 侧栏顶部两个下拉行（维度 / 匹配语义）。 */
.sidebar-facet-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 8px;
}
.sidebar-facet-label {
  flex: none;
  font-size: 12px;
  opacity: 0.72;
}
.sidebar-select {
  height: 30px;
  font-size: 12px;
}
```

- [ ] **Step 9: 类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: `Sidebar.tsx` 不再报 `selectedTags` 相关错误。

---

### Task 5: 工具栏分组下拉 + `GamesView` 传参 + `App.tsx` 跳转

**Files:**
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/components/views/GamesView.tsx`
- Modify: `src/App.tsx`（约 112-122 行的 `onTagFilter`）

**Interfaces:**
- Consumes: store 的 `groupBy`/`setGroupBy`（已有）、`facet` 成员（Task 2）、i18n key（Task 3）
- Produces: 无（叶子组件）

- [ ] **Step 1: `Toolbar.tsx` 加 import**

把：

```ts
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
```

替换为：

```ts
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
```

- [ ] **Step 2: `Toolbar.tsx` 读 store**

在 `const setViewMode = useGamesStore((s) => s.setViewMode);` 之后加：

```ts
  const groupBy = useGamesStore((s) => s.groupBy);
  const setGroupBy = useGamesStore((s) => s.setGroupBy);
```

- [ ] **Step 3: `Toolbar.tsx` 渲染分组下拉**

把：

```tsx
      <div className="view-switcher">
        <button
          type="button"
          className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
```

替换为：

```tsx
      <div className="view-switcher">
        {/* 分组下拉：不分组 / 类型 / 系列 / 地区 / 年代。 */}
        <div className="toolbar-group-by">
          <span className="toolbar-group-label">{t("toolbar_groupBy")}</span>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="toolbar-select" aria-label={t("toolbar_groupBy")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("group_none")}</SelectItem>
              <SelectItem value="genre">{t("facet_genre")}</SelectItem>
              <SelectItem value="series">{t("facet_series")}</SelectItem>
              <SelectItem value="region">{t("facet_region")}</SelectItem>
              <SelectItem value="decade">{t("facet_decade")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
```

- [ ] **Step 4: `Toolbar.tsx` 加样式（`src/styles/global.css`）**

```css
/* 工具栏分组下拉。 */
.toolbar-group-by {
  display: flex;
  align-items: center;
  gap: 6px;
}
.toolbar-group-label {
  font-size: 12px;
  opacity: 0.72;
}
.toolbar-select {
  height: 30px;
  width: 130px;
  font-size: 12px;
}
```

- [ ] **Step 5: `GamesView.tsx` 换掉 `selectedTags`**

把：

```ts
  const selectedTags = useGamesStore((s) => s.selectedTags);
```

替换为：

```ts
  const facet = useGamesStore((s) => s.facet);
  const facetValues = useGamesStore((s) => s.facetValues);
  const facetMode = useGamesStore((s) => s.facetMode);
```

把 `filterGames` 入参里的：

```ts
      selectedTags,
    });
```

替换为：

```ts
      facet,
      facetValues,
      facetMode,
    });
```

把依赖数组里的：

```ts
    selectedTags,
    t,
```

替换为：

```ts
    facet,
    facetValues,
    facetMode,
    t,
```

- [ ] **Step 6: `App.tsx` 详情页标签云跳转改用 facet**

把：

```ts
        // 设为主页标签筛选（单一标签，清空搜索），并跳回主页
        useGamesStore.setState({ selectedTags: [d.tag], searchQuery: "" });
```

替换为：

```ts
        // 设为主页标签筛选（维度=标签、单一标签值，清空搜索），并跳回主页
        useGamesStore.setState({ facet: "tag", facetValues: [d.tag], searchQuery: "" });
```

- [ ] **Step 7: 类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 无 `selectedTags` / `groupBy` 相关新报错。

---

### Task 6: 测试文件跟随 + 全量验证

**Files:**
- Modify: `src/utils/__tests__/selectors.test.ts`

**Interfaces:**
- Consumes: 前 5 个任务的全部产出
- Produces: 无

- [ ] **Step 1: `selectors.test.ts` 的 `emptyOpts` 改用 facet 字段**

把：

```ts
  developerFilter: "all",
  selectedTags: [],
};
```

替换为：

```ts
  developerFilter: "all",
  facet: "tag",
  facetValues: [],
  facetMode: "and",
};
```

- [ ] **Step 2: 多标签 AND 那个用例改用 facet 字段**

把：

```ts
  it("多标签 AND 过滤", () => {
    const games = [
      makeGame({ name: "A", tags: ["t1", "t2"] }),
      makeGame({ name: "B", tags: ["t1"] }),
    ];
    const r = filterGames(games, { ...emptyOpts, selectedTags: ["t1", "t2"] });
    expect(r.map((g) => g.name)).toEqual(["A"]);
  });
```

替换为：

```ts
  it("多标签 AND 过滤（交集）", () => {
    const games = [
      makeGame({ name: "A", tags: ["t1", "t2"] }),
      makeGame({ name: "B", tags: ["t1"] }),
    ];
    const r = filterGames(games, { ...emptyOpts, facetValues: ["t1", "t2"] });
    expect(r.map((g) => g.name)).toEqual(["A"]);
  });

  it("多标签 OR 过滤（并集）", () => {
    const games = [
      makeGame({ name: "A", tags: ["t1"] }),
      makeGame({ name: "B", tags: ["t2"] }),
      makeGame({ name: "C", tags: ["t3"] }),
    ];
    const r = filterGames(games, {
      ...emptyOpts,
      facetValues: ["t1", "t2"],
      facetMode: "or",
    });
    expect(r.map((g) => g.name)).toEqual(["A", "B"]);
  });

  it("按地区维度筛选", () => {
    const games = [
      makeGame({ name: "A", region: ["日本"] }),
      makeGame({ name: "B", region: ["美国"] }),
    ];
    const r = filterGames(games, { ...emptyOpts, facet: "region", facetValues: ["日本"] });
    expect(r.map((g) => g.name)).toEqual(["A"]);
  });

  it("按年代维度筛选（releaseDate → 十年段）", () => {
    const games = [
      makeGame({ name: "A", releaseDate: "2013-10-25" }),
      makeGame({ name: "B", releaseDate: "2023-8-25" }),
    ];
    const r = filterGames(games, { ...emptyOpts, facet: "decade", facetValues: ["2010s"] });
    expect(r.map((g) => g.name)).toEqual(["A"]);
  });
```

> 这些用例**跑不起来**（`vitest` 未安装），本次只保证它们继续通过类型检查、且断言逻辑正确，
> 供以后装上测试框架时直接生效。

- [ ] **Step 3: 前端类型检查（对比基线）**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 报错行数 **= 43**（与改动前完全一致，无新增）。

- [ ] **Step 4: 主进程类型检查**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无输出。

- [ ] **Step 5: 全量构建**

Run: `npm run build`
Expected: `tsc -p tsconfig.main.json` 通过 + `vite build` 成功。

- [ ] **Step 6: 手工验收**

Run: `npm run dev`，然后按 spec「九、验证」的 10 条逐条确认，重点是：

1. 侧栏默认「标签」+「全部匹配」，列表是标签及计数。
2. 勾两个标签 = 交集（与改动前一致）；切「任一匹配」= 并集。
3. 维度切「类型」→ 列表变类型、**已勾选被清空**；多选两个类型 = 交集。
4. 维度切「地区」+「任一匹配」→ 勾两个地区有结果（不是 0）。
5. 维度切「年代」→ 出现 `1980s`…`2020s` + 「未知」，按时间正序。
6. 工具栏选「按 类型 分组」→ 网格出现分组头（如 `动作 412`）；「不分组」恢复单块。
7. 侧栏按标签筛 **同时** 工具栏按类型分组 → 两者同时生效。
8. 详情页点标签云 → 回主页后侧栏维度自动是「标签」且勾选该标签。
