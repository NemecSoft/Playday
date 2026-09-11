// 社区氛围——数据源 provider 抽象。
// 前端展示层不关心数据来自"随机模拟"还是"真实后端"，只依赖这里的统一接口。
// 见 docs/design/community-atmosphere.md（分层递进：mock 默认，real 预留）。
import type { Observable } from "./observable";
import type { OnlineUser, CommunityActivity, GameCommunityStats } from "./models";

export interface CommunityProvider {
  /** 当前在线用户列表（含昵称/正在玩） */
  getOnlineUsers(): Observable<OnlineUser[]>;
  /** 实时动态流（弹幕/活动） */
  getActivityStream(): Observable<CommunityActivity[]>;
  /** 某游戏的互动计数 */
  getGameStats(gameId: string): GameCommunityStats;
  /** 发送一条弹幕/评论（真实时提交；模拟时本地回显） */
  sendMessage(text: string): Promise<void>;
  /** 启动/退出 provider（连接/心跳等） */
  start(): void;
  stop(): void;
}
