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
  /** Tags to AND-filter by. Game must contain every selected tag. */
  selectedTags: string[];
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

  // Tag filter (AND): keep games whose tags include every selected tag.
  if (opts.selectedTags.length > 0) {
    out = out.filter((g) => opts.selectedTags.every((t: string) => g.tags.includes(t)));
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
  const sortName = (g: Game) => normalize(g.sortName || g.name);

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
  | "platform"
  | "category"
  | "genre"
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
      case "platform":
        values = g.platform.length ? g.platform : [L.unknown];
        break;
      case "category":
        values = g.category.length ? g.category : [L.uncategorized];
        break;
      case "genre":
        values = g.genre.length ? g.genre : [L.unknown];
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
        values = [];
    }
    for (const v of values) add(v, g);
  }
  return Array.from(map.entries())
    .map(([key, games]) => ({ key, label: key, games }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
