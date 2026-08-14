// AboutModal — simple info dialog shown from the titlebar menu's "About" item.
// Displays the app name, version (mirrors package.json), and a short blurb.

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useI18n } from "../i18n";
import { Button } from "./ui/button";

interface Props {
  onClose: () => void;
}

export default function AboutModal({ onClose }: Props) {
  const { t } = useI18n();
  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        style={{ minWidth: 360, maxWidth: 420 }}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{t("about_title")}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>
        <div className="settings-content" style={{ padding: "20px 22px 22px" }}>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              YunGame
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                marginBottom: 12,
              }}
            >
              {t("about_version", { version: "v0.2.0" })}
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--text-secondary)",
              }}
            >
              {t("about_body")}
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <Button variant="secondary" onClick={onClose}>
              {t("about_close")}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
