// 球面均匀分布算法。
// 游戏要铺到 3D 星球表面，最简单的是一个一个平均分布。但用经纬度网格会有
// "两极密集、赤道稀疏"的问题，看起来不均匀。这里用 Fibonacci 球面分布，
// 能让所有点大致均匀地铺满球面，视觉效果更自然。

export interface SpherePoint {
  x: number;
  y: number;
  z: number;
}

/** 把 count 个点均匀铺满整个球面（半径为 radius）。 */
export function fibonacciSphere(count: number, radius: number): SpherePoint[] {
  return fibonacciSphereInBand(count, radius, 0, Math.PI);
}

/**
 * 把 count 个点均匀分布在纬度带 [minLat, maxLat] 内。
 * minLat/maxLat 是弧度，y 轴是南北极方向。实际用在分区带时，只把该分区的
 * 游戏铺到它自己的那一段纬度带上。
 */
export function fibonacciSphereInBand(
  count: number,
  radius: number,
  minLat: number,
  maxLat: number,
): SpherePoint[] {
  const out: SpherePoint[] = [];
  if (count <= 0) return out;
  const golden = Math.PI * (3 - Math.sqrt(5)); // 黄金角，Fibonacci 分布的核心
  const latSpan = maxLat - minLat;
  for (let i = 0; i < count; i++) {
    // 用黄金角把经度错开，纬度在带内均匀铺开，这样点才均匀。
    const t = count > 1 ? i / (count - 1) : 0.5;
    const lat = minLat + t * latSpan;
    const lon = i * golden;
    const cosLat = Math.cos(lat);
    out.push({
      x: radius * cosLat * Math.cos(lon),
      y: radius * Math.sin(lat),
      z: radius * cosLat * Math.sin(lon),
    });
  }
  return out;
}
