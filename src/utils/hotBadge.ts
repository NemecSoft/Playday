// 卡片「火爆」角标的判定（右上角火苗，见 GridView 的 .hot-flag 与 global.css）。
//
// 规则：社区评分（games.community_score）**大于**阈值 = 火爆。
//
// 阈值的来龙去脉（别照着注释猜数据）：
//   · community_score 是**人工填**的字段（本机库里 1285 个游戏只有 1 个有值：
//     「帝国时代1：决定版」89 分，其余全是 NULL）。填写的入口是整库 JSON：
//     dev-data/library-json/games.json 里那一行的 community_score 列 → 再 npm run db:import -- --apply
//     （或双击 libraryjson-importto-librarydb.bat）回写进库（见 docs/design/library-json.md）。
//   · 所以这个阈值只是**约定值**，想改就改这一个常量 —— 桌面端与网站端共用本文件，
//     改完全网生效，不存在第二个地方要同步。
export const HOT_SCORE_MIN = 100;

/**
 * 这个游戏算不算「火爆」。
 * 严格大于阈值（100 分不算，101 分才算）；没填过评分（undefined/NaN）一律不算。
 */
export function isHotGame(g: { communityScore?: number }): boolean {
  const s = g.communityScore;
  return typeof s === "number" && Number.isFinite(s) && s > HOT_SCORE_MIN;
}
