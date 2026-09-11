// 社区氛围——全局 store（内存态，不持久化）。
// 持有 provider 实例 + 订阅在线用户/活动流/弹幕，供各 UI 组件消费。
// 可用 communityEnabled 开关控制（设置里可关）。
import { create } from "zustand";
import { MockCommunityProvider } from "./mockProvider";
import type { CommunityProvider } from "./provider";
import type { OnlineUser, CommunityActivity, Danmaku } from "./models";
import type { Observable } from "./observable";

// 当前 provider：默认模拟。以后接真实后端时替换为 realProvider（见设计文档）。
const provider: CommunityProvider = new MockCommunityProvider();

interface CommunityState {
  enabled: boolean;
  onlineUsers: OnlineUser[];
  activities: CommunityActivity[];
  danmaku: Danmaku[];
  // 初始化 provider（订阅数据流）——需在游戏库加载后调用（传入游戏名列表）
  init: (gameNames: string[]) => void;
  // 开启/关闭氛围
  setEnabled: (v: boolean) => void;
  // 发送弹幕
  send: (text: string) => Promise<void>;
  // 读某游戏互动计数
  getGameStats: (gameId: string) => { online: number; played: number; liked: number };
}

// 只读订阅工具：把 Observable 桥接到 zustand set
function bindObs<T>(
  obs: Observable<T>,
  key: keyof Pick<CommunityState, "onlineUsers" | "activities" | "danmaku">,
  set: (p: Partial<CommunityState>) => void,
  get: () => CommunityState,
): void {
  obs.subscribe((v) => {
    if (get().enabled) {
      set({ [key]: v } as Partial<CommunityState>);
    }
  });
}

export const useCommunityStore = create<CommunityState>((set, get) => ({
  enabled: false, // 默认关，用户在设置里开启（避免打扰）
  onlineUsers: [],
  activities: [],
  danmaku: [],

  init: (gameNames) => {
    const mock = provider as MockCommunityProvider;
    mock.setGameNames(gameNames);
    // 只订阅一次
    if (!(provider as unknown as { _inited?: boolean })._inited) {
      (provider as unknown as { _inited?: boolean })._inited = true;
      bindObs(mock.getOnlineUsers(), "onlineUsers", set, get);
      bindObs(mock.getActivityStream(), "activities", set, get);
      bindObs(mock.getDanmaku(), "danmaku", set, get);
    }
    provider.start();
  },

  setEnabled: (v) => {
    set({ enabled: v });
    if (v) provider.start();
    else {
      provider.stop();
      set({ onlineUsers: [], activities: [], danmaku: [] });
    }
  },

  send: async (text) => {
    await provider.sendMessage(text);
  },

  getGameStats: (gameId) => provider.getGameStats(gameId),
}));
