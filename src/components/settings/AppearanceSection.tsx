// Appearance settings: theme, default view images, card size/gap & cover library.

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGamesStore } from "../../stores/gamesStore";
import { api } from "../../api/client";
import { FONT_OPTIONS } from "../../utils/fonts";
import { useI18n } from "../../i18n";
import { Button } from "../ui/button";

export default function AppearanceSection() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const rescanCovers = useGamesStore((s) => s.rescanCovers);
  const { t } = useI18n();

  const [coverInfo, setCoverInfo] = useState<{ dirPath: string; dirExists: boolean; coverFiles: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getCoverDirInfo()
      .then((info) => alive && setCoverInfo(info))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleRescan = async () => {
    setScanning(true);
    setLastResult(null);
    try {
      const outcome = await rescanCovers();
      setLastResult(
        `${t("settings_coverMatched")}: ${outcome.matched} / ${outcome.considered}`
      );
      const info = await api.getCoverDirInfo();
      setCoverInfo(info);
    } catch {
      setLastResult(t("settings_coverScanError"));
    } finally {
      setScanning(false);
    }
  };

  const imageOptions = [
    { value: "Cover", label: t("settings_imageCover") },
    { value: "Background", label: t("settings_imageBackground") },
    { value: "Icon", label: t("settings_imageIcon") },
  ];

  const imageSelect = (label: string, key: "gridViewImage") => (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-xs text-secondary-text">{label}</label>
      <select
        className="w-full rounded-md border border-border bg-input px-2.5 py-2 text-[13px] outline-none focus:border-accent"
        value={settings[key]}
        onChange={(e) => save({ [key]: e.target.value } as any)}
      >
        {imageOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div>
      <h3 className="mb-3.5">{t("settings_appearance_header")}</h3>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">{t("settings_defaultImage")}</label>
        <div className="flex gap-2">
          <div className="flex-1">{imageSelect(t("settings_gridView"), "gridViewImage")}</div>
        </div>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">
          {t("settings_cardSize", { defaultValue: "卡片宽度" })}: <strong>{settings.cardWidth}px</strong>
        </label>
        <input
          type="range"
          min={120}
          max={320}
          step={10}
          value={settings.cardWidth}
          onChange={(e) => save({ cardWidth: Number(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-dim">
          <span>120</span>
          <span>320</span>
        </div>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">{t("settings_font")}</label>
        <select
          className="w-full rounded-md border border-border bg-input px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          value={settings.fontFamily}
          onChange={(e) => save({ fontFamily: e.target.value })}
          style={{ fontFamily: settings.fontFamily || undefined }}
        >
          {FONT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} style={{ fontFamily: o.value || undefined }}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        <div className="mt-1 text-[11px] text-dim">{t("settings_fontHint")}</div>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">
          {t("settings_cardGap", { defaultValue: "卡片间距" })}: <strong>{settings.cardGap}px</strong>
        </label>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={settings.cardGap}
          onChange={(e) => save({ cardGap: Number(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-dim">
          <span>0</span>
          <span>20</span>
        </div>
      </div>

      <div className="mt-[18px] rounded-xl border border-border bg-panel p-3.5">
        <div className="mb-1.5 font-bold">{t("settings_coverLibrary", { defaultValue: "封面图库" })}</div>
        <div className="mb-2.5 text-xs text-secondary-text">{t("settings_coverLibraryHint")}</div>
        {coverInfo && (
          <div
            className="mb-2.5 break-all rounded-md bg-input p-2 font-mono text-[11px] text-dim"
          >
            {coverInfo.dirPath}
            {coverInfo.dirExists ? `  (${coverInfo.coverFiles})` : `  (${t("settings_coverNoDir")})`}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={handleRescan} disabled={scanning}>
            <RefreshCw size={14} className="mr-1.5" />
            {scanning ? t("settings_coverScanning") : t("settings_coverRescan", { defaultValue: "重新扫描封面" })}
          </Button>
          {lastResult && <span className="text-xs text-accent">{lastResult}</span>}
        </div>
      </div>
    </div>
  );
}
