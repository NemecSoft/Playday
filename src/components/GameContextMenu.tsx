// Right-click context menu for a game, mirroring Playnite's game menu.

import { useEffect, useRef } from "react";
import type { Game } from "../types/models";
import { Play, Copy } from "lucide-react";
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

  return (
    <div
      ref={ref}
      className="fixed z-[1500] min-w-[180px] rounded-md border border-border-strong bg-panel p-[5px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
      style={{ left: x, top: y }}
    >
      {item(t("menu_play"), <Play size={14} />, () => launchGame(game.id))}
      {item(t("menu_copyPath"), <Copy size={14} />, () => navigator.clipboard?.writeText(game.installDirectory || ""))}
    </div>
  );
}
