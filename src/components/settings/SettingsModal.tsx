// 设置窗口。
//
// 设计：
//   - 遮罩（.modal-overlay）半透明黑 + 轻微模糊，明确阻断背景交互；
//     ESC / 点遮罩 / 点右上角 × 都能关。
//   - 面板（.modal）固定尺寸，**可拖动**：按住顶部标题栏拖动即可移动，
//     位置用 translate 表达，不改变布局（拖出屏幕时会被夹回可视范围）。
//   - 左导航 + 右内容，右侧内容区独立滚动。
//
// 注意：主题不再在设置里配置——全部预设，改在主界面顶栏下拉切换（ThemeTopPicker）。
// 原"设计器"tab（DesignerSection）已移除，文件保留在仓库以便以后复用。

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, GripVertical } from "lucide-react";
import GeneralSection from "./GeneralSection";
import { Button } from "../ui/button";
import { useI18n } from "../../i18n";

interface Props {
  onClose: () => void;
}

// 设置面板：仅"通用"（将来要加 tab 时在 SECTIONS 与 sectionContent 各加一处）。
type SectionId = "general";

export default function SettingsModal({ onClose }: Props) {
  const [section, setSection] = useState<SectionId>("general");
  const { t } = useI18n();

  // ---- 拖动：按住标题栏移动面板 ----
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // 只响应左键；点在按钮上不算拖动
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button")) return;
      dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: drag.x, baseY: drag.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [drag.x, drag.y],
  );

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // 简单的边界夹取：至少让标题栏留在窗口里（不要求整块面板可见）。
    const maxX = window.innerWidth / 2 - 80;
    const maxY = window.innerHeight / 2 - 40;
    setDrag({
      x: Math.max(-maxX, Math.min(maxX, d.baseX + (e.clientX - d.startX))),
      y: Math.max(-maxY, Math.min(maxY, d.baseY + (e.clientY - d.startY))),
    });
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 遮罩上滚轮不穿透到背景内容
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      // 允许在面板内部滚动，其余（遮罩区域）一律拦掉
      if (target && target.closest(".modal")) return;
      e.preventDefault();
    };
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: t("settings_general"), icon: <Settings size={15} /> },
  ];

  const sectionContent = () => {
    switch (section) {
      case "general":
        return <GeneralSection />;
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      {/* 拖动位移放在外层普通 div：framer-motion 会接管内层 motion.div 的 transform，
          写在 motion 的 style 上会被入场动画（scale/y）覆盖，导致拖动无效。 */}
      <div
        className="modal-drag-layer"
        style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
      >
        <motion.div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={t("settings_title")}
          style={{ width: 760, height: "78vh", minWidth: 560 }}
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* 标题栏：整条可拖动 */}
        <div
          className="modal-header"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span className="modal-grip" aria-hidden="true">
            <GripVertical size={14} />
          </span>
          <h2>{t("settings_title")}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("settings_close", { defaultValue: "关闭" })}
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>

        <div className="settings-layout">
          <div className="settings-nav">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`settings-nav-item ${section === s.id ? "active" : ""}`}
                onClick={() => setSection(s.id)}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
          <div className="settings-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
              >
                {sectionContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
