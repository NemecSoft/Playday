// 3D 星球视图用到的类型定义。
// 星球上每个分区是一段"大陆带"，游戏铺在带内。

import type { Game } from "../../types/models";

export type ZoneId =
  | "horror"
  | "shooter"
  | "racing"
  | "rpg"
  | "puzzle"
  | "sports"
  | "other";

export interface Zone {
  id: ZoneId;
  labelKey: string; // 分区名的 i18n key，显示在星球上
  games: Game[];
  minLat: number; // 该分区覆盖的纬度带（弧度）
  maxLat: number;
}

/** 分区顺序：决定它们在球面上的上下排布，也决定匹配优先级（靠前优先）。 */
export const ZONE_ORDER: ZoneId[] = [
  "horror",
  "shooter",
  "racing",
  "rpg",
  "puzzle",
  "sports",
  "other",
];
