// General settings section.

import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n, type LanguageCode } from "../../i18n";

export default function GeneralSection() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const { t } = useI18n();

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
        <select
          className="w-full rounded-md border border-border bg-input px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          value={settings.startupBehavior}
          onChange={(e) => save({ startupBehavior: e.target.value })}
        >
          <option value="StartNormal">{t("settings_startNormal", { defaultValue: "正常启动" })}</option>
          <option value="StartMaximized">{t("settings_startMaximized", { defaultValue: "最大化启动" })}</option>
          <option value="StartMinimized">{t("settings_startMinimized", { defaultValue: "最小化启动" })}</option>
          <option value="StartMinimizedTray">{t("settings_startMinimizedTray", { defaultValue: "最小化到托盘启动" })}</option>
        </select>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <input
          type="checkbox"
          id="tray"
          checked={settings.enableTray}
          onChange={(e) => save({ enableTray: e.target.checked })}
        />
        <label htmlFor="tray">{t("settings_enableTray")}</label>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <input
          type="checkbox"
          id="closeToTray"
          checked={settings.closeToTray}
          onChange={(e) => save({ closeToTray: e.target.checked })}
        />
        <label htmlFor="closeToTray">{t("settings_closeToTray")}</label>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <input
          type="checkbox"
          id="minimizeToTray"
          checked={settings.minimizeToTray}
          onChange={(e) => save({ minimizeToTray: e.target.checked })}
        />
        <label htmlFor="minimizeToTray">{t("settings_minimizeToTray")}</label>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">{t("settings_language")}</label>
        <select
          className="w-full rounded-md border border-border bg-input px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          value={settings.language}
          onChange={(e) => save({ language: e.target.value })}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <input
          type="checkbox"
          id="autoBackup"
          checked={settings.autoBackupEnabled}
          onChange={(e) => save({ autoBackupEnabled: e.target.checked })}
        />
        <label htmlFor="autoBackup">{t("settings_autoBackup")}</label>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <input
          type="checkbox"
          id="trackPlaytime"
          checked={settings.trackPlaytime}
          onChange={(e) => save({ trackPlaytime: e.target.checked })}
        />
        <label htmlFor="trackPlaytime">{t("settings_trackPlaytime", { defaultValue: "启用游戏时间追踪" })}</label>
      </div>
    </div>
  );
}
