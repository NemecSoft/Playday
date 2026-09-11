// 社区氛围——数据类型（前端内存态，不持久化）。

/** 在线用户（虚拟或真实） */
export interface OnlineUser {
  id: string;
  nickname: string;
  /** 头像底色（不存图片，用色块圆点） */
  avatarColor: string;
  /** 正在玩的游戏名 */
  playingGame?: string;
}

/** 社区动态（弹幕/活动） */
export interface CommunityActivity {
  id: string;
  type: "start" | "finish" | "like" | "comment" | "online";
  user: OnlineUser;
  game?: string;
  text?: string;
  at: number;
}

/** 某游戏的互动计数 */
export interface GameCommunityStats {
  gameId: string;
  online: number;
  played: number;
  liked: number;
}

/** 弹幕（顶部飘过的短评） */
export interface Danmaku {
  id: string;
  user: OnlineUser;
  text: string;
  at: number;
}
