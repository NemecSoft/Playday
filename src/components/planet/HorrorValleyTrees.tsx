// 恐怖谷里的低多边形松树。风格参考"低多边形森林公园"：
// 树干用深褐色圆柱，树冠用 3 层绿色锥形往上堆叠、逐层收窄，加 flatShading
// 平面着色，树冠颜色在几种柔和绿里随机。用 InstancedMesh 一次画一堆树，低开销。

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ValleyHeightMap } from "../../utils/planet/valleyTerrain";
import type { TreeSpot } from "../../utils/planet/valleyTrees";

interface Props {
  trees: TreeSpot[];
  heightMap: ValleyHeightMap;
}

// 树冠的柔和绿色色板（参考低多边形森林公园的 CANOPY）
const CANOPY = [
  0x3f8f3a, 0x4fa24a, 0x5cb85c, 0x6f9e3f, 0x86b04a, 0x3a7a3a,
];

// 松树 3 层树冠的（高度位置比例、锥底部半径、锥高）
const LAYERS = [
  { y: 2.2, radius: 1.5, height: 1.6 },
  { y: 3.3, radius: 1.1, height: 1.4 },
  { y: 4.2, radius: 0.7, height: 1.2 },
];
const TRUNK_H = 2.4;
const TRUNK_R = 0.22;

export default function HorrorValleyTrees({ trees, heightMap }: Props) {
  const { size, half, heights } = heightMap;

  // 给每棵树算好"贴地"的基准矩阵。
  const baseMatrices = useMemo(() => {
    const cell = (half * 2) / size;
    const arr: THREE.Matrix4[] = [];
    for (const t of trees) {
      const gx = Math.round((t.x + half) / cell);
      const gz = Math.round((t.z + half) / cell);
      const y = heights[gz * size + gx] ?? 0;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(t.x, y, t.z),
        new THREE.Quaternion(),
        new THREE.Vector3(t.scale, t.scale, t.scale),
      );
      arr.push(m);
    }
    return arr;
  }, [trees, size, half, heights]);

  // 树干实例化
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  // 3 层树冠各一个实例化（固定 3 个 ref，符合 Hooks 规则）
  const crownRef0 = useRef<THREE.InstancedMesh>(null);
  const crownRef1 = useRef<THREE.InstancedMesh>(null);
  const crownRef2 = useRef<THREE.InstancedMesh>(null);
  const crownRefs = [crownRef0, crownRef1, crownRef2];

  useEffect(() => {
    const n = baseMatrices.length;
    const tm = trunkRef.current;
    if (tm) {
      for (let i = 0; i < n; i++) tm.setMatrixAt(i, baseMatrices[i]);
      tm.instanceMatrix.needsUpdate = true;
    }
    crownRefs.forEach((ref, li) => {
      const cm = ref.current;
      if (!cm) return;
      for (let i = 0; i < n; i++) {
        const base = baseMatrices[i];
        const up = new THREE.Matrix4().makeTranslation(0, TRUNK_H + LAYERS[li].y, 0);
        const layer = new THREE.Matrix4().multiplyMatrices(up, base);
        cm.setMatrixAt(i, layer);
        // 树冠颜色：每棵树随机取一个绿色
        cm.setColorAt(i, new THREE.Color(CANOPY[(i * 7 + li * 3) % CANOPY.length]));
      }
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
      cm.instanceMatrix.needsUpdate = true;
    });
  }, [baseMatrices]);

  const count = baseMatrices.length;
  if (count === 0) return null;

  return (
    <group>
      {/* 树干 */}
      <instancedMesh ref={trunkRef} args={[undefined, undefined, count]} castShadow>
        <cylinderGeometry args={[TRUNK_R, TRUNK_R * 1.3, TRUNK_H, 7]} />
        <meshStandardMaterial color={0x8a5a34} roughness={0.8} metalness={0} flatShading />
      </instancedMesh>
      {/* 3 层树冠 */}
      {LAYERS.map((l, li) => (
        <instancedMesh key={li} ref={crownRefs[li]} args={[undefined, undefined, count]} castShadow>
          <coneGeometry args={[l.radius, l.height, 8]} />
          <meshStandardMaterial roughness={0.85} metalness={0} flatShading vertexColors />
        </instancedMesh>
      ))}
    </group>
  );
}