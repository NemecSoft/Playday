// Right-click context menu for a game, mirroring Playnite's game menu.

import type { Game } from "../types/models";
import { Play, Info, DatabaseBackup } from "lucide-react";
import { useGamesStore } from "../stores/gamesStore";
import { useAuthStore } from "../stores/authStore";
import { useUIStore } from "../stores/uiStore";
import { api } from "../api/client";
import { useI18n } from "../i18n";
// 菜单外壳（定位 / 点外面关掉 / Esc / 项样式）抽到了 ui/context-menu ——
// 2026-09-15 顶栏标签也要右键菜单，两处各手写一份迟早会漂。
import { ContextMenu, ContextMenuItem } from "./ui/context-menu";

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
  // 「详情」开的是**选项卡**（2026-09-15 改版），与 GridView 的 openDetails 同一条链路。
  const openGameTab = useUIStore((s) => s.openGameTab);
  const { t } = useI18n();

  // 每一项都是"先执行、再关菜单"（外壳不替它关，见 ui/context-menu.tsx 的说明）。
  const act = (action: () => void) => () => {
    action();
    onClose();
  };

  // 打开详情选项卡：与 GridView 的 openDetails 同一条链路
  // （2026-09-15 起详情是选项卡、不是路由；标签 id 形如 `game:<id>`，id 里有什么字符都行）。
  const openDetails = () => {
    if (!game.id) return;
    openGameTab(game.id);
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
    <ContextMenu x={x} y={y} onClose={onClose}>
      {!locked && (
        <ContextMenuItem
          icon={<Play size={14} />}
          label={t("menu_play")}
          onClick={act(() => launchGame(game.id))}
        />
      )}
      {/* 详情：等价于点击游戏卡片进入详情页（替换原来的"复制路径"）。锁定态**保留** —— 看详情是允许的。 */}
      <ContextMenuItem
        icon={<Info size={14} />}
        label={t("menu_viewDetails")}
        onClick={act(openDetails)}
      />
      {/* 备份游戏存档：手动生成自解压 exe 到桌面。锁定态不显示（同"只能看详情"）。 */}
      {!locked && (
        <ContextMenuItem
          icon={<DatabaseBackup size={14} />}
          label={t("menu_backupSave")}
          onClick={act(() => void backupSave())}
        />
      )}
    </ContextMenu>
  );
}
