// 在恐怖谷里随机散布一些树，避开道路和山洞，让地图看起来生机勃勃。

import type { ValleyRoads } from "./valleyRoads";

export interface TreeSpot {
  x: number;
  z: number;
  /** 树的随机缩放（0.7~1.3），让树有高矮变化。 */
  scale: number;
}

interface Options {
  /** 树的数量。 */
  count: number;
  /** 地图半边长。 */
  half: number;
  roads?: ValleyRoads;
  /** 需要避开的点（如山洞），附近一定距离内不种树。 */
  avoidPoints?: { x: number; z: number; radius: number }[];
}

// 用固定种子的伪随机，保证每次进入恐怖谷都是同一片森林。
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在地图范围内随机撒 N 棵树，避开道路和避让点。 */
export function generateValleyTrees(opts: Options): TreeSpot[] {
  const { count, half, roads, avoidPoints = [] } = opts;
  const rand = mulberry32(7);
  const trees: TreeSpot[] = [];
  // 限定放置范围：地图内缩一圈，避免贴边
  const margin = 4;
  let attempts = 0;
  while (trees.length < count && attempts < count * 20) {
    attempts++;
    const x = (rand() * 2 - 1) * (half - margin);
    const z = (rand() * 2 - 1) * (half - margin);
    // 距离边缘山脉太近就别种（避免树长在山顶）
    const r = Math.hypot(x, z) / half;
    if (r > 0.8) continue;
    // 避开道路
    if (roads) {
      let onRoad = false;
      for (const p of roads.points) {
        if (Math.hypot(x - p.x, z - p.z) < roads.halfWidth + 2) { onRoad = true; break; }
      }
      if (onRoad) continue;
    }
    // 避开避让点
    let tooClose = false;
    for (const a of avoidPoints) {
      if (Math.hypot(x - a.x, z - a.z) < a.radius) { tooClose = true; break; }
    }
    if (tooClose) continue;
    trees.push({ x, z, scale: 0.7 + rand() * 0.6 });
  }
  return trees;
}