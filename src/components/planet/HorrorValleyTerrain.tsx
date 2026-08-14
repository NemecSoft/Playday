// 恐怖谷的地形：一块低多边形风格的起伏地面。中间是山谷草地，四周是山脉，
// 还有道路和河流。高度数据来自纯函数 generateValleyHeightMap。
// 低多边形风格 = flatShading 平面着色 + 较大的三角面块感 + 柔和自然配色，
// 参考"低多边形森林公园"的观感。

import { useMemo } from "react";
import * as THREE from "three";
import type { ValleyHeightMap } from "../../utils/planet/valleyTerrain";

interface Props {
  heightMap: ValleyHeightMap;
}

// 渲染用的网格细分。比物理高度图（128）粗，让低多边形的大三角面块感更明显。
const RENDER_SIZE = 48;

export default function HorrorValleyTerrain({ heightMap }: Props) {
  const { size, half, heights, isRoadMask } = heightMap;

  const geo = useMemo(() => {
    const cell = (half * 2) / RENDER_SIZE;
    const geometry = new THREE.PlaneGeometry(half * 2, half * 2, RENDER_SIZE, RENDER_SIZE);
    geometry.rotateX(-Math.PI / 2); // 平面翻到 XZ，Y 朝上
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // 从高度图（size×size）双线性采样，让渲染网格也平滑贴合物理地形
    const sample = (x: number, z: number): number => {
      const scell = (half * 2) / size;
      const fx = (x + half) / scell;
      const fz = (z + half) / scell;
      const x0 = Math.max(0, Math.min(size - 1, Math.floor(fx)));
      const z0 = Math.max(0, Math.min(size - 1, Math.floor(fz)));
      const x1 = Math.min(size - 1, x0 + 1);
      const z1 = Math.min(size - 1, z0 + 1);
      const tx = fx - x0;
      const tz = fz - z0;
      const h00 = heights[z0 * size + x0];
      const h10 = heights[z0 * size + x1];
      const h01 = heights[z1 * size + x0];
      const h11 = heights[z1 * size + x1];
      const top = h00 * (1 - tx) + h10 * tx;
      const bottom = h01 * (1 - tx) + h11 * tx;
      return top * (1 - tz) + bottom * tz;
    };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // 从高度图重采样高度（双线性），贴合物理地形
      const h = sample(x, z);
      pos.setY(i, h);
      // 上色：优先看道路蒙版，其次河流、山脉，最后草地
      const gx = Math.round((x + half) / cell);
      const gz = Math.round((z + half) / cell);
      const gi = gz * RENDER_SIZE + gx;
      const isRoad = isRoadMask[Math.min(isRoadMask.length - 1, gi)] === 1;
      const riverDist = Math.abs((x + z) / (half * 2));
      let col: [number, number, number];
      if (isRoad) {
        col = [0.45, 0.42, 0.38]; // 道路深灰
      } else if (riverDist < 0.05) {
        col = [0.35, 0.55, 0.7]; // 河流柔和蓝
      } else if (h > 6) {
        col = [0.5, 0.45, 0.42]; // 山脉灰褐
      } else {
        // 草地：几种柔和绿随机，低多边形更耐看
        const g = [0.4, 0.55, 0.35, 0.45, 0.5][(i + Math.round(x + z)) % 5];
        col = [0.2, g, 0.25];
      }
      colors[i * 3] = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, half, heights, isRoadMask]);

  return (
    <mesh geometry={geo} receiveShadow>
      {/* flatShading 是关键：让每个三角面平整，产生低多边形块面感 */}
      <meshStandardMaterial vertexColors roughness={0.9} metalness={0} flatShading />
    </mesh>
  );
}
