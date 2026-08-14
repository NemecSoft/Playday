// 全局"正在启动游戏"醒目横幅。
//
// 用户点击"开始游戏"后，后端要执行启动前脚本、spawn 游戏进程，可能耗时几百毫秒
// 到几秒。这段时间如果没有反馈，用户会以为"点了没反应"。这个横幅在启动过程中
// 固定在屏幕顶部中央，带旋转加载图标 + 游戏名，让用户清楚看到"正在启动"。
//
// 启动完成后（成功或失败）gamesStore 会把 launchingGame 置回 null，横幅自动消失。

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Gamepad2 } from "lucide-react";
import { useGamesStore } from "../stores/gamesStore";

export default function LaunchingBanner() {
  const launchingGame = useGamesStore((s) => s.launchingGame);

  return (
    <AnimatePresence>
      {launchingGame && (
        <motion.div
          key="launching"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.2 }}
          className="launching-banner"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="launching-spinner" size={18} />
          <span className="launching-text">
            正在启动《{launchingGame.name}》…
          </span>
          <Gamepad2 size={15} className="launching-icon" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
