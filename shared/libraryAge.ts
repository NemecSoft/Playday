// "游戏库太旧 → 不允许进入系统"的**纯逻辑**（零依赖、可单测）。
// 设计文档：docs/design/user-level-detection.md 的「库过旧」一节。
//
// 需求：数据库一个月没有发生变化 → 提示"系统过旧"，只能退出，不允许进入。
//
// 判定依据 = **权威库文件的最后修改时间**（`<库根>/Admin/library.db`，从 libraryDir 推导），
// 也就是"库内容最后一次被改动的时间"。为什么用文件时间而不是"库里存一个日期字段"：
//   ① 零维护：脚本导入游戏、同步标签、手工改库……任何改动都会刷新文件时间，
//      不需要每个写入方都记得去更新某个字段（漏改一处就是静默失效）；
//   ② 与本项目既有体系一致：db.ts 把权威库复制成运行时副本时就**特意保留了 mtime**
//      （shared/librarySync.ts 的 shouldSyncDatabase 正是靠它判断要不要复制），
//      说明"文件时间 = 内容最后变化时间"这条语义在本体系里已经成立。
// ⚠️ 千万不要用运行时副本的时间：它每次写设置都会被刷新（实测比权威库还新），
//    拿它判定等于永远"刚更新过"。复制与路径解析见 electron/core/paths.ts。

/**
 * 超过多少天没变化就判定为"过旧"。
 * 需求指定写死 30 天、**不给配置开关**（避免被改掉就形同虚设）。
 */
export const MAX_LIBRARY_AGE_DAYS = 30;

export interface LibraryAgeInfo {
  /** 库文件最后修改时间（毫秒）；文件不存在/读不到时为 null。 */
  mtimeMs: number | null;
  /** 距今多少天没变化（向下取整）；读不到时为 null。 */
  ageDays: number | null;
  /** 是否判定为"过旧"，过旧则不允许进入系统。 */
  outdated: boolean;
}

/**
 * 判定库有多旧。
 *
 * 三条"不锁"的兜底（宁可放过，不可错锁 —— 被锁的人是**真进不去**）：
 *   1) 读不到文件（库不存在 / 没权限 / 新手装机还没拷库）→ 不锁；
 *   2) 文件时间比"现在"还新（系统时间被往前调过、或从别的机器拷来未来的时间）→ 不锁；
 *   3) 刚好满 30 天以内（包含第 30 天）→ 不锁；满 30 天才锁（`>=`）。
 */
export function evaluateLibraryAge(
  mtimeMs: number | null | undefined,
  nowMs: number,
  maxAgeDays: number = MAX_LIBRARY_AGE_DAYS,
): LibraryAgeInfo {
  if (mtimeMs == null || !Number.isFinite(mtimeMs)) {
    return { mtimeMs: null, ageDays: null, outdated: false };
  }
  const ageMs = nowMs - mtimeMs;
  if (ageMs <= 0) {
    // 文件时间在未来：当成"刚更新过"，绝不因此锁人。
    return { mtimeMs, ageDays: 0, outdated: false };
  }
  const ageDays = Math.floor(ageMs / 86400000);
  return { mtimeMs, ageDays, outdated: ageDays >= maxAgeDays };
}
