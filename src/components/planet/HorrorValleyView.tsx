// 恐怖谷地图场景根：独立的 WebGL 画布，组装地形、车辆、山洞，并处理进入详情
// 和返回星球。恐怖谷的游戏都来自星球上"恐怖谷"分区。

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useNavigate } from "react-router-dom";
import HorrorValleyTerrain from "./HorrorValleyTerrain";
import HorrorValleyVehicle from "./HorrorValleyVehicle";
import HorrorValleyCaves from "./HorrorValleyCaves";
import HorrorValleyTrees from "./HorrorValleyTrees";
import { generateValleyHeightMap } from "../../utils/planet/valleyTerrain";
import { generateValleyRoads } from "../../utils/planet/valleyRoads";
import { generateValleyTrees } from "../../utils/planet/valleyTrees";
import { layoutCaves } from "../../utils/planet/valleyLayout";
import { useI18n } from "../../i18n";
import type { Game } from "../../types/models";

interface Props {
  games: Game[]; // 恐怖谷分区的游戏
  onBack: () => void;
}

export default function HorrorValleyView({ games, onBack }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  // 车辆当前位置（由 Vehicle 每帧更新），传给山洞判断触发。
  const [vehiclePos, setVehiclePos] = useState<[number, number, number]>([0, 0, 30]);

  // 先确定道路，再把道路传给高度图生成器，这样地形在道路带会自动抹平。
  // 道路、树、山洞用同一个种子稳定生成，所以每次进入恐怖谷都是同一张地图。
  const roads = useMemo(() => generateValleyRoads(100, 3), []);
  // 高度图：地形和车辆共用同一份，道路带已经压平，物理车辆能平稳开。
  const heightMap = useMemo(() => generateValleyHeightMap(128, 100, roads), [roads]);
  // 山洞布局：每个游戏一个山洞。
  const caves = useMemo(() => layoutCaves(games), [games]);
  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  // 沿道路两侧散布一些树，避开道路和山洞。
  const trees = useMemo(
    () =>
      generateValleyTrees({
        count: 120,
        half: 100,
        roads,
        avoidPoints: caves.map((c) => ({ x: c.x, z: c.z, radius: 4 })),
      }),
    [roads, caves],
  );

  const enterCave = (game: Game) => navigate(`/game/${game.id}`);

  if (games.length === 0) {
    return <div className="planet-fallback">{t("valley_empty")}</div>;
  }

  return (
    <div className="planet-container">
      {/* shadows 开启阴影（柔和），配合方向光让低多边形每个面有明暗对比 */}
      <Canvas
        shadows
        camera={{ position: [0, 20, 40], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        {/* 天空背景 + 雾（暖白，远处渐变消失），参考"低多边形森林公园" */}
        <color attach="background" args={["#dff0ff"]} />
        <fog attach="fog" args={["#eef4f8", 120, 460]} />
        {/* 太阳光：暖橙色，带阴影，是低多边形明暗对比的主角 */}
        <directionalLight
          castShadow
          color="#ffd9a0"
          intensity={2.6}
          position={[80, 90, 40]}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={260}
          shadow-camera-left={-95}
          shadow-camera-right={95}
          shadow-camera-top={95}
          shadow-camera-bottom={-95}
          shadow-bias={-0.0004}
          shadow-normalBias={0.05}
        />
        {/* 补光：冷蓝色，照亮阴影面 */}
        <directionalLight color="#b0d0ff" intensity={0.6} position={[-60, 40, -50]} />
        {/* 半球光：天空蓝 + 地面暖橙的环境漫反射 */}
        <hemisphereLight color="#b8dcff" groundColor="#ffd9b0" intensity={0.5} />
        {/* 环境光：暖米色兜底 */}
        <ambientLight color="#ffe8d0" intensity={0.4} />

        <HorrorValleyTerrain heightMap={heightMap} />
        <HorrorValleyTrees trees={trees} heightMap={heightMap} />
        <HorrorValleyVehicle heightMap={heightMap} onPosition={setVehiclePos} />
        <HorrorValleyCaves
          caves={caves}
          gamesById={gamesById}
          heightMap={heightMap}
          vehiclePos={vehiclePos}
          onEnter={enterCave}
        />
      </Canvas>
      {/* 返回星球按钮 */}
      <button className="valley-back-btn" onClick={onBack}>
        {t("valley_back")}
      </button>
      {/* 底部驾驶提示 */}
      <div className="valley-hint">{t("valley_drive_hint")}</div>
    </div>
  );
}
