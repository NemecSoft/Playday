// 3D 星球本体：一个带纹理的球体，会缓慢自转。
// 用 useFrame 每帧更新 rotateY，看起来星球自己在转，更生动。
// 表面纹理用程序生成（无外部图片），用一张渐变 Canvas 当 texture，省去资源。

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  radius: number;
  /** 每帧自转的弧度增量。 */
  spinSpeed?: number;
}

export default function PlanetMesh({ radius, spinSpeed = 0.0015 }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);

  // 程序生成一张"星球表面"贴图：深色底 + 一些随机色块，模拟陆地/海洋，
  // 不用外部图片资源，加载零成本。
  const texture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    // 底色（海洋）
    ctx.fillStyle = "#1b2a4a";
    ctx.fillRect(0, 0, size, size);
    // 随机画一些圆点当"大陆"，颜色偏蓝绿，接近主题色但不硬编码单色。
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 8 + Math.random() * 30;
      const hue = 200 + Math.random() * 40; // 偏蓝绿
      ctx.fillStyle = `hsla(${hue}, 45%, 40%, 0.6)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  // 每帧让星球绕 y 轴缓慢旋转。
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += spinSpeed;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial map={texture} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}
