// 游戏退出后"是否备份存档"的确认弹窗。
//
// 背景：游戏进程退出时，主进程不会自动备份存档（避免游戏中存档文件被锁定导致
// 备份失败、也避免每次退出都生成 exe 垃圾文件），而是推送一个 game_exited 事件。
// 本组件监听该事件，弹出一个对话框问用户"是否备份《游戏》的存档？"，
// 用户选"是"才调用 backup_game_save（生成自解压 exe 到桌面），选"否"则什么都不做。
//
// 设计（成熟方案）：参考 Windows 常见"游戏关闭后是否保存"确认弹窗——
//   用模态对话框 + 明确的是/否按钮，不阻塞主流程，用户可随时关闭。

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { api } from "../api/client";
import { useI18n } from "../i18n";

interface PendingGame {
  gameId: string;
  gameName: string;
}

export default function GameExitBackupPrompt() {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingGame | null>(null);
  const [busy, setBusy] = useState(false);

  // 监听主进程推送的 "game_exited" 事件（仅桌面端有 window.ipc.on）。
  useEffect(() => {
    if (!window.ipc?.on) return;
    const unsubscribe = window.ipc.on("game_exited", (raw: unknown) => {
      const payload = raw as { gameId?: string; gameName?: string };
      if (!payload?.gameId) return;
      setPending({ gameId: payload.gameId, gameName: payload.gameName || "" });
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleBackup = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await api.backupGameSave(pending.gameId);
      if (res?.ok) {
        void api.showNotification(
          t("backup_success_title"),
          t("backup_success_body", { name: pending.gameName })
        );
      } else {
        void api.showNotification(
          t("backup_failed_title"),
          res?.error || t("backup_failed_body", { name: pending.gameName })
        );
      }
    } catch (e) {
      void api.showNotification(t("backup_failed_title"), String(e));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <Dialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("backup_confirm_title")}</DialogTitle>
          <DialogDescription>
            {t("backup_confirm_body", { name: pending?.gameName || "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
            {t("backup_no")}
          </Button>
          <Button onClick={() => void handleBackup()} disabled={busy}>
            {t("backup_yes")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
