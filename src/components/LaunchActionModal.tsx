// 启动方式选择弹窗：当一个游戏有多个可启动指令（比如 game.exe -dx11 / -dx12）时，
// 弹窗让用户选一个来启动。每个指令显示它的**名称**，点击后带该指令 id 启动游戏。
// 用 framer-motion 做开合动画，磨砂玻璃 + CSS 变量，跟随主题。
//
// ⚠️ 这里只给用户看"启动方式的名字"。指令的**路径（a.path）和命令行参数（a.arguments）
//    是内部信息**，不显示（2026-09-18 用户要求：不要把执行的路径暴露给用户）。

import { motion, AnimatePresence } from "framer-motion";
import { Play, X } from "lucide-react";
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
                  {/* 没有名字时用通用的「开始游戏」兜底 —— 绝不回退成路径（那是内部信息）。 */}
                  <div className="launch-action-name">{a.name || t("grid_play")}</div>
                </div>
                <div className="launch-action-go">
                  <Play size={14} fill="currentColor" />
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
