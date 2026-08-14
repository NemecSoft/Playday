// Settings dialog with sections mirroring Playnite's settings window.
//
// 注意：当前版本只保留三个 tab（通用 / 外观 / 主题）。"登录 / 游戏库 / 插件"
// 三个 tab 已从侧栏移除（功能未实现，UI 占位）。对应的 LoginSection /
// LibrarySection / PluginsSection 组件文件保留在仓库里以便以后启用时复用。
// 重新启用时只需：1) 在 SECTIONS 加回 3 项；2) 在 SectionId 加回 3 个值；
// 3) 在 sectionContent 加回 3 个 case；4) 重新 import 这 3 个组件。

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, Palette, Brush } from "lucide-react";
import GeneralSection from "./GeneralSection";
import AppearanceSection from "./AppearanceSection";
import ThemesSection from "./ThemesSection";
import { Button } from "../ui/button";
import { useI18n } from "../../i18n";

interface Props {
  onClose: () => void;
}

type SectionId = "general" | "appearance" | "themes";

export default function SettingsModal({ onClose }: Props) {
  const [section, setSection] = useState<SectionId>("themes");
  const { t } = useI18n();

  const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: t("settings_general"), icon: <Settings size={15} /> },
    { id: "appearance", label: t("settings_appearance"), icon: <Palette size={15} /> },
    { id: "themes", label: t("settings_themes"), icon: <Brush size={15} /> },
  ];

  const sectionContent = () => {
    switch (section) {
      case "general":
        return <GeneralSection />;
      case "appearance":
        return <AppearanceSection />;
      case "themes":
        return <ThemesSection />;
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
      <motion.div
        className="modal"
        style={{ minWidth: 720, maxWidth: 860, height: "82vh" }}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{t("settings_title")}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close settings"
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
                className={`sidebar-item ${section === s.id ? "active" : ""}`}
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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
              >
                {sectionContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
