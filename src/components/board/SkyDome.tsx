// 天空穹顶：白天蓝天白云的渐变天空（ShaderMaterial 穹顶）。
// 移植自《低多边形森林公园》的天空 shader：
//   天顶深蓝 → 中天天蓝 → 地平线白亮，加一轮明亮的太阳（强高光 + 柔光晕）。
// 做成大球倒扣在场景外，不响应雾、不写深度，永远在背景层。

import { useMemo } from "react";
import * as THREE from "three";

// 太阳方向（与场景里太阳主光源一致，让天空太阳落在同一侧）
const SUN_DIR = new THREE.Vector3(0, 1, 0).normalize();

export default function SkyDome() {
  // useMemo 在渲染期外创建材质，StrictMode 下稳定。
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color("#4a90d9") }, // 天顶：深蓝
        uMid: { value: new THREE.Color("#87CEEB") }, // 中天：天蓝
        uHorizon: { value: new THREE.Color("#fff5e5") }, // 地平线：白亮
        uSunDir: { value: SUN_DIR },
        uSunCol: { value: new THREE.Color("#ffd27a") }, // 太阳：暖黄
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunCol;
        varying vec3 vWorld;
        void main() {
          vec3 d = normalize(vWorld);
          float h = d.y;
          // 三段渐变：地平→中天→天顶
          float tLow = smoothstep(-0.06, 0.28, h);
          float tHigh = smoothstep(0.20, 0.78, h);
          vec3 c = mix(uHorizon, uMid, tLow);
          c = mix(c, uZenith, tHigh);
          // 太阳本体（高聚光）+ 柔和光晕
          float sunAmt = pow(max(dot(d, normalize(uSunDir)), 0.0), 180.0);
          float glowAmt = pow(max(dot(d, normalize(uSunDir)), 0.0), 7.0);
          c += uSunCol * sunAmt * 1.4;
          c += uSunCol * glowAmt * 0.16;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }, []);

  return <mesh material={material} geometry={new THREE.SphereGeometry(500, 48, 32)} renderOrder={-1} />;
}
