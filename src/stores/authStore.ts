// Auth store: current user (enterprise / personal / guest) + login state.

import { create } from "zustand";
import { api } from "../api/client";
import type { CurrentUser } from "../types/models";
// 等级判定与主进程共用同一份实现（唯一事实来源，见 docs/design/user-level-detection.md）
import { canPlay } from "../../shared/userLevel";

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
  // 加载完成前的暂定值取 3（宽松）：主进程在真正启动游戏/备份存档时还会再判一次，
  // 所以这里宽松不会放行任何操作，只会让卡片在几十毫秒内不闪出"锁定"红标。
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

  canPlay: (gameLevel) => canPlay(get().userLevel, gameLevel),
}));
