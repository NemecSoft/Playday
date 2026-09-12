// 前端侧的数据模型入口。
//
// ⚠️ 实体接口（Game / AppSettings / GameAction / Platform …）的单一事实来源是
// shared/models.ts，这里**只做 re-export**；本文件只保留"前端独有"的视图模型
// （主进程不产出的那些）。scripts/check-architecture.mjs 会检查实体类型没有
// 在本文件里被重复定义。
export type {
  AppSettings,
  CardTextStyle,
  CrashReport,
  DeepPartial,
  DesignerConfig,
  ErrorReportConfig,
  Game,
  GameAction,
  GameLink,
  GameName,
  GameVideo,
  GradientSpec,
  LibraryPluginInfo,
  LibraryStats,
  Platform,
} from "../../shared/models";
export { DEFAULT_CARD_TEXT } from "../../shared/models";

// ============================================================================
// 前端独有的视图模型（主进程只把它们当返回值，不参与持久化）
// ============================================================================

/** get_current_user 返回的"已解析用户"（比 SessionUser 多出企业配置状态）。 */
export interface CurrentUser {
  kind: "enterprise" | "personal" | "guest";
  name: string;
  account: string;
  level: number;
  enterprise: boolean;
  configPath: string;
  configExists: boolean;
}

/** 个人用户（管理端视角，不含密码）。 */
export interface PublicUser {
  id: string;
  account: string;
  name: string;
  level: number;
  createdAt: string;
}

/** 企业用户配置文件的预检结果（设置页展示用）。 */
export interface EnterprisePreview {
  path: string;
  exists: boolean;
  records: number;
  matchedIp?: string;
  matchedName: string;
  matchedLevel: number;
}

/** running_games 返回的"运行中的游戏"。 */
export interface RunningGame {
  gameId: string;
  gameName: string;
  startedAt: number;
}
