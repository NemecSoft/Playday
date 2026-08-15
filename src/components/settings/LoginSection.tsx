// Login settings: enable/disable the startup login screen and choose method.

import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n } from "../../i18n";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export default function LoginSection() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const { t } = useI18n();

  return (
    <div>
      <h3 className="mb-3.5">{t("settings_login_header")}</h3>

      <div className="mb-3.5 flex items-center gap-2">
        <Checkbox
          id="loginEnabled"
          checked={settings.loginEnabled}
          onCheckedChange={(v) => save({ loginEnabled: v === true })}
        />
        <label htmlFor="loginEnabled">{t("settings_loginEnable")}</label>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">{t("settings_loginMethod")}</label>
        <Select
          value={settings.loginType}
          onValueChange={(v) => save({ loginType: v })}
          disabled={!settings.loginEnabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wechat">{t("login_wechat")}</SelectItem>
            <SelectItem value="account">{t("login_account")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {settings.loggedIn && (
        <div className="mt-2 text-[13px] text-success">
          {t("settings_loginLoggedIn")} {settings.username ? `（${settings.username}）` : ""}
          <Button
            variant="link"
            className="ml-2 h-auto p-0 text-[13px] text-dim hover:text-secondary-text"
            onClick={() => save({ loggedIn: false })}
          >
            {t("settings_loginLogout")}
          </Button>
        </div>
      )}
    </div>
  );
}
