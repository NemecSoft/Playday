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

export type SortKey = "name" | "added" | "lastPlayed" | "playtime" | "releaseDate";

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
  | "favorite";

export interface Group {
  key: string;
  label: string;
  games: Game[];
}

export interface GroupLabels {
  all: string;
  unknown: string;
  uncategorized: string;
  manual: string;
  favorites: string;
  other: string;
}

const DEFAULT_LABELS: GroupLabels = {
  all: "All Games",
  unknown: "Unknown",
  uncategorized: "Uncategorized",
  manual: "Manual",
  favorites: "Favorites",
  other: "Other",
};

export function groupGames(games: Game[], groupBy: GroupKey, labels?: Partial<GroupLabels>): Group[] {
  const L: GroupLabels = { ...DEFAULT_LABELS, ...labels };
  if (groupBy === "none") {
    return [{ key: "all", label: L.all, games }];
  }
  const map = new Map<string, Game[]>();
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
    .map(([key, games]) => ({ key, label: key, games }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
