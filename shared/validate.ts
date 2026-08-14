// 共享的"运行前/路径检测"类型定义。
// 客户端运行前检测、管理端批量检测都用这套类型，保证前后端字段一致。
// 真正的检测逻辑在后端 validation.rs（统一核心），前端只复用这里的类型。

/** 单个启动项路径的检测结果（后端 validation::ActionValidation）。 */
export interface ActionValidation {
  /** 路径是否合法且目标存在、是可执行文件。 */
  valid: boolean;
  /** 解析占位符后的绝对路径。 */
  resolved: string;
  /** 不合法时的中文原因（合法时为空）。 */
  reason: string;
  /** 目标文件扩展名（如 exe、bat、lnk）。 */
  extension: string;
}

/** 单个游戏的运行前检测结果（管理端批量检测用）。 */
export interface GameValidationResult {
  gameId: string;
  gameName: string;
  /** 实际启动用的指令名（is_play_action；无则空）。 */
  actionName: string;
  /** 解析后的目标 exe 绝对路径（无启动指令时为空）。 */
  exePath: string;
  /** 目标 exe 是否存在且可执行。 */
  exists: boolean;
  /** 检测失败说明（合法时为空）。 */
  reason: string;
}
