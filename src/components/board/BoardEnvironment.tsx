// 场景环境：大地、夯土圆台、环形远山、前方河流、岸边乱石。
// 白天蓝天自然光风格（参考《低多边形森林公园》）：亮丽的低多边形旷野，
// 棋盘摆在大草地上，四周是雪山、河流、乱石，整体清晰明亮。
// 不做昏黑的战场道具（火把/营帐/军旗），自然光由 BoardScene 的四灯体系提供。

import { useMemo } from "react";

// 岸边石头参数（22 块）
const ROCK_COUNT = 22;

export default function BoardEnvironment() {
  // 环形远山：28 座低多边形雪山，绕棋盘一周
  const mountains = useMemo(() => {
    const list: { x: number; z: number; h: number; r: number; rot: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2 + Math.sin(i * 7.3) * 0.1;
      const dist = 54 + Math.abs(Math.sin(i * 3.1)) * 22;
      const h = 13 + Math.abs(Math.sin(i * 5.7)) * 11;
      const r = h * (0.9 + Math.abs(Math.sin(i * 2.3)) * 0.7);
      list.push({
        x: Math.cos(ang) * dist,
        z: Math.sin(ang) * dist,
        h,
        r,
        rot: i * 1.7,
      });
    }
    return list;
  }, []);

  // 岸边乱石：22 块，环形分布
  const rocks = useMemo(() => {
    const list: { x: number; z: number; s: number; rx: number; ry: number; rz: number }[] = [];
    for (let i = 0; i < ROCK_COUNT; i++) {
      const s = 0.5 + Math.random() * 1.6;
      const ang = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 46;
      list.push({
        x: Math.cos(ang) * dist,
        z: Math.sin(ang) * dist,
        s,
        rx: Math.random() * 3,
        ry: Math.random() * 3,
        rz: Math.random() * 3,
      });
    }
    return list;
  }, []);

  return (
    <group>
      {/* 大地：整块圆形草地 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[160, 48]} />
        <meshStandardMaterial color="#6fae4f" roughness={1} />
      </mesh>
      {/* 棋盘下的夯土圆台 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[19, 40]} />
        <meshStandardMaterial color="#54422c" roughness={1} />
      </mesh>
      {/* 环形远山（主体 + 雪顶） */}
      {mountains.map((m, i) => (
        <group key={i}>
          <mesh position={[m.x, m.h / 2 - 1, m.z]} rotation={[0, m.rot, 0]} castShadow>
            <coneGeometry args={[m.r, m.h, 6]} />
            <meshStandardMaterial color="#4a6b8a" roughness={1} flatShading />
          </mesh>
          <mesh position={[m.x, m.h * 0.84 - 1, m.z]} rotation={[0, m.rot, 0]}>
            <coneGeometry args={[m.r * 0.36, m.h * 0.32, 6]} />
            <meshStandardMaterial color="#ffffff" roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
      {/* 岸边乱石 */}
      {rocks.map((r, i) => (
        <mesh
          key={i}
          position={[r.x, r.s * 0.4, r.z]}
          rotation={[r.rx, r.ry, r.rz]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[r.s, 0]} />
          <meshStandardMaterial color="#5a5f66" roughness={1} flatShading />
        </mesh>
      ))}
      {/* 前方河流：半透明水面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-52, 0.06, 30]}>
        <planeGeometry args={[70, 42]} />
        <meshStandardMaterial
          color="#4fa8c6"
          transparent
          opacity={0.85}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>
    </group>
  );
}
