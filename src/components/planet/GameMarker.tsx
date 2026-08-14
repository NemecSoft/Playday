// 星球上一个游戏点。
// 平时是发光的彩色小点（成本极低）。鼠标悬停时放大、加载并显示封面纹理，
// 同时把点变白强调。点击跳转到现有详情页。
// 封面不预加载：只在悬停时才 imageUrlAsync 加载，避免 1000+ 游戏一次性把
// IPC 和主线程打满。

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import type { Game } from "../../types/models";
import { imageUrlAsync } from "../../utils/assets";

interface Props {
  game: Game;
  position: [number, number, number];
  color: string;
}

export default function GameMarker({ game, position, color }: Props) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  // 封面纹理：加载完成后替换发光点，未加载时保持点。
  const [coverTex, setCoverTex] = useState<THREE.Texture | null>(null);

  // 悬停时触发封面懒加载，加载完换纹理。卸载时释放纹理，避免内存泄漏。
  useEffect(() => {
    if (!hovered || !game.coverImage) return;
    let alive = true;
    let tex: THREE.Texture | null = null;
    imageUrlAsync(game.coverImage).then((url) => {
      if (!alive || !url) return;
      // 用 TextureLoader 把 blob url 解成 three 纹理，设好缩放让封面铺满平面。
      tex = new THREE.TextureLoader().load(url, (t) => {
        if (alive) setCoverTex(t);
      });
    });
    return () => {
      alive = false;
      if (tex) tex.dispose();
    };
  }, [hovered, game.coverImage]);

  const scale = hovered ? 1.6 : 1;

  return (
    <group
      position={position}
      scale={[scale, scale, scale]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/game/${game.id}`);
      }}
    >
      {/* 悬停且封面加载好了，就显示封面平面，浮在光点上方 */}
      {hovered && coverTex ? (
        <sprite position={[0, 0.9, 0]}>
          <spriteMaterial
            map={coverTex}
            transparent
            depthTest={false}
            sizeAttenuation
          />
        </sprite>
      ) : null}
      {/* 光点本体：悬停时放大变白 */}
      <mesh>
        <sphereGeometry args={[hovered ? 0.18 : 0.12, 12, 12]} />
        <meshBasicMaterial color={hovered ? "#ffffff" : color} />
      </mesh>
    </group>
  );
}
