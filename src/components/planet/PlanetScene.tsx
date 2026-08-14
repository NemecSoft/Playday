// 3D 星球视图的场景根节点。
// 用 @react-three/fiber 的 Canvas 开一个 WebGL 画布，挂摄像机、轨道控制、
// 灯光和星球。OrbitControls 允许拖拽旋转；无人操作时星球自己慢慢转。
// 分区带和游戏点会在 Task 8 挂进来。

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import PlanetMesh from "./PlanetMesh";
import ContinentBand from "./ContinentBand";
import type { Zone, ZoneId } from "../../utils/planet/types";

interface Props {
  zones: Zone[];
  /** WebGL 初始化失败时回调，让上层显示降级提示。 */
  onWebGLFailed?: () => void;
  /** 点击某个分区时回调（恐怖谷进入地图）。 */
  onEnterZone?: (zoneId: ZoneId) => void;
}

const RADIUS = 5;

// 每个分区一个主题色，用半透明的发光色区分，颜色取自常见游戏类型色系。
const ZONE_COLORS: Record<ZoneId, string> = {
  horror: "#8b0000",
  shooter: "#c0392b",
  racing: "#e67e22",
  rpg: "#8e44ad",
  puzzle: "#16a085",
  sports: "#2980b9",
  other: "#7f8c8d",
};

export default function PlanetScene({ zones, onWebGLFailed, onEnterZone }: Props) {
  // 把 0~π 的纬度按分区数均分，每个分区占一段，段与段之间留一点空隙，
  // 看起来像"大陆板块"。空隙用 padding 控制。
  const zonesWithBands = useMemo(() => {
    const n = zones.length || 1;
    const padding = 0.15; // 带与带之间的空隙（弧度）
    return zones.map((z, i) => {
      const rawMin = (i / n) * Math.PI;
      const rawMax = ((i + 1) / n) * Math.PI;
      return {
        ...z,
        minLat: rawMin + padding,
        maxLat: rawMax - padding,
      };
    });
  }, [zones]);

  return (
    <Canvas
      camera={{ position: [0, 3, 14], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        // 如果 WebGL 上下文拿不到，通知上层降级。
        if (!gl.getContext()) {
          onWebGLFailed?.();
        }
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 8, 8]} intensity={1} />
      <OrbitControls
        enablePan={false}
        minDistance={7}
        maxDistance={22}
        autoRotate
        autoRotateSpeed={0.6}
      />
      <PlanetMesh radius={RADIUS} />
      {zonesWithBands.map((z) => (
        <ContinentBand
          key={z.id}
          zone={z}
          radius={RADIUS}
          color={ZONE_COLORS[z.id]}
          onEnter={onEnterZone ? () => onEnterZone(z.id) : undefined}
        />
      ))}
    </Canvas>
  );
}
