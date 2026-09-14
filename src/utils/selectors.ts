// Pure filtering / sorting / grouping logic applied to the game list.
// Mirrors Playnite's collection view behaviour.

import type { Game } from "../types/models";
import { matchSearch } from "./search";

export interface ViewOptions {
  searchQuery: string;
  showInstalledOnly: boolean;
  showHidden: boolean;
  showFavorites: boolean;
  platformFilter: string;
  categoryFilter: string;
  genreFilter: string;
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

const normalize = (s: string) =>
  s.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

export function filterGames(games: Game[], opts: ViewOptions): Game[] {
  let out = games;

  // Visibility
  out = out.filter((g) => {
    if (g.hidden && !opts.showHidden) return false;
    return true;
  });
  if (opts.showInstalledOnly) out = out.filter((g) => g.installed);
  if (opts.showFavorites) out = out.filter((g) => g.favorite);

  // Platform
  if (opts.platformFilter !== "all") {
    out = out.filter((g) => g.platform.includes(opts.platformFilter));
  }
  // Category
  if (opts.categoryFilter !== "all") {
    out = out.filter((g) => g.category.includes(opts.categoryFilter));
  }
  // Genre
  if (opts.genreFilter !== "all") {
    out = out.filter((g) => g.genre.includes(opts.genreFilter));
  }
  // Developer
  if (opts.developerFilter !== "all") {
    out = out.filter((g) => g.developer.includes(opts.developerFilter));
  }

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

  // Search: matches the primary name, localized/alternate names, metadata
  // fields, Pinyin initials and full Pinyin (e.g. "星际争霸" via "xjzb").
  if (opts.searchQuery.trim()) {
    const q = opts.searchQuery.trim();
    out = out.filter((g) => matchSearch(g, q));
  }

  return out;
}

/** 排序键。工具栏目前只暴露 added / name / rating 三个，其余保留给集合视图扩展。 */
export type SortKey = "name" | "added" | "lastPlayed" | "playtime" | "releaseDate" | "rating";

export function sortGames(games: Game[], key: SortKey, direction: "ascending" | "descending"): Game[] {
  const dir = direction === "ascending" ? 1 : -1;
  const copy = [...games];
  // 按名称排序直接用 name（中文名）。sort_name 列已删除，origin_name 是"原始英文名"，
  // 语义上不是排序键，所以不再参与名称排序。
  const sortName = (g: Game) => normalize(g.name);

  copy.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = sortName(a).localeCompare(sortName(b));
        break;
      case "added":
        cmp = a.added.localeCompare(b.added);
        break;
      case "lastPlayed":
        cmp = (a.lastPlayed || "").localeCompare(b.lastPlayed || "");
        break;
      case "playtime":
        cmp = a.playtime - b.playtime;
        break;
      case "releaseDate":
        cmp = (a.releaseDate || "").localeCompare(b.releaseDate || "");
        break;
      case "rating": {
        // 评分取 criticScore：库里唯一有值的评分字段（实测 critic_score 443/1276，
        // user_score 与 community_score 基本为空，所以不用它们）。
        // 没有评分的游戏恒排末尾、不随方向翻转 —— 否则正序时那 800 多个无评分
        // 游戏会整堆顶在最前面，看起来像排序失效。
        const ra = typeof a.criticScore === "number" ? a.criticScore : null;
        const rb = typeof b.criticScore === "number" ? b.criticScore : null;
        if (ra === null && rb === null) return 0;
        if (ra === null) return 1;
        if (rb === null) return -1;
        cmp = ra - rb;
        break;
      }
    }
    return cmp * dir;
  });
  return copy;
}

export type GroupKey =
  | "none"
  | FacetKey
  | "platform"
  | "category"
  | "developer"
  | "source"
  | "favorite"
  /** 按"玩这个游戏需要的等级"分组：1 = 黄金版、2 = 钻石版（见 Game.gameLevel）。 */
  | "gameLevel";

export interface Group {
  key: string;
  label: string;
  games: Game[];
  /**
   * 组的显式排序权重（小的在前）。只有"游戏级别"维度填它 —— 黄金版在上、钻石版在下；
   * 其余维度不填，仍走原来的"按 label 排序"，行为不变。
   */
  order?: number;
}

export interface GroupLabels {
  all: string;
  unknown: string;
  uncategorized: string;
  manual: string;
  favorites: string;
  other: string;
  /** 游戏级别维度的两个组名，与 TopBar 版本标识同源（locales 的 tier_gold / tier_diamond）。 */
  tierGold: string;
  tierDiamond: string;
}

const DEFAULT_LABELS: GroupLabels = {
  all: "All Games",
  unknown: "Unknown",
  uncategorized: "Uncategorized",
  manual: "Manual",
  favorites: "Favorites",
  other: "Other",
  tierGold: "Gold",
  tierDiamond: "Diamond",
};

export function groupGames(games: Game[], groupBy: GroupKey, labels?: Partial<GroupLabels>): Group[] {
  const L: GroupLabels = { ...DEFAULT_LABELS, ...labels };
  if (groupBy === "none") {
    return [{ key: "all", label: L.all, games }];
  }
  const map = new Map<string, Game[]>();
  /** 组的显式排序权重（label → order）。只有"游戏级别"维度会写它。 */
  const orderOf = new Map<string, number>();
  const add = (label: string, g: Game) => {
    const k = label || L.unknown;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(g);
  };
  for (const g of games) {
    let values: string[] = [];
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
      case "gameLevel": {
        // 1 = 黄金版、钻石版 = 2（见 shared/models.ts 的 Game.gameLevel）。
        // order 直接用级别数字：黄金版在上、钻石版在下 —— 黄金版用户因此先看到自己能玩的
        // （库里的盘点：1283 条里 1114 条是钻石版，不排序就是满屏打不开的卡）。
        // 其它取值（数据里目前没有）兜底归"未知"并排到最后。
        const lv = Number(g.gameLevel) || 0;
        const label = lv === 1 ? L.tierGold : lv === 2 ? L.tierDiamond : L.unknown;
        orderOf.set(label, lv === 1 || lv === 2 ? lv : Number.MAX_SAFE_INTEGER);
        values = [label];
        break;
      }
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
    for (const v of values) add(v, g);
  }
  return Array.from(map.entries())
    .map(([key, games]) => ({ key, label: key, games, order: orderOf.get(key) }))
    // 先按显式权重（只有游戏级别维度有），再按 label —— 后者是原来的唯一规则。
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label));
}

/**
 * 用户等级对应的"默认分组"：黄金版（1）默认按**游戏级别**分组，让黄金用户先看到自己能玩的；
 * 其余等级返回 null（= 不改动默认值"不分组"）。
 *
 * 为什么只对黄金版做：钻石版能玩全部，分组与否不影响"找得到玩得了"；黄金版才被这件事卡住
 * （库里约 87% 是钻石版专享，不排序就是满屏"钻石版专享"）。
 *
 * ⚠️ 调用方必须在用户等级**算完**之后再用（`authStore.loaded` 为真）：算完之前
 * `userLevel` 暂定是 3，拿它判断永远得不出"黄金版"这个结论。
 */
export function defaultGroupByFor(userLevel: number): GroupKey | null {
  return Number(userLevel) === 1 ? "gameLevel" : null;
}
