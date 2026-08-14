// Cross-component UI state (modals, menus, tabs) so any view can trigger them
// without prop drilling.

import { create } from "zustand";

/** Top-level tab shown in the main area. */
export type ActiveTab = "home" | "videos" | "tools";

interface UIState {
  /** Whether the settings modal is open. */
  settingsOpen: boolean;

  /** Whether the app menu (TitleBar leading) is open. */
  menuOpen: boolean;

  /** The active top-level tab: home (library) / videos / tools. */
  activeTab: ActiveTab;

  openSettings: () => void;
  closeSettings: () => void;

  toggleMenu: () => void;
  closeMenu: () => void;

  setTab: (tab: ActiveTab) => void;
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  menuOpen: false,
  activeTab: "home",

  openSettings: () => set({ settingsOpen: true, menuOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),

  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),
  closeMenu: () => set({ menuOpen: false }),

  setTab: (tab) => set({ activeTab: tab }),
}));
