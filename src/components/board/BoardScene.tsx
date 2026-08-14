// 3D 棋盘视图的场景根节点——白天蓝天白云的自然光风格。
// 光照与天空移植自《低多边形森林公园》：四灯体系（太阳直射光 + 半球天光 +
// 环境光 + 冷色补光）+ 蓝天渐变穹顶，让棋盘场景整体清晰明亮。
// 游戏封面作为"棋子"平铺在棋盘 9×10 的格点上。
//
// 渲染细节：自然色调（不做 ACES 压暗）、柔和阴影、OrbitControls 带阻尼俯视。

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import SkyDome from "./SkyDome";
import BoardEnvironment from "./BoardEnvironment";
import BoardGround from "./BoardGround";
import CoverTile from "./CoverTile";
import type { Zone, ZoneId } from "../../utils/planet/types";

interface Props {
  zones: Zone[];
  onWebGLFailed?: () => void;
  onEnterZone?: (zoneId: ZoneId) => void;
}

// 象棋棋盘格点常量（与象棋 3D 一致）
const CELL = 2;
const COLS = 9;
const ROWS = 10;
const BOARD_TOP_Y = 1.0;
// 格点坐标换算（与象棋 3D 一致）
const gx = (c: number) => (c - 4) * CELL;
const gz = (r: number) => (r - 4.5) * CELL;

export default function BoardScene({ zones, onWebGLFailed, onEnterZone }: Props) {
  // 把所有分区的游戏拍平，按顺序放到棋盘格点上（9列×10行=90格）。
  const tiles = useMemo(() => {
    const flat: { game: Zone["games"][number]; zoneId: ZoneId; index: number }[] = [];
    for (const z of zones) {
      for (const g of z.games) {
        flat.push({ game: g, zoneId: z.id, index: flat.length });
      }
    }
    return flat;
  }, [zones]);

  // 每个格点的中心坐标（按行列铺，超出 90 个的暂时不显示）。
  const tilePositions = useMemo(() => {
    const pos: [number, number, number][] = [];
    for (let i = 0; i < tiles.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      pos.push([gx(col), BOARD_TOP_Y, gz(row)]);
    }
    return pos;
  }, [tiles]);

  return (
    <Canvas
      camera={{ position: [0, 26, 31], fov: 45, near: 0.1, far: 2000 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      shadows="soft"
      onCreated={({ gl }) => {
        if (!gl.getContext()) onWebGLFailed?.();
        const handleLost = (e: Event) => {
          e.preventDefault();
          onWebGLFailed?.();
        };
        gl.domElement.addEventListener("webglcontextlost", handleLost);
      }}
    >
      {/* 场景雾：轻柔的亮雾（森林公园风格），远处自然淡出 */}
      <fog attach="fog" args={["#f3efe6", 60, 220]} />
      {/* 蓝天白云天空穹顶 */}
      <SkyDome />
      {/* 自然光四灯体系（森林公园）：太阳直射光 + 半球天光 + 环境光 + 冷色补光 */}
      <directionalLight
        position={[-56.6, 77.1, 72.4]}
        intensity={9.5}
        color="#ff881a"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-95}
        shadow-camera-right={95}
        shadow-camera-top={95}
        shadow-camera-bottom={-95}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <hemisphereLight args={["#17b8fd", "#ffb98a", 0.3]} />
      <ambientLight color="#ffe8d0" intensity={0.45} />
      <directionalLight position={[50, 40, -60]} intensity={0.45} color="#b0d0ff" />
      {/* 环境与棋盘 */}
      <BoardEnvironment />
      <BoardGround />
      {/* 每个游戏一个封面，平铺在棋盘格点上 */}
      {tiles.slice(0, COLS * ROWS).map((t, i) => (
        <CoverTile
          key={t.game.id}
          game={t.game}
          zoneId={t.zoneId}
          position={tilePositions[i]}
          onEnter={onEnterZone}
        />
      ))}
      {/* 视角控制：带阻尼，俯视棋盘，禁止平移 */}
      <OrbitControls
        target={[0, 0.5, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={12}
        maxDistance={70}
        minPolarAngle={0.18}
        maxPolarAngle={1.38}
        enablePan={false}
      />
    </Canvas>
  );
}
