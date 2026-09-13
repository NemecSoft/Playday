// Bottom status bar: shows the local IP, the public (external) IP, and the
// cafe name matched from the public IP via the YunGame user list
// (settings.yunGameUserListPath —— 与等级判定同源，见 electron/ipc/auth.ts)。

import { useEffect, useState } from "react";
import { Network, Globe, MapPin } from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import TipsBar from "./TipsBar";
import MusicPlayer from "./MusicPlayer";

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
    </div>
  );
}
