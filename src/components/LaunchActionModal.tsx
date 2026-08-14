// 启动方式选择弹窗：当一个游戏有多个可启动指令（比如 game.exe -dx11 / -dx12）时，
// 弹窗让用户选一个来启动。每个指令显示它的名称和参数，点击后带该指令 id 启动游戏。
// 用 framer-motion 做开合动画，磨砂玻璃 + CSS 变量，跟随主题。

import { motion, AnimatePresence } from "framer-motion";
import { Play, X, HardDrive, Folder } from "lucide-react";
import { useGamesStore } from "../stores/gamesStore";
import { useI18n } from "../i18n";

export default function LaunchActionModal() {
  const pendingLaunch = useGamesStore((s) => s.pendingLaunch);
  const setPendingLaunch = useGamesStore((s) => s.setPendingLaunch);
  const launchGame = useGamesStore((s) => s.launchGame);
  const { t } = useI18n();

  const close = () => setPendingLaunch(null);

  if (!pendingLaunch) return null;

  const { game, actions } = pendingLaunch;

  // 点某个启动项：带指令 id 启动，然后关掉弹窗。
  const pick = (actionId: string) => {
    close();
    void launchGame(game.id, actionId);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="launch-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      >
        <motion.div
          className="launch-modal"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="launch-modal-header">
            <div>
              <div className="launch-modal-title">{game.name}</div>
              <div className="launch-modal-sub">{t("launch_choose")}</div>
            </div>
            <button className="launch-modal-close" onClick={close} aria-label="关闭">
              <X size={18} />
            </button>
          </div>

          <div className="launch-action-list">
            {actions.map((a) => (
              <button
                key={a.id}
                className="launch-action-card"
                onClick={() => pick(a.id)}
              >
                <div className="launch-action-icon">
                  <Play size={18} fill="currentColor" />
                </div>
                <div className="launch-action-info">
                  <div className="launch-action-name">{a.name || a.path}</div>
                  <div className="launch-action-path">
                    <Folder size={12} />
                    <span>{a.path}</span>
                  </div>
                  {a.arguments ? (
                    <div className="launch-action-args">
                      <HardDrive size={12} />
                      <span>{a.arguments}</span>
                    </div>
                  ) : null}
                </div>
                <div className="launch-action-go">
                  <Play size={14} fill="currentColor" />
                </div>
              </button>
            ))}
          </div>

          <div className="launch-modal-footer">{t("launch_cancel_hint")}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
