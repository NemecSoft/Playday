// 星球上的一个分区带：把该分区的游戏均匀铺到一段纬度高带上，带顶显示分区名。
// 用 fibonacciSphereInBand 算每个游戏的位置。分区名用 drei 的 Html 悬浮标签，
// 始终面向屏幕，方便阅读。

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { useI18n } from "../../i18n";
import { fibonacciSphereInBand } from "../../utils/planet/fibonacciSphere";
import type { Zone } from "../../utils/planet/types";
import GameMarker from "./GameMarker";

interface Props {
  zone: Zone;
  radius: number;
  color: string;
  /** 点击分区时回调（目前只恐怖谷能进入地图）。 */
  onEnter?: (zoneId: Zone["id"]) => void;
}

export default function ContinentBand({ zone, radius, color, onEnter }: Props) {
  const { t } = useI18n();

  // 每个游戏一个球面坐标，铺在本分区对应的纬度带内。半径略大于星球本体，
  // 让游戏点浮在星球表面之上一点点。
  const points = useMemo(
    () =>
      fibonacciSphereInBand(zone.games.length, radius + 0.05, zone.minLat, zone.maxLat),
    [zone.games.length, radius, zone.minLat, zone.maxLat],
  );

  // 分区名标签放在该带中间纬度的球面上方，多个分区沿 y 轴错开，互不重叠。
  const midLat = (zone.minLat + zone.maxLat) / 2;
  const labelPos: [number, number, number] = [
    0,
    (radius + 0.05) * Math.sin(midLat),
    (radius + 0.05) * Math.cos(midLat),
  ];

  return (
    <group>
      {zone.games.length > 0 && (
        <Html position={labelPos} center distanceFactor={14}>
          <div
            className={`planet-zone-label ${onEnter ? "clickable" : ""}`}
            onClick={() => onEnter?.(zone.id)}
          >
            {t(zone.labelKey)}
          </div>
        </Html>
      )}
      {zone.games.map((g, i) => (
        <GameMarker
          key={g.id}
          game={g}
          position={[points[i].x, points[i].y, points[i].z]}
          color={color}
        />
      ))}
    </group>
  );
}
