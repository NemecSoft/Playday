// 棋盘格点上的游戏封面方块（平铺在棋盘表面，16:9）。
// 完全移植象棋场景后，每个游戏封面作为"棋子"放在 9×10 的格点上。
// 交互：hover 轻微放大凸起，点击进游戏详情；恐怖谷分区点击进地图。

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import type { Game } from "../../types/models";
import type { ZoneId } from "../../utils/planet/types";
import { imageUrlAsync } from "../../utils/assets";

interface Props {
  game: Game;
  zoneId: ZoneId;
  position: [number, number, number];
  onEnter?: (zoneId: ZoneId) => void;
}

// 封面尺寸：适配 CELL=2 的格子，16:9 比例，略小于格子留边距
const W = 1.7;
const H = 0.96;
// 平铺在棋盘表面之上一点点，避免和盘面 z-fighting
const LIFT = 0.02;

function CoverTile({ game, zoneId, position, onEnter }: Props) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [coverTex, setCoverTex] = useState<THREE.Texture | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const coverTexRef = useRef<THREE.Texture | null>(null);

  // hover 时轻微放大 + 抬高（一次性设置，不做每帧动画，保证上千个封面不卡）
  useEffect(() => {
    if (!meshRef.current) return;
    const s = hovered ? 1.12 : 1;
    meshRef.current.scale.set(s, 1, s);
    meshRef.current.position.y = position[1] + LIFT + (hovered ? 0.12 : 0);
  }, [hovered, position]);

  // 封面同步加载：进入场景就请求贴图，卸载时 dispose 纹理
  useEffect(() => {
    if (!game.coverImage) return;
    let alive = true;
    imageUrlAsync(game.coverImage).then((url) => {
      if (!alive || !url) return;
      new THREE.TextureLoader().load(url, (t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        coverTexRef.current?.dispose();
        coverTexRef.current = t;
        setCoverTex(t);
      });
    });
    return () => {
      alive = false;
      if (coverTexRef.current) {
        coverTexRef.current.dispose();
        coverTexRef.current = null;
        setCoverTex(null);
      }
    };
  }, [game.coverImage]);

  const isHorror = zoneId === "horror";

  return (
    <group
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (isHorror) {
          onEnter?.("horror");
        } else {
          navigate(`/game/${game.id}`);
        }
      }}
    >
      {/* 封面方块：平铺在棋盘表面（绕 x 转 -90°，让正面朝上） */}
      <mesh
        ref={meshRef}
        position={[0, LIFT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          map={coverTex}
          color={coverTex ? "#ffffff" : "#2a2533"}
          side={THREE.DoubleSide}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}

export default React.memo(CoverTile);
