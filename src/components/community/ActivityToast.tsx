// 活动流 toast：右下角低频弹出"xx 正在玩《xx》"等动态，营造社区活跃感。
// 每条显示 4 秒后自动消失。可关闭。
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCommunityStore } from "../../utils/community/store";
import type { CommunityActivity } from "../../utils/community/models";

function actText(a: CommunityActivity): string {
  switch (a.type) {
    case "start":
      return `正在玩《${a.game}》`;
    case "finish":
      return `通关了《${a.game}》`;
    case "like":
      return `收藏了《${a.game}》`;
    case "comment":
      return a.text || "发表了一条评论";
    case "online":
      return "上线了";
    default:
      return "有新动态";
  }
}

export default function ActivityToast() {
  const enabled = useCommunityStore((s) => s.enabled);
  const activities = useCommunityStore((s) => s.activities);
  const [shown, setShown] = useState<CommunityActivity | null>(null);

  useEffect(() => {
    if (!enabled || activities.length === 0) return;
    const latest = activities[activities.length - 1];
    const id = latest.id;
    setShown(latest);
    const t = setTimeout(() => {
      setShown((cur) => (cur?.id === id ? null : cur));
    }, 4000);
    return () => clearTimeout(t);
  }, [activities, enabled]);

  if (!enabled) return null;

  return (
    <div className="activity-toast pointer-events-none">
      <AnimatePresence>
        {shown && (
          <motion.div
            key={shown.id}
            className="activity-toast-item"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
          >
            <span
              className="activity-toast-avatar"
              style={{ background: shown.user.avatarColor }}
            />
            <div className="activity-toast-body">
              <span className="activity-toast-nick">{shown.user.nickname}</span>
              <span className="activity-toast-text">{actText(shown)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
