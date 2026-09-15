// Applies filtering / sorting / grouping and renders the grid view.

import { useEffect, useMemo } from "react";
import { useGamesStore } from "../../stores/gamesStore";
import { useAuthStore } from "../../stores/authStore";
import {
  defaultGroupByFor,
  filterGames,
  sortGames,
  groupGames,
  type SortKey,
} from "../../utils/selectors";
import GridView from "./GridView";
import EmptyState from "./EmptyState";
import { useI18n } from "../../i18n";

export default function GamesView() {
  const { t } = useI18n();
  const games = useGamesStore((s) => s.games);
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const showInstalledOnly = useGamesStore((s) => s.showInstalledOnly);
  // showHidden：默认 false（平台隐藏的游戏不显示）。运维连按 5 次 Ctrl+H 才会打开
  // （见 hooks/useGlobalShortcuts.ts 的"平台小秘密"），这里只读 store，不另设开关。
  const showHidden = useGamesStore((s) => s.showHidden);
  const sortOrder = useGamesStore((s) => s.sortOrder);
  const sortDirection = useGamesStore((s) => s.sortDirection);
  const groupBy = useGamesStore((s) => s.groupBy);
  const activePlatformFilter = useGamesStore((s) => s.activePlatformFilter);
  const activeCategoryFilter = useGamesStore((s) => s.activeCategoryFilter);
  const activeGenreFilter = useGamesStore((s) => s.activeGenreFilter);
  const activeDeveloperFilter = useGamesStore((s) => s.activeDeveloperFilter);
  const facet = useGamesStore((s) => s.facet);
  const facetValues = useGamesStore((s) => s.facetValues);
  const facetMode = useGamesStore((s) => s.facetMode);
  const setGroupBy = useGamesStore((s) => s.setGroupBy);
  const groupByDecided = useGamesStore((s) => s.groupByDecided);
  const authLoaded = useAuthStore((s) => s.loaded);
  const userLevel = useAuthStore((s) => s.userLevel);

  // 黄金版用户默认按"游戏级别"分组：黄金版在上、钻石版在下 —— 开屏先看到自己能玩的。
  // 两个前提：① 用户等级已经算出来（算完之前 authStore.userLevel 暂定是 3，那不是结论）；
  //          ② 分组还没被"定过"（用户手动选过就尊重他的选择，不再自动改回去）。
  // 注意：setGroupBy 会把 groupByDecided 置真，所以这里天然只生效一次。
  useEffect(() => {
    if (!authLoaded || groupByDecided) return;
    const want = defaultGroupByFor(userLevel);
    if (want) setGroupBy(want);
  }, [authLoaded, groupByDecided, userLevel, setGroupBy]);

  const groups = useMemo(() => {
    const f = filterGames(games, {
      searchQuery,
      showInstalledOnly,
      showHidden,
      showFavorites: false,
      platformFilter: activePlatformFilter,
      categoryFilter: activeCategoryFilter,
      genreFilter: activeGenreFilter,
      developerFilter: activeDeveloperFilter,
      facet,
      facetValues,
      facetMode,
    });
    const sorted = sortGames(f, sortOrder as SortKey, sortDirection);
    return groupGames(sorted, groupBy as any, {
      all: t("group_all"),
      unknown: t("group_unknown"),
      uncategorized: t("group_uncategorized"),
      manual: t("group_manual"),
      favorites: t("group_favorites"),
      other: t("group_other"),
      // 游戏级别维度的组名与 TopBar 的版本标识同源，避免两处措辞不一致。
      tierGold: t("tier_gold"),
      tierDiamond: t("tier_diamond"),
    });
  }, [
    games,
    searchQuery,
    showInstalledOnly,
    sortOrder,
    sortDirection,
    groupBy,
    activePlatformFilter,
    activeCategoryFilter,
    activeGenreFilter,
    activeDeveloperFilter,
    facet,
    facetValues,
    facetMode,
    t,
  ]);

  const total = groups.reduce((acc, g) => acc + g.games.length, 0);

  if (total === 0) {
    return <EmptyState hasGames={games.length > 0} />;
  }

  return <GridView groups={groups} />;
}
