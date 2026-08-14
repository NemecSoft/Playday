// 用噪声生成恐怖谷地图的高度图。核心思路：中心区域（山谷）用低振幅噪声，起伏
// 平缓适合开车；四周边缘用高振幅噪声，形成围合的山脉。这样一眼望去就是"被山
// 围起来的一块山谷"，符合"恐怖谷"的观感。
//
// 若提供了道路数据，会把道路带内的格点高度压平到道路中心线高度（车能平稳开），
// 并通过 isRoadMask 标记这些格点让渲染涂成深灰色。

import type { ValleyRoads } from "./valleyRoads";

export interface ValleyHeightMap {
  size: number;
  half: number; // 地图半边长（世界单位）
  heights: Float32Array; // size*size，行主序
  /** size*size，1 表示该格点是道路，0 表示草地/山脉。 */
  isRoadMask: Uint8Array;
}

// 简单伪随机噪声：用正弦叠加做伪随机，够用且不引额外依赖。
function pseudoNoise(x: number, z: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** 判断一个 (x, z) 点是否在道路带内（点到道路段距离 < 半宽）。 */
function inRoadBand(px: number, pz: number, roads: ValleyRoads): { hit: boolean; height: number } {
  if (roads.points.length < 2) return { hit: false, height: 0 };
  let bestDist = Infinity;
  // 对每个道路点直接用最近邻近似（够用，密集采样后最近点距等于点到曲线的近似距离）
  for (let i = 0; i < roads.points.length; i++) {
    const p = roads.points[i];
    const d = Math.hypot(px - p.x, pz - p.z);
    if (d < bestDist) bestDist = d;
  }
  if (bestDist <= roads.halfWidth + 1.5) {
    return { hit: true, height: 0 /* 用最近道路点的高度赋值，见调用方 */ };
  }
  return { hit: false, height: 0 };
}

/** 生成 size×size 的高度图，half 是半边长（世界单位）。 */
export function generateValleyHeightMap(
  size: number,
  half: number,
  roads?: ValleyRoads,
): ValleyHeightMap {
  const heights = new Float32Array(size * size);
  const isRoadMask = new Uint8Array(size * size);
  const cell = (half * 2) / size;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const x = -half + j * cell;
      const z = -half + i * cell;
      const r = Math.hypot(x, z) / half;
      const valley = 0.6 * Math.sin(x * 0.05) * Math.cos(z * 0.05);
      const mountains = Math.max(0, r - 0.5) * 18;
      const detail = (pseudoNoise(x * 0.1, z * 0.1, 1) - 0.5) * 1.2;
      let h = valley + mountains + detail;

      let isRoad = 0;
      if (roads) {
        const info = inRoadBand(x, z, roads);
        if (info.hit) {
          isRoad = 1;
          // 找到最近的精确道路点，读取该点的原始高度
          let bestDist = Infinity;
          let bestP = roads.points[0];
          for (const p of roads.points) {
            const d = Math.hypot(x - p.x, z - p.z);
            if (d < bestDist) { bestDist = d; bestP = p; }
          }
          // 读出该道路点的"原"高度（同样用 valley + mountains + detail，去掉噪声），
          // 这样道路是平整的，但仍能跟山形贴合
          const bx = bestP.x, bz = bestP.z;
          const br = Math.hypot(bx, bz) / half;
          const bvalley = 0.6 * Math.sin(bx * 0.05) * Math.cos(bz * 0.05);
          const bmountains = Math.max(0, br - 0.5) * 18;
          // 道路两侧要有微小的高度梯度（中间高、两侧低，像有边沟），避免全平太假
          const distRatio = bestDist / (roads.halfWidth + 1.5);
          const lateralDip = distRatio * 0.4; // 离道路中心越远下沉越多
          h = bvalley + bmountains - lateralDip;
        }
      }
      heights[i * size + j] = h;
      isRoadMask[i * size + j] = isRoad;
    }
  }
  return { size, half, heights, isRoadMask };
}