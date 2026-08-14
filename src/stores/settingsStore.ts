// Settings store, loaded/saved through the backend.

import { create } from "zustand";
import { api } from "../api/client";
import type { AppSettings, Platform } from "../types/models";

const DEFAULT_SETTINGS: AppSettings = {
  startupBehavior: "StartNormal",
  enableTray: true,
  minimizeToTray: false,
  closeToTray: false,
  language: "en-US",
  firstTimeWizardComplete: false,
  databasePath: undefined,
  autoBackupEnabled: true,
  gridViewImage: "Cover",
  detailsViewImage: "Background",
  listViewImage: "Icon",
  showInstalledOnly: false,
  showHidden: false,
  showFavorites: false,
  sortOrder: "Name",
  sortDirection: "Ascending",
  fullscreenMode: false,
  controllerSupport: false,
  loginEnabled: false,
  loginType: "wechat",
  loggedIn: false,
  username: undefined,
  trackPlaytime: true,
  cardWidth: 180,
  cardGap: 8,
  sidebarWidth: 210,
  enterpriseConfigPath: "D:/1.json",
  currentUserKind: "",
  currentUserName: "",
  currentUserLevel: 3,
  fontFamily: "",
  themeId: undefined,
  styleId: undefined,
};

interface SettingsState {
  settings: AppSettings;
  platforms: Platform[];
  loaded: boolean;

  load: () => Promise<void>;
  save: (s: Partial<AppSettings>) => Promise<void>;
  loadPlatforms: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  platforms: [],
  loaded: false,

  load: async () => {
    // 如果 main.tsx 已经预加载并注入了 settings（治本：避免启动闪烁），
    // 这里直接返回，不再 invoke——否则会在 React 渲染途中再次切换语言，
    // 引发"先英文再中文"的闪烁。
    if (get().loaded) return;
    const settings = await api.getSettings();
    set({ settings, loaded: true });
  },

  save: async (partial) => {
    const next = { ...get().settings, ...partial };
    const saved = await api.saveSettings(next);
    set({ settings: saved });
  },

  loadPlatforms: async () => {
    const platforms = await api.getPlatforms();
    set({ platforms });
  },
}));
