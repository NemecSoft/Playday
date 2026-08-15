// Library settings: database path, default filters.

import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n } from "../../i18n";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";

export default function LibrarySection() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const { t } = useI18n();

  return (
    <div>
      <h3 className="mb-3.5">{t("settings_library_header")}</h3>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">{t("settings_databaseLocation")}</label>
        <Input
          type="text"
          value={settings.databasePath || ""}
          onChange={(e) => save({ databasePath: e.target.value })}
          placeholder={t("settings_defaultLocation")}
        />
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <Checkbox
          id="installedOnly"
          checked={settings.showInstalledOnly}
          onCheckedChange={(v) => save({ showInstalledOnly: v === true })}
        />
        <label htmlFor="installedOnly">{t("settings_showInstalledOnly")}</label>
      </div>
    </div>
  );
}
