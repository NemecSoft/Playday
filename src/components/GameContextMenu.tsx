// Right-click context menu for a game, mirroring Playnite's game menu.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Game } from "../types/models";
import { Play, Info, DatabaseBackup } from "lucide-react";
import { useGamesStore } from "../stores/gamesStore";
import { useAuthStore } from "../stores/authStore";
import { api } from "../api/client";
import { useI18n } from "../i18n";

interface Props {
  game: Game;
  x: number;
  y: number;
  onClose: () => void;
}

export default function GameContextMenu({ game, x, y, onClose }: Props) {
  const launchGame = useGamesStore((s) => s.launchGame);
  // 等级不够（黄金版看钻石版游戏）→ 这个游戏**只能看详情**（2026-09-14 需求）：
  // 右键菜单里「开始游戏」「备份游戏存档」都不显示，只留「详情」。
  // 判据与卡片锁定态同一个 canPlay（见 docs/design/user-level-detection.md §2/§3）——
  // 注意这里只是**不给入口**；"能不能玩"的真正拦截仍在启动那条 IPC 上（改前端绕不过去）。
  const locked = useAuthStore((s) => !s.canPlay(game.gameLevel));
  const navigate = useNavigate();
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [onClose]);

  const item = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      className={`flex w-full cursor-pointer items-center gap-2 rounded px-3 py-[7px] text-left text-[13px] text-primary-text hover:bg-item-hover ${danger ? "text-danger" : ""}`}
      onClick={() => {
        onClick();
        onClose();
      }}
    >
      {icon}
      {label}
    </button>
  );

  // 跳转到详情页：与 GridView 等其它视图的 openDetails 逻辑保持一致，
  // 用 encodeURIComponent 避免 game.id 含特殊字符时路由匹配不上。
  const openDetails = () => {
    if (!game.id) return;
    navigate(`/game/${encodeURIComponent(game.id)}`);
  };

  // 手动备份存档：启动 GameSaveHelper.exe，由它生成自解压恢复包。
  // 成功不弹 Toast（工具窗口自己显示），只在"工具没能启动"时提示。
  const backupSave = async () => {
    if (!game.id) return;
    try {
      const res = await api.backupGameSave(game.id);
      if (!res?.ok) {
        void api.showNotification(
          t("backup_failed_title"),
          res?.error || t("backup_failed_body", { name: game.name })
        );
      }
    } catch (e) {
      void api.showNotification(t("backup_failed_title"), String(e));
    }
  };

  return (
    <div
      ref={ref}
      className="fixed z-[1500] min-w-[180px] rounded-md border border-border-strong bg-panel p-[5px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
      style={{ left: x, top: y }}
    >
      {!locked && item(t("menu_play"), <Play size={14} />, () => launchGame(game.id))}
      {/* 详情：等价于点击游戏卡片进入详情页（替换原来的"复制路径"）。锁定态**保留** —— 看详情是允许的。 */}
      {item(t("menu_viewDetails"), <Info size={14} />, openDetails)}
      {/* 备份游戏存档：手动生成自解压 exe 到桌面。锁定态不显示（同"只能看详情"）。 */}
      {!locked && item(t("menu_backupSave"), <DatabaseBackup size={14} />, () => void backupSave())}
    </div>
  );
}
