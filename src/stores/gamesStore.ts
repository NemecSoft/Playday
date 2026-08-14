// Central store for games, view mode, filtering, sorting & selection.

import { create } from "zustand";
import { api } from "../api/client";
import { useAuthStore } from "./authStore";
import { preloadImages } from "../utils/assets";
import type { Game, GameAction } from "../types/models";

// 模块级变量：控制"正在启动游戏"横幅至少展示多久。
// 启动流程可能几百毫秒就完成，如果不强制最短展示时间，横幅会一闪而过看不清。
// 这里保证从 setLaunching 到真正清除至少间隔 MIN_LAUNCH_BANNER_MS。
let launchingTimer: ReturnType<typeof setTimeout> | null = null;
let launchingStartedAt = 0;
const MIN_LAUNCH_BANNER_MS = 3000; // 至少显示 3 秒

export type ViewMode = "grid" | "list" | "details" | "planet";
export type SortOrder = "name" | "added" | "lastPlayed" | "playtime" | "releaseDate";
export type SortDirection = "ascending" | "descending";

/** Top-level page shown in the main area: the game library or the news page. */
export type ActivePage = "library" | "news";

interface GamesState {
  games: Game[];
  loading: boolean;
  error?: string;

  activePage: ActivePage;
  selectedGameIds: string[];
  viewMode: ViewMode;
  searchQuery: string;
  sortOrder: SortOrder;
  sortDirection: SortDirection;
  showInstalledOnly: boolean;
  showHidden: boolean;
  showFavorites: boolean;
  groupBy: string;
  activePlatformFilter: string;
  activeCategoryFilter: string;
  activeGenreFilter: string;
  activeDeveloperFilter: string;
  /** Tags checked in the sidebar (AND semantics: keep games that contain all of them). */
  selectedTags: string[];
  /** Whether the sidebar is expanded. Auto-hides by default. */
  sidebarVisible: boolean;

  /** Set when a game has just been launched; consumers (App.tsx) navigate to the
   * game-detail page so the user can read the guide / instructions while
   * playing. Cleared via `clearLastLaunched` after navigation. */
  lastLaunchedId: string | null;
  /** 待用户选择启动项的弹窗数据（有多个可启动指令时设置）。 */
  pendingLaunch: { game: Game; actions: GameAction[] } | null;
  /** 当前正在启动的游戏（启动过程耗时：spawn 进程 + 可能的前置脚本）。
   *  用于给用户醒目的"正在启动《游戏名》…"反馈；启动完成后置回 null。 */
  launchingGame: { id: string; name: string } | null;

  // actions
  load: () => Promise<void>;
  setPage: (p: ActivePage) => void;
  setViewMode: (m: ViewMode) => void;
  setSearch: (q: string) => void;
  setSort: (o: SortOrder, d: SortDirection) => void;
  toggleInstalledOnly: () => void;
  toggleHidden: () => void;
  toggleFavorites: () => void;
  setGroupBy: (g: string) => void;
  setPlatformFilter: (p: string) => void;
  setCategoryFilter: (c: string) => void;
  setGenreFilter: (g: string) => void;
  setDeveloperFilter: (d: string) => void;
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  setSidebarVisible: (v: boolean) => void;
  toggleSidebar: () => void;
  clearFilters: () => void;
  selectGame: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  toggleFavorite: (id: string) => Promise<void>;
  toggleHiddenGame: (id: string) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;
  launchGame: (id: string, actionId?: string) => Promise<boolean>;
  setPendingLaunch: (v: { game: Game; actions: GameAction[] } | null) => void;
  clearLastLaunched: () => void;
  /** 开始启动游戏：设置"正在启动《游戏名》"状态，供全局横幅展示。 */
  setLaunching: (id: string, name: string) => void;
  /** 启动结束（成功或失败）：清除"正在启动"状态。 */
  clearLaunching: () => void;
  saveGame: (game: Game) => Promise<void>;
  rescanCovers: () => Promise<{ matched: number; coverFiles: number; considered: number; dirExists: boolean; dirPath: string }>;
}

export const useGamesStore = create<GamesState>((set, get) => ({
  games: [],
  loading: false,

  activePage: "library",
  selectedGameIds: [],
  viewMode: "grid",
  searchQuery: "",
  sortOrder: "name",
  sortDirection: "ascending",
  showInstalledOnly: false,
  showHidden: false,
  showFavorites: false,
  groupBy: "none",
  activePlatformFilter: "all",
  activeCategoryFilter: "all",
  activeGenreFilter: "all",
  activeDeveloperFilter: "all",
  selectedTags: [],
  sidebarVisible: false,
  lastLaunchedId: null,
  pendingLaunch: null,
  launchingGame: null,

  load: async () => {
    set({ loading: true });
    try {
      const games = await api.getGames();
      set({ games, loading: false, error: undefined });
      // Images load lazily via IntersectionObserver in the grid (see
      // GridView). We deliberately do NOT preload all covers at startup,
      // since a 1000+ game library would otherwise flood the backend IPC
      // and stall the UI for many seconds.
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  setPage: (p) => set({ activePage: p }),
  setViewMode: (m) => set({ viewMode: m }),
  // Search and tag filters are mutually exclusive: typing in the search box
  // clears the selected tags, and picking a tag clears the search query.
  setSearch: (q) => set({ searchQuery: q, selectedTags: [] }),
  setSort: (o, d) => set({ sortOrder: o, sortDirection: d }),
  toggleInstalledOnly: () => set((s) => ({ showInstalledOnly: !s.showInstalledOnly })),
  toggleHidden: () => set((s) => ({ showHidden: !s.showHidden })),
  toggleFavorites: () => set((s) => ({ showFavorites: !s.showFavorites })),
  setGroupBy: (g) => set({ groupBy: g }),
  setPlatformFilter: (p) => set({ activePlatformFilter: p }),
  setCategoryFilter: (c) => set({ activeCategoryFilter: c }),
  setGenreFilter: (g) => set({ activeGenreFilter: g }),
  setDeveloperFilter: (d) => set({ activeDeveloperFilter: d }),
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
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  clearLastLaunched: () => set({ lastLaunchedId: null }),
  setLaunching: (id, name) => {
    // 记录横幅开始显示的时刻，用于保证"至少显示满 MIN_LAUNCH_BANNER_MS"。
    launchingStartedAt = Date.now();
    set({ launchingGame: { id, name } });
  },
  clearLaunching: () => {
    // 启动可能 0.3 秒就完成，但如果立刻清掉横幅会"一闪而过"看不清。
    // 这里延迟到"开始后至少 3 秒"再真正清除，让用户看得清"正在启动《游戏名》"。
    const elapsed = Date.now() - launchingStartedAt;
    const remaining = Math.max(0, MIN_LAUNCH_BANNER_MS - elapsed);
    // 清掉上一次的定时器，避免多次启动叠加出多个定时器互相干扰。
    if (launchingTimer) {
      clearTimeout(launchingTimer);
    }
    launchingTimer = setTimeout(() => {
      set({ launchingGame: null });
      launchingTimer = null;
    }, remaining);
  },
  setPendingLaunch: (v) => set({ pendingLaunch: v }),
  clearFilters: () =>
    set({
      searchQuery: "",
      showInstalledOnly: false,
      showHidden: false,
      showFavorites: false,
      activePlatformFilter: "all",
      activeCategoryFilter: "all",
      activeGenreFilter: "all",
      activeDeveloperFilter: "all",
      selectedTags: [],
    }),

  selectGame: (id, multi = false) =>
    set((s) => {
      if (multi) {
        const has = s.selectedGameIds.includes(id);
        return {
          selectedGameIds: has
            ? s.selectedGameIds.filter((x) => x !== id)
            : [...s.selectedGameIds, id],
        };
      }
      return { selectedGameIds: [id] };
    }),

  clearSelection: () => set({ selectedGameIds: [] }),

  toggleFavorite: async (id) => {
    const game = get().games.find((g) => g.id === id);
    if (!game) return;
    const updated = { ...game, favorite: !game.favorite, modified: new Date().toISOString() };
    await api.saveGame(updated);
    set({ games: get().games.map((g) => (g.id === id ? updated : g)) });
  },

  toggleHiddenGame: async (id) => {
    const game = get().games.find((g) => g.id === id);
    if (!game) return;
    const updated = { ...game, hidden: !game.hidden, modified: new Date().toISOString() };
    await api.saveGame(updated);
    set({ games: get().games.map((g) => (g.id === id ? updated : g)) });
  },

  deleteGame: async (id) => {
    await api.deleteGame(id);
    set({
      games: get().games.filter((g) => g.id !== id),
      selectedGameIds: get().selectedGameIds.filter((x) => x !== id),
    });
  },

  launchGame: async (id, actionId) => {
    const game = get().games.find((g) => g.id === id);
    if (game) {
      // Front-end access check (backend enforces too). Show a friendly toast
      // if the current user's level is too low to play this game.
      const canPlay = useAuthStore.getState().canPlay(game.gameLevel);
      if (!canPlay) {
        void api.showNotification(
          "等级不足",
          `你的用户等级（${useAuthStore.getState().userLevel}）无法游玩《${game.name}》`
        );
        return false;
      }
    }
    // 有多个可启动指令且未指定具体指令时，弹窗让用户选择。
    if (!actionId && game) {
      const playable = game.actions.filter(
        (a) => a.type === "File" && (a.path ?? "").trim() !== ""
      );
      if (playable.length > 1) {
        set({ pendingLaunch: { game, actions: playable } });
        return false;
      }
    }
    // 进入启动流程：先给出醒目的"正在启动《游戏名》…"反馈（可能要先跑前置脚本
    // / spawn 进程，耗时几百毫秒到几秒，不能让用户感觉"点了没反应"）。
    const launchName = game?.name ?? "";
    if (launchName) get().setLaunching(id, launchName);

    let launched: boolean;
    try {
      launched = await api.launchGame(id, actionId);
    } catch (e) {
      // 后端"运行前检测"未通过时会返回错误（如"文件不存在"），这里弹出提示，
      // 而不是让未捕获的 Promise rejection 悄悄失败。
      get().clearLaunching(); // 启动失败也要清除"正在启动"（会延迟到最少展示 3 秒）
      void api.showNotification(
        "无法启动",
        game ? `《${game.name}》：${String(e)}` : String(e)
      );
      return false;
    }
    // 启动流程结束（无论成功失败）都清除"正在启动"反馈（会延迟到最少展示 3 秒）。
    get().clearLaunching();
    if (launched) {
      // Signal to App.tsx to navigate to the detail page (so the user can read
      // the guide / instructions while playing).
      set({ lastLaunchedId: id });
      // 注意：这里不再调用 maximize_window。之前调用它时，这个命令实际上是
      // "最大化/还原"切换，窗口本来就是最大化时会把它还原，导致"点开始游戏
      // 窗口被恢复"的怪异表现。启动游戏不应该改变用户的窗口状态，保持原样即可。
    }
    return launched;
  },

  saveGame: async (game) => {
    const before = get().games.find((g) => g.id === game.id);
    const saved = await api.saveGame(game);
    set({
      games: get().games.map((g) => (g.id === saved.id ? saved : g)),
    });
    // If the cover image changed, preload the new local image so the view
    // re-renders with the blob URL.
    if (before?.coverImage !== saved.coverImage && saved.coverImage) {
      void preloadImages([saved.coverImage]).then(() => {
        set({ games: [...get().games] });
      });
    }
  },

  rescanCovers: async () => {
    const res = await api.scanCovers();
    set({ games: res.games });
    // Image loading is handled lazily by GridView's IntersectionObserver;
    // no need to warm the entire cover cache after a rescan.
    return res.outcome;
  },
}));
