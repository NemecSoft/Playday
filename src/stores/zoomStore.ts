// 页面缩放状态（Ctrl+滚轮缩放指示气泡）。
// pct = 当前缩放百分比（如 110）；visible 控制气泡显隐；
// 每次变更后 1.5s 无操作自动隐藏（与浏览器缩放气泡行为一致）。
import { create } from "zustand";

interface ZoomState {
  pct: number;
  visible: boolean;
  show: (pct: number) => void;
  hide: () => void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useZoomStore = create<ZoomState>((set) => {
  const show = (pct: number) => {
    set({ pct, visible: true });
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => set({ visible: false }), 1500);
  };
  return {
    pct: 100,
    visible: false,
    show,
    hide: () => {
      if (hideTimer) clearTimeout(hideTimer);
      set({ visible: false });
    },
  };
});
