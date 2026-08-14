// 恐怖谷里的山洞：每个游戏一个拱形洞口，洞口内侧贴游戏的封面图。
// 当车开到洞口附近（距离 < 阈值）时，调用 onEnter 让上层跳详情页。
// 封面只在车接近时才加载（懒加载），避免一次把所有封面都读进来。

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Game } from "../../types/models";
import type { CaveSpot } from "../../utils/planet/valleyLayout";
import type { ValleyHeightMap } from "../../utils/planet/valleyTerrain";
import { imageUrlAsync } from "../../utils/assets";

interface Props {
  caves: CaveSpot[];
  gamesById: Map<string, Game>;
  heightMap: ValleyHeightMap;
  /** 车辆当前世界位置，用于判断是否接近洞口。 */
  vehiclePos: [number, number, number];
  /** 车开进某个山洞时触发（传入该游戏）。 */
  onEnter: (game: Game) => void;
}

const ENTER_DIST = 3; // 触发进洞的距离阈值
const LOAD_DIST = 25; // 距离多近才开始加载封面

export default function HorrorValleyCaves({
  caves,
  gamesById,
  heightMap,
  vehiclePos,
  onEnter,
}: Props) {
  return (
    <group>
      {caves.map((spot) => {
        const game = gamesById.get(spot.gameId);
        if (!game) return null;
        return (
          <CaveMesh
            key={spot.gameId}
            spot={spot}
            game={game}
            heightMap={heightMap}
            vehiclePos={vehiclePos}
            onEnter={onEnter}
          />
        );
      })}
    </group>
  );
}

function CaveMesh({
  spot,
  game,
  heightMap,
  vehiclePos,
  onEnter,
}: {
  spot: CaveSpot;
  game: Game;
  heightMap: ValleyHeightMap;
  vehiclePos: [number, number, number];
  onEnter: (g: Game) => void;
}) {
  const [cover, setCover] = useState<THREE.Texture | null>(null);

  // 山洞所在位置的地形高度，让洞口贴在地面上。
  const y = useMemo(() => {
    const { size, half, heights } = heightMap;
    const cell = (half * 2) / size;
    const gx = Math.round((spot.x + half) / cell);
    const gz = Math.round((spot.z + half) / cell);
    return heights[gz * size + gx] ?? 0;
  }, [spot.x, spot.z, heightMap]);

  // 车到这个洞口的水平距离
  const dist = Math.hypot(vehiclePos[0] - spot.x, vehiclePos[2] - spot.z);
  const near = dist < LOAD_DIST;

  // 车靠近才加载封面（懒加载），复用现有 imageUrlAsync。
  useEffect(() => {
    if (!near || !game.coverImage || cover) return;
    let alive = true;
    imageUrlAsync(game.coverImage).then((url) => {
      if (alive && url) {
        setCover(new THREE.TextureLoader().load(url));
      }
    });
    return () => {
      alive = false;
    };
  }, [near, game.coverImage, cover]);

  // 车开到洞口就触发进入（去重：只在"进入范围"这个瞬间触发一次）。
  const wasIn = useRef(false);
  useEffect(() => {
    const inRange = dist < ENTER_DIST;
    if (inRange && !wasIn.current) {
      wasIn.current = true;
      onEnter(game);
    }
    if (!inRange) wasIn.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dist < ENTER_DIST]);

  return (
    <group position={[spot.x, y, spot.z]}>
      {/* 拱形门：一个低多边形半圆环，朝向洞口 */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[2, 0.6, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#3a2b25" roughness={0.9} metalness={0} flatShading />
      </mesh>
      {/* 洞口内的封面：一个半圆平面，贴游戏封面 */}
      {cover ? (
        <mesh position={[0, 0, 0.1]}>
          <circleGeometry args={[2, 12]} />
          <meshBasicMaterial map={cover} transparent side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <mesh position={[0, 0, 0.1]}>
          <circleGeometry args={[2, 12]} />
          <meshBasicMaterial color="#000" />
        </mesh>
      )}
      {/* 洞口底部封住（防止从底下看到天空） */}
      <mesh position={[0, -1.8, 0.1]}>
        <planeGeometry args={[4.2, 0.4]} />
        <meshBasicMaterial color="#1a1210" />
      </mesh>
    </group>
  );
}
