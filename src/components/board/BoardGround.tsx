// 棋盘：底座 + 描金边 + 木纹盘面 + 楚河流动水面 + "楚河漢界"书法字。
// 完全移植自《中国象棋 3D》的棋盘，尺寸沿用 CELL=2、9列×10行。
// 棋盘格点坐标：gx=(c-4)*2，gz=(r-4.5)*2（c=0..8，r=0..9）。
// 盘面用 CanvasTexture 程序化画出木纹 + 格线 + 九宫斜线，不依赖外部图片。

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// 常量（与象棋 3D 一致）
const ROWS = 10;
const COLS = 9;
const BOARD_TOP_Y = 1.0; // 棋盘表面高度

// 程序化画木纹盘面（含格线、九宫斜线、楚河留白）。返回 CanvasTexture。
function makeBoardTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 1152;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const cell = 112;
  const mx = 56;
  const my = 72;
  const px = (c: number) => mx + c * cell;
  const py = (r: number) => my + r * cell;

  // 木纹底：斜向渐变 + 随机木纹条
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#c89a5e");
  grad.addColorStop(0.5, "#d9ac6d");
  grad.addColorStop(1, "#bd8f52");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = i % 2 ? "#7a5322" : "#f5d9a8";
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y0 = Math.random() * H;
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(W * 0.3, y0 + 20 - Math.random() * 40, W * 0.7, y0 + 20 - Math.random() * 40, W, y0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 格线
  ctx.strokeStyle = "#4a2c10";
  ctx.lineWidth = 4;
  ctx.lineCap = "square";
  for (let r = 0; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(px(0), py(r));
    ctx.lineTo(px(8), py(r));
    ctx.stroke();
  }
  for (let c = 0; c < COLS; c++) {
    ctx.beginPath();
    if (c === 0 || c === 8) {
      ctx.moveTo(px(c), py(0));
      ctx.lineTo(px(c), py(9));
    } else {
      ctx.moveTo(px(c), py(0));
      ctx.lineTo(px(c), py(4));
      ctx.moveTo(px(c), py(5));
      ctx.lineTo(px(c), py(9));
    }
    ctx.stroke();
  }
  // 外框加粗
  ctx.lineWidth = 8;
  ctx.strokeRect(px(0), py(0), cell * 8, cell * 9);
  // 九宫斜线（炮位九宫）
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(px(3), py(0)); ctx.lineTo(px(5), py(2));
  ctx.moveTo(px(5), py(0)); ctx.lineTo(px(3), py(2));
  ctx.moveTo(px(3), py(7)); ctx.lineTo(px(5), py(9));
  ctx.moveTo(px(5), py(7)); ctx.lineTo(px(3), py(9));
  ctx.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 画"楚河 / 漢界"书法字贴图。返回 CanvasTexture。
function makeRiverWordTexture(text: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 160;
  const ctx = cv.getContext("2d")!;
  ctx.font = "bold 118px KaiTi, STKaiti, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,20,30,.85)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#0d2a38";
  ctx.strokeText(text, 256, 84);
  ctx.fillStyle = "#f2ecd8";
  ctx.fillText(text, 256, 84);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export default function BoardGround() {
  // 盘面贴图（程序生成，仅一次）
  const [boardTexture, setBoardTexture] = useState<THREE.CanvasTexture | null>(null);
  const createdRef = useRef(false);
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    const tex = makeBoardTexture();
    setBoardTexture(tex);
    return () => tex.dispose();
  }, []);

  // 楚河流水 shader 材质 + 时间 uniform
  const riverMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          vec3 deep = vec3(0.10, 0.32, 0.45);
          vec3 shallow = vec3(0.28, 0.58, 0.70);
          // 双层流动波纹（主流向 +x，叠加横向扰动）
          float w1 = sin(vUv.x*26.0 + uTime*2.4 + sin(vUv.y*9.0 + uTime*1.4)*1.8);
          float w2 = sin(vUv.x*15.0 - uTime*1.7 + vUv.y*16.0);
          vec3 col = mix(deep, shallow, 0.5 + 0.28*w1 + 0.22*w2);
          // 波光碎金（细条高光顺流闪过）
          float sp = pow(max(0.0, sin(vUv.x*64.0 + uTime*3.4 + sin(vUv.y*34.0 + uTime*2.2)*3.2)), 18.0);
          col += vec3(1.0, 0.95, 0.78) * sp * 0.5;
          // 两岸白沫线
          float foamN = smoothstep(0.93, 1.0, vUv.y + 0.02*sin(vUv.x*38.0 + uTime*2.6));
          float foamS = smoothstep(0.07, 0.0, vUv.y + 0.02*sin(vUv.x*42.0 - uTime*2.2));
          col = mix(col, vec3(0.88, 0.94, 0.96), clamp(foamN + foamS, 0.0, 1.0) * 0.75);
          gl_FragColor = vec4(col, 0.82);
        }`,
    });
  }, []);

  // 每帧推进流水动画时间
  useFrame((state) => {
    riverMat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  // "楚河 / 漢界"书法字贴图
  const chuTex = useMemo(() => makeRiverWordTexture("楚 河"), []);
  const hanTex = useMemo(() => makeRiverWordTexture("漢 界"), []);
  useEffect(() => {
    return () => {
      chuTex.dispose();
      hanTex.dispose();
    };
  }, [chuTex, hanTex]);

  return (
    <group>
      {/* 底座 */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[19.5, 1, 21.5]} />
        <meshStandardMaterial color="#6e4a26" roughness={0.75} />
      </mesh>
      {/* 描金边条 */}
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <boxGeometry args={[20.1, 0.32, 22.1]} />
        <meshStandardMaterial color="#D4A017" roughness={0.35} metalness={0.7} />
      </mesh>
      {/* 盘面（木纹） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BOARD_TOP_Y + 0.001, 0]} receiveShadow>
        <planeGeometry args={[17.9, 20.2]} />
        <meshStandardMaterial map={boardTexture ?? undefined} color="#d9ac6d" roughness={0.6} />
      </mesh>
      {/* 楚河：流动水面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BOARD_TOP_Y + 0.012, 0]} material={riverMat}>
        <planeGeometry args={[16, 2]} />
      </mesh>
      {/* "楚河 / 漢界"书法字（浮在水面上） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-4, BOARD_TOP_Y + 0.03, 0]}>
        <planeGeometry args={[4.6, 1.44]} />
        <meshBasicMaterial map={chuTex} transparent depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4, BOARD_TOP_Y + 0.03, 0]}>
        <planeGeometry args={[4.6, 1.44]} />
        <meshBasicMaterial map={hanTex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
