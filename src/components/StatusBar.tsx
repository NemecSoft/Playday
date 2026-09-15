// Bottom status bar: shows the local IP, the public (external) IP, and the
// cafe name matched from the public IP via the YunGame user list
// (settings.yunGameUserListPath —— 与等级判定同源，见 electron/ipc/auth.ts)。

import { useEffect, useState } from "react";
import { Network, Globe, MapPin } from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import TipsBar from "./TipsBar";
import MusicPlayer from "./MusicPlayer";
import TierBadge from "./TierBadge";

interface StatusBarData {
  localIp: string;
  publicIp: string;
  cafeName: string;
  cafeMatched: boolean;
}

export default function StatusBar() {
  const { t } = useI18n();
  const [data, setData] = useState<StatusBarData | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getStatusBar()
      .then((r) => {
        if (!alive) return;
        setData({
          localIp: r.localIp,
          publicIp: r.publicIp,
          cafeName: r.cafeName,
          cafeMatched: r.cafeMatched,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const cafe = data?.cafeMatched && data.cafeName
    ? data.cafeName
    : t("status_unknownCafe");

  return (
    <div className="flex h-[26px] shrink-0 select-none items-center gap-2.5 border-t border-border bg-sidebar px-3.5 text-[11px] text-secondary-text">
      <span className="inline-flex items-center gap-1.5 text-secondary-text">
        <Network size={13} className="text-dim" />
        <span>{data?.localIp || "—"}</span>
      </span>
      <span className="h-3 w-px bg-border-strong opacity-50" />
      <span className="inline-flex items-center gap-1.5 text-secondary-text">
        <Globe size={13} className="text-dim" />
        <span>{data?.publicIp || "—"}</span>
      </span>
      <span className="h-3 w-px bg-border-strong opacity-50" />
      <span className="inline-flex items-center gap-1.5 text-secondary-text">
        <MapPin size={13} className="text-dim" />
        <span>{cafe}</span>
      </span>
      {/* 右侧：轮播小技巧（与网络信息同一行，见 src/data/tips.json） */}
      <TipsBar />
      {/* 最右：背景音乐控件（上一首/播放暂停/下一首 + 曲名）。
          没有配置音乐目录、或目录里没有音频时它自己返回 null，不占地方。 */}
      <MusicPlayer />
      {/* 最右（背景音乐右边）：版本徽标（品牌 + 黄金版/钻石版）。
          2026-09-15 从顶栏中央挪到这里 —— 它在顶栏是"不占位置"的绝对定位，会被动态标签栏
          从底下穿过去（结构性遮挡）。状态栏这一行全是固定长度的信息，没有这个冲突。
          （没音乐时 MusicPlayer 返回 null，徽标就落在状态栏最右端。） */}
      <TierBadge />
    </div>
  );
}
