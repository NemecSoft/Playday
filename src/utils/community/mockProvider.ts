// 社区氛围——随机模拟 provider（方案一）。
// 纯前端本地模拟"在线用户 / 弹幕 / 活动流 / 互动计数"，营造多人氛围。
// 数据是虚拟的，不进入数据库；设置里可一键隐藏（communityEnabled=false）。
import { Observable } from "./observable";
import type {
  OnlineUser,
  CommunityActivity,
  GameCommunityStats,
  Danmaku,
} from "./models";
import type { CommunityProvider } from "./provider";

// ---- 预设库（虚拟，不涉及真实用户隐私） ----
const NICKNAMES = [
  "夜行者", "清风", "拾荒者", "老玩家", "喵星人", "像素骑士", "风中旅人",
  "暗夜猎手", "橘子汽水", "大聪明", "流浪猫", "钢铁直男", "山间晚风",
  "游戏宅", "阿伟", "小透明", "吃瓜群众", "咸鱼翻身", "星空漫步", "半糖去冰",
];
const AVATAR_COLORS = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899",
  "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];
const COMMENTS = [
  "这游戏画面不错！", "刚入坑，求带～", "通关了，结局有点意外", "BGM 很上头",
  "操作手感可以", "喜欢这个风格", "有一起联机的吗？", "三周目走起",
  "这个 Boss 打了好几次", "剧情很吸引人", "配置要求不高，流畅", "收藏了",
  "和朋友一起玩更开心", "捏人系统好评", "地图挺大的", "适合周末玩",
];
const ACTIVITY_TYPES = ["start", "finish", "like"] as const;

// 简单随机工具
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: readonly T[]): T => arr[rand(arr.length)];
function randId(prefix: string): string {
  return `${prefix}-${Date.now()}-${rand(100000)}`;
}

export class MockCommunityProvider implements CommunityProvider {
  private onlineUsers = new Observable<OnlineUser[]>([]);
  private activityStream = new Observable<CommunityActivity[]>([]);
  private danmakuStream = new Observable<Danmaku[]>([]);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private userPool: OnlineUser[] = [];
  private gameNames: string[] = [];
  private usedIds = new Set<string>();

  /** 传入游戏库名称（供"正在玩 xx"更贴合真实） */
  setGameNames(names: string[]): void {
    this.gameNames = names;
  }

  start(): void {
    if (this.timers.length > 0) return; // 已启动
    // 初始在线用户 3~10 人
    this.spawnUsers(3 + rand(8));
    // 周期：在线人数浮动 + 弹幕 + 活动流
    this.timers.push(setInterval(() => this.tickUsers(), 25000));
    this.timers.push(setInterval(() => this.spawnDanmaku(), 6000));
    this.timers.push(setInterval(() => this.spawnActivity(), 15000));
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  getOnlineUsers(): Observable<OnlineUser[]> {
    return this.onlineUsers;
  }
  getActivityStream(): Observable<CommunityActivity[]> {
    return this.activityStream;
  }
  getGameStats(gameId: string): GameCommunityStats {
    return {
      gameId,
      online: rand(3) + 1,
      played: rand(900) + 120,
      liked: rand(300) + 40,
    };
  }
  async sendMessage(_text: string): Promise<void> {
    // 模拟：本地回显一条自己的弹幕
    const me: OnlineUser = {
      id: "me",
      nickname: "我",
      avatarColor: "#2563eb",
      playingGame: undefined,
    };
    this.danmakuStream.next([
      ...this.danmakuStream.value.slice(-50),
      { id: randId("dan"), user: me, text: _text, at: Date.now() },
    ]);
  }

  // ---- 内部：生成模拟数据 ----
  private spawnUser(): OnlineUser {
    let nickname = pick(NICKNAMES);
    // 避免同名
    let guard = 0;
    while (this.usedIds.has(nickname) && guard++ < 20) nickname = pick(NICKNAMES);
    this.usedIds.add(nickname);
    return {
      id: randId("u"),
      nickname,
      avatarColor: pick(AVATAR_COLORS),
      playingGame: this.gameNames.length ? pick(this.gameNames) : undefined,
    };
  }

  private spawnUsers(count: number): void {
    for (let i = 0; i < count; i++) this.userPool.push(this.spawnUser());
    this.onlineUsers.next([...this.userPool]);
  }

  private tickUsers(): void {
    // 随机有人上线/下线，人数在 3~18 间浮动
    const delta = rand(3);
    if (Math.random() < 0.5 && this.userPool.length > 3) {
      // 下线一个
      const idx = rand(this.userPool.length);
      this.userPool.splice(idx, 1);
    }
    for (let i = 0; i < delta && this.userPool.length < 18; i++) {
      this.userPool.push(this.spawnUser());
    }
    this.onlineUsers.next([...this.userPool]);
  }

  private spawnDanmaku(): void {
    const user = pick(this.userPool.length ? this.userPool : [this.spawnUser()]);
    const dan: Danmaku = {
      id: randId("dan"),
      user,
      text: pick(COMMENTS),
      at: Date.now(),
    };
    this.danmakuStream.next([...this.danmakuStream.value.slice(-30), dan]);
  }

  private spawnActivity(): void {
    const user = pick(this.userPool.length ? this.userPool : [this.spawnUser()]);
    const type = pick(ACTIVITY_TYPES);
    const game = this.gameNames.length ? pick(this.gameNames) : undefined;
    const act: CommunityActivity = {
      id: randId("act"),
      type,
      user,
      game,
      at: Date.now(),
    };
    this.activityStream.next([...this.activityStream.value.slice(-20), act]);
  }

  // 供弹幕层读取（对外暴露一个只读观察）
  getDanmaku(): Observable<Danmaku[]> {
    return this.danmakuStream;
  }
}
