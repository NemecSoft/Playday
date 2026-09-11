// 顶部弹幕层：模拟用户短评飘过，营造"很多人一起聊"的氛围。
// 低频、半透明、可关闭。用 framer-motion 做横向飘动动画。
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCommunityStore } from "../../utils/community/store";
import type { Danmaku } from "../../utils/community/models";

export default function DanmakuOverlay() {
  const enabled = useCommunityStore((s) => s.enabled);
  const danmaku = useCommunityStore((s) => s.danmaku);
  // 当前正在飘的弹幕（最多同时 3 条）
  const [shown, setShown] = useState<Danmaku[]>([]);

  useEffect(() => {
    if (!enabled || danmaku.length === 0) return;
    // 取最后一条新弹幕加入飘动列表，3 秒后移除
    const latest = danmaku[danmaku.length - 1];
    const id = latest.id;
    setShown((prev) => [...prev.slice(-2), latest]);
    const t = setTimeout(() => {
      setShown((prev) => prev.filter((d) => d.id !== id));
    }, 4000);
    return () => clearTimeout(t);
  }, [danmaku, enabled]);

  if (!enabled) return null;

  return (
    <div className="danmaku-overlay pointer-events-none">
      <AnimatePresence>
        {shown.map((d) => (
          <motion.div
            key={d.id}
            className="danmaku-item"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span
              className="danmaku-avatar"
              style={{ background: d.user.avatarColor }}
            />
            <span className="danmaku-nick">{d.user.nickname}：</span>
            <span className="danmaku-text">{d.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
