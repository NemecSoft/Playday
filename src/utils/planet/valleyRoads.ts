// 恐怖谷里随机蜿蜒的道路。思路：用几条控制点定义样条曲线（catmull-rom 风格），
// 然后在曲线上密集采样，每个采样点带一个法线方向用于"抹平宽度"。这样下游的
// 地形生成就能把道路带内的格点压平到道路高度，让车能平稳开。

export interface RoadPoint {
  x: number;
  z: number;
  /** 道路在该点的"宽度方向"单位向量（用于把道路抹成一定宽度）。 */
  normal: { x: number; z: number };
}

export interface ValleyRoads {
  /** 平直采样点（沿曲线）。 */
  points: RoadPoint[];
  /** 道路半宽（世界单位），左右各半宽形成一条带。 */
  halfWidth: number;
}

// 用伪随机生成几条蜿蜒道路的种子（用固定种子保证每次进入恐怖谷地图都是同一张地图）。
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

/** 把若干控制点用 catmull-rom 风格插值成密集点序列。 */
function smoothControls(controls: { x: number; z: number }[], steps: number): { x: number; z: number }[] {
  if (controls.length < 2) return controls.slice();
  // 在首尾各补一个虚拟控制点，避免边界处插值崩坏
  const pts = [
    controls[0],
    ...controls,
    controls[controls.length - 1],
  ];
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i], p1 = pts[i + 1], p2 = pts[i + 2], p3 = pts[i + 3];
    for (let t = 0; t < steps; t++) {
      const u = t / steps;
      const u2 = u * u, u3 = u2 * u;
      // Catmull-Rom 矩阵（标准形式）
      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * u +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3
      );
      const z = 0.5 * (
        (2 * p1.z) +
        (-p0.z + p2.z) * u +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3
      );
      out.push({ x, z });
    }
  }
  // 最后一个控制点
  out.push(pts[pts.length - 2]);
  return out;
}

/** 计算每个点的"法线"（即垂直于相邻两点连线的单位向量）。 */
function computeNormals(pts: { x: number; z: number }[]): { x: number; z: number }[] {
  const normals: { x: number; z: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    // 旋转 90° 得到法线
    normals.push({ x: -dz / len, z: dx / len });
  }
  return normals;
}

/**
 * 生成恐怖谷里蜿蜒的几条道路。每条从地图边缘蜿蜒进山谷内部，固定种子保证稳定。
 */
export function generateValleyRoads(half: number, count = 3): ValleyRoads {
  const rand = mulberry32(42);
  const allPoints: RoadPoint[] = [];

  for (let r = 0; r < count; r++) {
    // 从不同入口出发：边缘上随机一个方向
    const startAngle = rand() * Math.PI * 2;
    const startRadius = half - 5;
    // 控制点：从边缘螺旋进中心
    const controls: { x: number; z: number }[] = [];
    const segments = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < segments; i++) {
      // 螺旋：每段往中心靠近 + 随机抖动
      const t = i / Math.max(1, segments - 1);
      const radius = startRadius * (1 - t) + 8; // 终点在半径 8 左右
      const angle = startAngle + t * (Math.PI * 0.8 + rand() * Math.PI * 0.6);
      const jitter = 6;
      controls.push({
        x: Math.cos(angle) * radius + (rand() - 0.5) * jitter,
        z: Math.sin(angle) * radius + (rand() - 0.5) * jitter,
      });
    }
    const smoothed = smoothControls(controls, 16);
    const normals = computeNormals(smoothed);
    for (let i = 0; i < smoothed.length; i++) {
      allPoints.push({ x: smoothed[i].x, z: smoothed[i].z, normal: normals[i] });
    }
  }

  return { points: allPoints, halfWidth: 3 };
}