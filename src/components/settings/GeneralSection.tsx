// General settings section.

import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n, type LanguageCode } from "../../i18n";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export default function GeneralSection() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const { t } = useI18n();
  // 详情页目录输入框的本地暂存值：初始用当前设置（可能为空 = 默认）。
  const [detailsDir, setDetailsDir] = useState(settings.gameDetailsDir ?? "");

  const LANGUAGES: { code: LanguageCode; label: string }[] = [
    { code: "en-US", label: t("settings_langEnglish") },
    { code: "zh-CN", label: t("settings_langSimplified") },
    { code: "zh-TW", label: t("settings_langTraditional") },
  ];

  return (
    <div>
      <h3 className="mb-3.5">{t("settings_general_header")}</h3>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">{t("settings_startupBehavior")}</label>
        <Select value={settings.startupBehavior} onValueChange={(v) => save({ startupBehavior: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="StartNormal">{t("settings_startNormal", { defaultValue: "正常启动" })}</SelectItem>
            <SelectItem value="StartMaximized">{t("settings_startMaximized", { defaultValue: "最大化启动" })}</SelectItem>
            <SelectItem value="StartMinimized">{t("settings_startMinimized", { defaultValue: "最小化启动" })}</SelectItem>
            <SelectItem value="StartMinimizedTray">{t("settings_startMinimizedTray", { defaultValue: "最小化到托盘启动" })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <Checkbox
          id="tray"
          checked={settings.enableTray}
          onCheckedChange={(v) => save({ enableTray: v === true })}
        />
        <label htmlFor="tray">{t("settings_enableTray")}</label>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <Checkbox
          id="closeToTray"
          checked={settings.closeToTray}
          onCheckedChange={(v) => save({ closeToTray: v === true })}
        />
        <label htmlFor="closeToTray">{t("settings_closeToTray")}</label>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <Checkbox
          id="minimizeToTray"
          checked={settings.minimizeToTray}
          onCheckedChange={(v) => save({ minimizeToTray: v === true })}
        />
        <label htmlFor="minimizeToTray">{t("settings_minimizeToTray")}</label>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">{t("settings_language")}</label>
        <Select value={settings.language} onValueChange={(v) => save({ language: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <Checkbox
          id="autoBackup"
          checked={settings.autoBackupEnabled}
          onCheckedChange={(v) => save({ autoBackupEnabled: v === true })}
        />
        <label htmlFor="autoBackup">{t("settings_autoBackup")}</label>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <Checkbox
          id="trackPlaytime"
          checked={settings.trackPlaytime}
          onCheckedChange={(v) => save({ trackPlaytime: v === true })}
        />
        <label htmlFor="trackPlaytime">{t("settings_trackPlaytime", { defaultValue: "启用游戏时间追踪" })}</label>
      </div>

      {/* 游戏静态详情页目录：留空用默认 <数据根>/Game_Details，可改到其它绝对路径。
          HTML 和视频都由内置 HTTP 服务器托管该目录。 */}
      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">
          {t("settings_gameDetailsDir", { defaultValue: "游戏详情页目录（留空用默认 Game_Details）" })}
        </label>
        <input
          type="text"
          className="w-full rounded-md border border-border bg-input px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          placeholder={t("settings_gameDetailsDirPlaceholder", { defaultValue: "如 D:\\Game_Details" })}
          value={detailsDir}
          onChange={(e) => setDetailsDir(e.target.value)}
        />
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            className="rounded-md border border-border bg-input px-3 py-1.5 text-[12px] text-secondary-text outline-none hover:bg-item-hover"
            onClick={() => {
              save({ gameDetailsDir: detailsDir.trim() || undefined });
            }}
          >
            {t("settings_saveDir", { defaultValue: "应用目录" })}
          </button>
          <button
            type="button"
            className="rounded-md border border-border bg-input px-3 py-1.5 text-[12px] text-secondary-text outline-none hover:bg-item-hover"
            onClick={() => {
              setDetailsDir("");
              save({ gameDetailsDir: undefined });
            }}
          >
            {t("settings_useDefaultDir", { defaultValue: "恢复默认" })}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-dim">
          {t("settings_gameDetailsDirHint", {
            defaultValue: "修改后需重启应用生效（详情页服务器启动时读取该目录）。",
          })}
        </p>
      </div>
    </div>
  );
}
