// 权威库 → 运行时副本：**要不要复制**的判定 —— 纯函数，零 import。
//
// 为什么需要判定：每次启动都无条件复制一遍整个库（当前 1.8MB，且会随着游戏数增长）
// 是纯浪费 —— 尤其权威库放在网络共享（`//NAS/...`）时，那是一次实打实的网络读。
// 判定规则（用户指定）：**大小 + 修改时间都一致就跳过**。
//
// ⚠️ 前提：复制时必须把权威库的 mtime 一起带过去（见 electron/core/db.ts）。
// 否则 copyFileSync 会给副本打上"现在"的时间戳，两边**永远不一致** → 本判定永不生效。
//
// ⚠️ 比较用严格相等，不做容差：宁可多复制一次，也不要漏掉一次真更新。
// （代价只是多一次复制；漏更新的代价是玩家看到的库是旧的。）

export interface FileStamp {
  size: number;
  /** 修改时间（毫秒）。 */
  mtimeMs: number;
}

/** 两个文件的"大小 + 修改时间"是否一致（任一为 null → 不一致）。 */
export function sameFileStamp(
  a: FileStamp | null | undefined,
  b: FileStamp | null | undefined,
): boolean {
  if (!a || !b) return false;
  // mtime 取整到毫秒再比：NTFS 对源文件会给出亚毫秒小数（实测 …377.9846），
  // 而复制落盘后会被取整成 …378 —— 不取整就会**每次都判定需要复制**，优化直接失效。
  return a.size === b.size && Math.round(a.mtimeMs) === Math.round(b.mtimeMs);
}

/**
 * 是否需要把权威库复制成运行时副本。
 * @returns false = 跳过（两边大小与时间一致，现有副本已经是权威库的副本）；
 *          true  = 需要复制（副本缺失、权威库更新过、或权威库尺寸变了）。
 */
export function shouldSyncDatabase(source: FileStamp | null, target: FileStamp | null): boolean {
  // 没有权威库：不复制（沿用现有副本；首次运行会在别处建空库）。
  if (!source) return false;
  return !sameFileStamp(source, target);
}
