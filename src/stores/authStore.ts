// Auth store: current user (enterprise / personal / guest) + login state.

import { create } from "zustand";
import { api } from "../api/client";
import type { CurrentUser } from "../types/models";

interface AuthState {
  currentUser: CurrentUser | null;
  loaded: boolean;
  /** Cached settings' current_user_level for quick access control checks. */
  userLevel: number;

  load: () => Promise<void>;
  loginPersonal: (account: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** True if the current user's level allows playing a game of `gameLevel`. */
  canPlay: (gameLevel: number) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  loaded: false,
  userLevel: 3,

  load: async () => {
    try {
      const user = await api.getCurrentUser();
      set({
        currentUser: user,
        loaded: true,
        userLevel: user ? user.level : 3,
      });
    } catch {
      set({ loaded: true });
    }
  },

  loginPersonal: async (account, password) => {
    const user = await api.loginPersonal(account, password);
    if (user) {
      set({ currentUser: user, userLevel: user.level });
      return true;
    }
    return false;
  },

  logout: async () => {
    await api.logout();
    set({ currentUser: null, userLevel: 3 });
  },

  canPlay: (gameLevel) => get().userLevel >= gameLevel,
}));
