// 主进程侧的数据模型入口。
//
// ⚠️ 本文件**只做 re-export**：所有实体接口的单一事实来源是 shared/models.ts。
// 历史上这里手抄了一份（与 src/types/models.ts 重复），加字段要改两处、漏一处
// 就会静默失效（本会话在 gameSaveHelperPath / defaultGameRootPath 上各踩一次）。
// scripts/check-architecture.mjs 会检查本文件不得再出现 interface/type 定义，
// 防止重复定义漂移回来。
//
// 保留本文件的意义：主进程各处一直写 `from "../core/models"`，只换实现不动调用点。
export type {
  AppSettings,
  AppUser,
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
  SessionUser,
} from "../../shared/models";
export { DEFAULT_CARD_TEXT, DEFAULT_DESIGNER, DEFAULT_SETTINGS } from "../../shared/models";
