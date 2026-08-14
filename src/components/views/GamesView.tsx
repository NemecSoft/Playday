// Applies filtering / sorting / grouping and renders the grid or planet view.

import { lazy, Suspense, useMemo } from "react";
import { useGamesStore } from "../../stores/gamesStore";
import { filterGames, sortGames, groupGames, type SortKey } from "../../utils/selectors";
import { mapGamesToZones } from "../../utils/planet/zoneMapper";
import GridView from "./GridView";
import EmptyState from "./EmptyState";
import { useI18n } from "../../i18n";

// 星球视图用懒加载：它依赖体积很大的 three.js。只在用户真正切到星球视图时才
// 加载，避免把 three.js 塞进主 bundle、拖慢应用启动。加载期间显示一个占位。
const PlanetView = lazy(() => import("./PlanetView"));

export default function GamesView() {
  const { t } = useI18n();
  const games = useGamesStore((s) => s.games);
  const viewMode = useGamesStore((s) => s.viewMode);
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const showInstalledOnly = useGamesStore((s) => s.showInstalledOnly);
  const sortOrder = useGamesStore((s) => s.sortOrder);
  const sortDirection = useGamesStore((s) => s.sortDirection);
  const groupBy = useGamesStore((s) => s.groupBy);
  const activePlatformFilter = useGamesStore((s) => s.activePlatformFilter);
  const activeCategoryFilter = useGamesStore((s) => s.activeCategoryFilter);
  const activeGenreFilter = useGamesStore((s) => s.activeGenreFilter);
  const activeDeveloperFilter = useGamesStore((s) => s.activeDeveloperFilter);
  const selectedTags = useGamesStore((s) => s.selectedTags);

  const { filtered, groups } = useMemo(() => {
    const f = filterGames(games, {
      searchQuery,
      showInstalledOnly,
      showHidden: false,
      showFavorites: false,
      platformFilter: activePlatformFilter,
      categoryFilter: activeCategoryFilter,
      genreFilter: activeGenreFilter,
      developerFilter: activeDeveloperFilter,
      selectedTags,
    });
    const sorted = sortGames(f, sortOrder as SortKey, sortDirection);
    const g = groupGames(sorted, groupBy as any, {
      all: t("group_all"),
      unknown: t("group_unknown"),
      uncategorized: t("group_uncategorized"),
      manual: t("group_manual"),
      favorites: t("group_favorites"),
      other: t("group_other"),
    });
    return { filtered: sorted, groups: g };
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
    selectedTags,
    t,
  ]);

  // 星球视图也跟随当前的筛选结果，把过滤后的游戏按 7 个分区归类。
  const zones = useMemo(() => mapGamesToZones(filtered), [filtered]);

  const total = groups.reduce((acc, g) => acc + g.games.length, 0);

  if (total === 0) {
    return <EmptyState hasGames={games.length > 0} />;
  }

  if (viewMode === "planet") {
    return (
      <Suspense
        fallback={
          <div className="planet-empty">{t("planet_loading")}</div>
        }
      >
        <PlanetView zones={zones} />
      </Suspense>
    );
  }

  return <GridView groups={groups} />;
}
