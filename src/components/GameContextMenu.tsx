// Right-click context menu for a game, mirroring Playnite's game menu.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Game } from "../types/models";
import { Play, Info } from "lucide-react";
import { useGamesStore } from "../stores/gamesStore";
import { useI18n } from "../i18n";

interface Props {
  game: Game;
  x: number;
  y: number;
  onClose: () => void;
}

export default function GameContextMenu({ game, x, y, onClose }: Props) {
  const launchGame = useGamesStore((s) => s.launchGame);
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

  return (
    <div
      ref={ref}
      className="fixed z-[1500] min-w-[180px] rounded-md border border-border-strong bg-panel p-[5px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
      style={{ left: x, top: y }}
    >
      {item(t("menu_play"), <Play size={14} />, () => launchGame(game.id))}
      {/* 详情：等价于点击游戏卡片进入详情页（替换原来的"复制路径"）。 */}
      {item(t("menu_viewDetails"), <Info size={14} />, openDetails)}
    </div>
  );
}
