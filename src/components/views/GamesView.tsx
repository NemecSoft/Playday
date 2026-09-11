// Applies filtering / sorting / grouping and renders the grid view.

import { useMemo } from "react";
import { useGamesStore } from "../../stores/gamesStore";
import { filterGames, sortGames, groupGames, type SortKey } from "../../utils/selectors";
import GridView from "./GridView";
import EmptyState from "./EmptyState";
import { useI18n } from "../../i18n";

export default function GamesView() {
  const { t } = useI18n();
  const games = useGamesStore((s) => s.games);
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const showInstalledOnly = useGamesStore((s) => s.showInstalledOnly);
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

  const groups = useMemo(() => {
    const f = filterGames(games, {
      searchQuery,
      showInstalledOnly,
      showHidden: false,
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
