// 缩放指示气泡（仿浏览器 Ctrl+滚轮缩放提示）：
//   Ctrl+滚轮 → 右上角浮现「110%  −  +  重置」，1.5s 无操作自动隐藏。
//   − / + 按钮可继续调整；重置 = 100%。
// 缩放本体在主进程（zoom_page → webContents.setZoomLevel，Chromium 原生整页缩放）。
// 浏览器（web 端）里 Ctrl+滚轮由浏览器原生接管，此组件不工作也不拦截。
import { useEffect } from "react";
import { invoke, isDesktop } from "../api/ipc";
import { useZoomStore } from "../stores/zoomStore";

const ZOOM_STEP = 0.5; // zoomLevel 一档（≈浏览器一档）

function applyZoom(deltaOrLevel: { delta: number } | { level: number }) {
  void invoke<number>("zoom_page", deltaOrLevel).then((lv) => {
    if (typeof lv === "number") {
      // zoomLevel = ln(zoomFactor)，换算成百分比显示。
      useZoomStore.getState().show(Math.round(Math.exp(lv) * 100));
    }
  });
}

export default function ZoomIndicator() {
  const pct = useZoomStore((s) => s.pct);
  const visible = useZoomStore((s) => s.visible);
  const show = useZoomStore((s) => s.show);

  // 全局监听 Ctrl+滚轮（任何页面都缩放，和浏览器一致）。
  useEffect(() => {
    if (!isDesktop()) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      applyZoom({ delta: e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP });
    };
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  if (!isDesktop() || !visible) return null;

  return (
    <div className="zoom-indicator">
      <span className="zoom-pct">{pct}%</span>
      <button
        className="zoom-btn"
        title="缩小"
        onClick={() => applyZoom({ delta: -ZOOM_STEP })}
      >
        −
      </button>
      <button
        className="zoom-btn"
        title="放大"
        onClick={() => applyZoom({ delta: ZOOM_STEP })}
      >
        +
      </button>
      <button className="zoom-reset" title="重置为 100%" onClick={() => applyZoom({ level: 0 })}>
        重置
      </button>
    </div>
  );
}
