// 把恐怖谷里的游戏，一个一个铺到山谷地图的道路两侧。
// 思路：用"从中心向外一圈一圈铺"的简化方案，让山洞围成一圈一圈的，中间留一条
// 进出的通道。这样开车沿路绕圈，就能一路看到各个游戏的山洞，彼此不挤在一起。

import type { Game } from "../../types/models";

export interface CaveSpot {
  gameId: string;
  x: number;
  z: number;
}

/** 地图半边长，洞穴限制在 ±RANGE 范围内，留出边界。 */
const RANGE = 90;
/** 相邻两个山洞之间的最小间距。 */
const SPACING = 8;

/**
 * 把给定游戏铺成一组山洞坐标。
 * 一圈放 fixedPerRing 个，越往外半径越大。超出地图范围时把半径收进来，
 * 保证所有山洞都不出界。
 */
export function layoutCaves(games: Game[]): CaveSpot[] {
  const spots: CaveSpot[] = [];
  if (games.length === 0) return spots;

  // 第一圈的半径取 20，每个山洞间距至少 SPACING，据此算一圈能放几个。
  const firstRadius = 20;
  const perRing = Math.max(4, Math.floor((2 * Math.PI * firstRadius) / SPACING));

  let ring = 0;
  let indexInRing = 0;
  for (const g of games) {
    // 半径逐圈加大，保证环与环之间有间隔。
    const radius = firstRadius + ring * SPACING * 1.5;
    const angle = (indexInRing / perRing) * Math.PI * 2;
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    // 超出地图范围就收缩半径，保证不出界。
    const maxAllowed = RANGE * 0.9;
    const r = Math.hypot(x, z);
    if (r > maxAllowed) {
      x = (x / r) * maxAllowed;
      z = (z / r) * maxAllowed;
    }
    spots.push({ gameId: g.id, x, z });

    indexInRing++;
    if (indexInRing >= perRing) {
      indexInRing = 0;
      ring++;
    }
  }
  return spots;
}
