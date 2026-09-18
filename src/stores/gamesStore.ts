// Central store for games, view mode, filtering, sorting & selection.

import { create } from "zustand";
import { api } from "../api/client";
import { t } from "../i18n";
import { useAuthStore } from "./authStore";
import { useMusicStore } from "./musicStore";
import { preloadImages } from "../utils/assets";
import type { Game, GameAction } from "../types/models";
import type { FacetKey, SortKey } from "../utils/selectors";

// 模块级变量：控制"正在启动游戏"横幅至少展示多久。
// 启动流程可能几百毫秒就完成，如果不强制最短展示时间，横幅会一闪而过看不清。
// 这里保证从 setLaunching 到真正清除至少间隔 MIN_LAUNCH_BANNER_MS。
let launchingTimer: ReturnType<typeof setTimeout> | null = null;
let launchingStartedAt = 0;
const MIN_LAUNCH_BANNER_MS = 3000; // 至少显示 3 秒
// 排序键直接复用 selectors 的 SortKey：以前这里是一份重复的字面量联合类型，
// 两边各自漂移（加 rating 时差点只改了一边），所以收敛成别名。
export type SortOrder = SortKey;
export type SortDirection = "ascending" | "descending";

/** Top-level page shown in the main area: the game library or the news page. */
export type ActivePage = "library" | "news";

interface GamesState {
  games: Game[];
  loading: boolean;
  error?: string;

  activePage: ActivePage;
  /** 当前高亮的那一张卡片（单选；点卡片写入，见 selectGame）。 */
  selectedGameIds: string[];
  searchQuery: string;
  sortOrder: SortOrder;
  sortDirection: SortDirection;
  showInstalledOnly: boolean;
  showHidden: boolean;
  showFavorites: boolean;
  groupBy: string;
  /**
   * 分组是否已被"定过"（用户手动选过，或"按用户等级的默认分组"已经生效过一次）。
   * 自动默认只应用一次 —— 否则用户手动改成"不分组"后，切一次标签页（本组件重新挂载）
   * 又会被改回"游戏级别"。见 GamesView 与 utils/selectors 的 defaultGroupByFor。
   */
  groupByDecided: boolean;
  /** 已折叠的分组 key（仅本次会话记忆，不写 config.json）。 */
  collapsedGroups: string[];
  activePlatformFilter: string;
  activeCategoryFilter: string;
  activeGenreFilter: string;
  activeDeveloperFilter: string;
  /** 侧栏当前筛选维度（标签/类型/系列/地区/年代）。 */
  facet: FacetKey;
  /** 侧栏该维度下勾选的值。 */
  facetValues: string[];
  /** 多选语义：and=全部命中（交集）/ or=任一命中（并集）。 */
  facetMode: "and" | "or";
  /** Whether the sidebar is expanded. Auto-hides by default. */
  sidebarVisible: boolean;
  /**
   * 侧栏展开时**多占**的宽度（px）= 展开态 root 宽 − 常驻开关按钮的外宽
   * （收起态 root 宽就等于按钮外宽，所以这是个不依赖缓存的精确值）。
   * 网格用它把宽度加回来，从而"侧栏开合/拖动只缩放、不重排列数"
   * （见 utils/gridLayout.ts 的 gridReferenceWidth）。由 Sidebar 实测上报。
   */
  sidebarOccupiedWidth: number;

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
  setSearch: (q: string) => void;
  setSort: (o: SortOrder, d: SortDirection) => void;
  toggleInstalledOnly: () => void;
  toggleHidden: () => void;
  toggleFavorites: () => void;
  setGroupBy: (g: string) => void;
  toggleGroupCollapsed: (key: string) => void;
  setPlatformFilter: (p: string) => void;
  setCategoryFilter: (c: string) => void;
  setGenreFilter: (g: string) => void;
  setDeveloperFilter: (d: string) => void;
  setFacet: (f: FacetKey) => void;
  toggleFacetValue: (v: string) => void;
  clearFacetValues: () => void;
  setFacetMode: (m: "and" | "or") => void;
  setSidebarVisible: (v: boolean) => void;
  toggleSidebar: () => void;
  /** 由 Sidebar 实测上报"展开时多占的宽度"（见 sidebarOccupiedWidth 字段）。 */
  setSidebarOccupiedWidth: (w: number) => void;
  clearFilters: () => void;
  /** 选中（单选）一张卡片：只用于网格的高亮。 */
  selectGame: (id: string) => void;
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
  searchQuery: "",
  sortOrder: "added",
  sortDirection: "descending",
  showInstalledOnly: false,
  showHidden: false,
  showFavorites: false,
  groupBy: "none",
  groupByDecided: false,
  collapsedGroups: [],
  activePlatformFilter: "all",
  activeCategoryFilter: "all",
  activeGenreFilter: "all",
  activeDeveloperFilter: "all",
  facet: "tag",
  facetValues: [],
  facetMode: "and",
  sidebarVisible: false,
  sidebarOccupiedWidth: 0,
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
  // Search and tag filters are mutually exclusive: typing in the search box
  // clears the selected tags, and picking a tag clears the search query.
  setSearch: (q) => set({ searchQuery: q, facetValues: [] }),
  setSort: (o, d) => set({ sortOrder: o, sortDirection: d }),
  toggleInstalledOnly: () => set((s) => ({ showInstalledOnly: !s.showInstalledOnly })),
  toggleHidden: () => set((s) => ({ showHidden: !s.showHidden })),
  toggleFavorites: () => set((s) => ({ showFavorites: !s.showFavorites })),
  setGroupBy: (g) => set({ groupBy: g, groupByDecided: true }),
  // 折叠/展开某个分组；key 就是分组的 label（groupGames 的 Group.key）。
  toggleGroupCollapsed: (key) =>
    set((s) => ({
      collapsedGroups: s.collapsedGroups.includes(key)
        ? s.collapsedGroups.filter((k) => k !== key)
        : [...s.collapsedGroups, key],
    })),
  setPlatformFilter: (p) => set({ activePlatformFilter: p }),
  setCategoryFilter: (c) => set({ activeCategoryFilter: c }),
  setGenreFilter: (g) => set({ activeGenreFilter: g }),
  setDeveloperFilter: (d) => set({ activeDeveloperFilter: d }),
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
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  // 只在真的变了才 set：ResizeObserver 每次回调都 set 会白触发一轮网格重渲染。
  setSidebarOccupiedWidth: (w) =>
    set((s) => (s.sidebarOccupiedWidth === w ? s : { sidebarOccupiedWidth: w })),
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
      facetValues: [],
    }),

  // 单选：点一张卡片就只高亮这一张。
  // 2026-09-14 需求去掉 Ctrl/⌘+点多选 —— 选中集合**没有任何消费方**（没有批量启动、
  // 批量隐藏之类的操作），只有网格自己在画高亮，纯多余。原先的 `multi` 参数一并删掉，
  // 免得留着让人以为还有多选这条路。
  selectGame: (id) => set({ selectedGameIds: [id] }),

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
        // 文案**不带等级数字**："当前用户等级 1、游戏需要 2" 是给开发者看的；
        // 用户只需要知道"升成钻石版网吧才能玩"（用户明确要求过）。
        // 判定规则见 docs/design/user-level-detection.md
        void api.showNotification(t("grid_diamond_only"), t("need_diamond_cafe"));
        return false;
      }
    }
    // 候选启动项只取「游玩指令」（isPlayAction === true）。
    // 存档备份之类的辅助动作虽然也是 File 类型，但不用来开游戏；混进候选列表会导致
    // 几乎每个游戏都弹出选择窗（实测 1276 个游戏里有 1245 个因此被误弹）。
    const playActions = (game?.actions ?? []).filter(
      (a) => a.isPlayAction === true && (a.path ?? "").trim() !== ""
    );
    // 只有 1 个就直接用它（显式传 id，不依赖后端的 playTask 兜底，保证「默认第一个」
    // 的行为可预期）；多于 1 个才让用户选。
    const targetActionId = actionId ?? playActions[0]?.id;
    if (!actionId && game && playActions.length > 1) {
      set({ pendingLaunch: { game, actions: playActions } });
      return false;
    }
    // 到这里才算"真的要启动"。检测（下面）通过了再弹"正在启动《游戏名》…"横幅
    // —— 启动可能要先跑前置脚本 / spawn 进程，耗时几百毫秒到几秒，
    // 不能让用户感觉"点了没反应"。
    const launchName = game?.name ?? "";

    // 「找不到游戏就直接说找不到，别先弹正在启动」（2026-09-17 用户要求）。
    // 必须先问主进程一次：能不能起来只有它知道（要判文件在不在、是不是可执行文件）。
    //
    // 顺序为什么是重点：横幅有**最短展示时长**（MIN_LAUNCH_BANNER_MS = 3 秒），
    // 先弹横幅再报错的话，用户会看到"正在启动《X》…"停三秒、然后才看到"找不到"，
    // 像是"启动了却起不来"—— 而实际上根本没启动过。所以检测必须排在 setLaunching 之前。
    // 也排在下面的 pause() 之前：没真的启动就不该掐掉背景音乐（与前面两条提前 return 同理）。
    if (launchName) {
      try {
        const pre = await api.checkGameLaunch(id, targetActionId);
        if (!pre?.ok) {
          // 详细原因（含解析后的绝对路径）**只写控制台，不进通知**：那是给开发/维护看的
          // 内部信息，弹给玩家等于把安装目录摆出来（2026-09-18 用户要求）。
          // 主进程那边也会打一份（见 electron/ipc/games.ts 的 check_game_launch）。
          console.warn("[launch] 启动前检测未通过：", launchName, pre?.reason ?? "");
          void api.showNotification(t("launch_not_found_title"), t("launch_not_found_body", { name: launchName }));
          return false;
        }
      } catch {
        // 检测这一步**自己**出问题（IPC 异常等）时不当成"找不到"：直接放行，
        // 让真正的 launchGame 去报真实错误。宁可多一次启动尝试，
        // 也不要因为检测崩了就把本来能玩的游戏判成"找不到"。
      }
    }

    // 启动游戏 = 背景音乐必须退场：游戏一出声，音乐再响就是两层声音叠在一起；
    // 而且游戏多半是全屏，主界面已经被挡住，用户根本找不到播放控件去关掉它。
    // 放在这里（而不是函数开头）是刻意的：前面几条 return —— "等级不够"、
    // "有多个启动项、等用户选"、"启动前检测没通过（找不到启动文件）"——
    // 都还**没有真的启动**，那时候把音乐掐掉是误伤。
    //
    // 为什么是 pause()（"停了就不自动恢复"）而不是视频那套"让位 → 关掉后恢复"：
    // 主进程的 game_exited 只在"退出后要问用户是否备份存档"时才推给前端
    // （saveBackupMode 为 auto/never、或该游戏没配存档路径时根本不发，见
    // electron/ipc/saveManager.ts），拿它当"游戏结束"的恢复信号会时灵时不灵。
    // 宁可"只停不恢复"：退出游戏后想继续听，状态栏点一下播放键即可。
    useMusicStore.getState().pause();
    if (launchName) get().setLaunching(id, launchName);

    // launch_game 返回的是 { launched, error } 对象，不是裸 boolean。
    // 历史上这里把它当 boolean 用——对象永远 truthy，于是后端返回的
    // "文件不存在 / 不是可执行文件"等错误被完全吞掉，表现就是"点了没反应"。
    let res: { launched: boolean; error?: string } | undefined;
    try {
      res = await api.launchGame(id, targetActionId);
    } catch (e) {
      // 只有 IPC 本身失败（后端抛异常）才会走到这里。
      get().clearLaunching(); // 启动失败也要清除"正在启动"（会延迟到最少展示 3 秒）
      void api.showNotification(
        "无法启动",
        game ? `《${game.name}》：${String(e)}` : String(e)
      );
      return false;
    }
    // 启动流程结束（无论成功失败）都清除"正在启动"反馈（会延迟到最少展示 3 秒）。
    get().clearLaunching();
    if (!res?.launched) {
      // 后端"启动前检测"未通过（文件不存在 / 不是可执行文件 / 等级不足等）：
      // 必须把原因告诉用户，否则表现就是"点了没反应"。
      const reason = res?.error || "未知错误";
      void api.showNotification("无法启动", game ? `《${game.name}》：${reason}` : reason);
      return false;
    }
    // Signal to App.tsx to navigate to the detail page (so the user can read
    // the guide / instructions while playing).
    set({ lastLaunchedId: id });
    // 注意：这里不再调用 maximize_window。之前调用它时，这个命令实际上是
    // "最大化/还原"切换，窗口本来就是最大化时会把它还原，导致"点开始游戏
    // 窗口被恢复"的怪异表现。启动游戏不应该改变用户的窗口状态，保持原样即可。
    return true;
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
