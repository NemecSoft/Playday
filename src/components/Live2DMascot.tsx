// Live2D 看板娘组件（集成自 stevenjoezhang/live2d-widget 的 initWidget）。
// 用途：公告窗口右下角放一个会眨眼的 Live2D 模型，每次启动随机换一个角色。
//
// 实现要点：
//   1. waifu-tips.js 是 ESM，内部 import("./chunk/index.js")（相对路径），
//      所以把它和 chunk 都放在 public/live2d/ 下，用 <script type="module"> 加载，
//      加载后 window.initWidget 就可用。
//   2. 本地模型模式：传 waifuPath 指向我们的 waifu-tips.json（其 models 数组
//      指向 public/live2d/models/ 下的 6 个角色），传 cubism2Path 指向 Cubism 2 Core。
//   3. 随机换角色：本地模式下 modelId 默认从 localStorage 读（存的是上次的），
//      首次为 NaN 时用 config.modelId。我们每次启动都显式传一个随机 modelId，
//      保证"每次随机打开一种"。
//   4. 无工具栏：tools: [] 不生成工具栏按钮。
import { useEffect, useRef } from "react";

// 可随机切换的角色数量（对应 waifu-tips.json 的 models 数组长度）
const MODEL_COUNT = 6;

// 声明 window 上由 waifu-tips.js 提供的全局函数
declare global {
  interface Window {
    initWidget?: (config: Record<string, unknown>) => void;
  }
}

export default function Live2DMascot() {
  const loadedRef = useRef(false);

  useEffect(() => {
    // 防止 React StrictMode 下重复加载
    if (loadedRef.current) return;
    loadedRef.current = true;

    // 动态加载 live2d-widget 的 initWidget 脚本（ESM）。
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/live2d/waifu-tips.js";
    script.onload = () => {
      if (typeof window.initWidget !== "function") return;
      // 每次启动随机挑一个角色（0 ~ MODEL_COUNT-1）
      const randomModelId = Math.floor(Math.random() * MODEL_COUNT);
      window.initWidget({
        waifuPath: "/live2d/waifu-tips.json",
        cubism2Path: "/live2d/live2d.min.js",
        modelId: randomModelId,
        tools: [], // 不显示任何工具栏按钮
        modelTexturesId: 0,
        drag: false,
        bottom: { left: "0", bottom: "0" },
      });
    };
    script.onerror = (e) => {
      console.error("[Live2D] 加载 initWidget 脚本失败", e);
    };
    document.body.appendChild(script);

    return () => {
      // 组件卸载时清理 initWidget 注入的 DOM（#waifu / #waifu-toggle）
      document.getElementById("waifu")?.remove();
      document.getElementById("waifu-toggle")?.remove();
      script.remove();
    };
  }, []);

  // 本组件不渲染任何内容，initWidget 会自行注入 #waifu DOM。
  return null;
}
