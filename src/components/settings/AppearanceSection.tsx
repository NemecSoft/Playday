// Appearance settings: theme, default view images, card size/gap & card text editor.

import { useSettingsStore } from "../../stores/settingsStore";
import { FONT_OPTIONS } from "../../utils/fonts";
import { useI18n } from "../../i18n";
import { Checkbox } from "../ui/checkbox";
import { Slider } from "../ui/slider";
import { ColorInput } from "../ui/color-input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

// 把 "#aabbcc" + alpha 0..1 转成 "rgba(170,187,204,0.42)"，用于背景填充预览。
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 6 种卡片文字预设：每种是一套 CardTextStyle。
 *  顺序对应用户截图（正常/描边/荧光/半透明/阴影/便利贴）。
 *  设置项里点击按钮即可切换整个 cardText，省去逐项手调。
 *  "custom" 是用户已在自定义编辑器里调好的样式（不替换，由当前 settings.cardText 决定）。 */
const CARD_TEXT_PRESETS: Array<{
  id: string;
  /** i18n key 在 settings_preset_xxx */
  i18nKey: string;
  /** 标签默认文本 */
  defaultLabel: string;
  /** 完整 CardTextStyle 参数 */
  style: {
    color: string;
    stroke: boolean; strokeColor: string; strokeWidth: number;
    glow: boolean; glowColor: string; glowBlur: number;
    shadow: boolean; shadowColor: string; shadowOffsetX: number; shadowOffsetY: number; shadowBlur: number;
    bg: boolean; bgColor: string; bgOpacity: number;
  };
}> = [
  {
    id: "normal",
    i18nKey: "settings_preset_normal",
    defaultLabel: "正常",
    style: {
      color: "#e8eaed", stroke: false, strokeColor: "#000000", strokeWidth: 0,
      glow: false, glowColor: "#ffffff", glowBlur: 0,
      shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
      bg: false, bgColor: "#000000", bgOpacity: 0,
    },
  },
  {
    id: "stroke",
    i18nKey: "settings_preset_stroke",
    defaultLabel: "描边",
    style: {
      color: "#e8eaed", stroke: true, strokeColor: "#000000", strokeWidth: 1.5,
      glow: false, glowColor: "#ffffff", glowBlur: 0,
      shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
      bg: false, bgColor: "#000000", bgOpacity: 0,
    },
  },
  {
    id: "glow",
    i18nKey: "settings_preset_glow",
    defaultLabel: "荧光",
    style: {
      color: "#ffffff", stroke: false, strokeColor: "#000000", strokeWidth: 0,
      glow: true, glowColor: "#3b82f6", glowBlur: 15,
      shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
      bg: false, bgColor: "#000000", bgOpacity: 0,
    },
  },
  {
    id: "semi",
    i18nKey: "settings_preset_semi",
    defaultLabel: "半透明",
    style: {
      color: "#e8eaed", stroke: false, strokeColor: "#000000", strokeWidth: 0,
      glow: true, glowColor: "#ff66b3", glowBlur: 10,
      shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
      bg: false, bgColor: "#000000", bgOpacity: 0,
    },
  },
  {
    id: "shadow",
    i18nKey: "settings_preset_shadow",
    defaultLabel: "阴影",
    style: {
      color: "#ffffff", stroke: false, strokeColor: "#000000", strokeWidth: 0,
      glow: false, glowColor: "#ffffff", glowBlur: 0,
      shadow: true, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 3, shadowBlur: 6,
      bg: false, bgColor: "#000000", bgOpacity: 0,
    },
  },
  {
    id: "sticky",
    i18nKey: "settings_preset_sticky",
    defaultLabel: "便利贴",
    style: {
      color: "#ffffff", stroke: false, strokeColor: "#000000", strokeWidth: 0,
      glow: false, glowColor: "#ffffff", glowBlur: 0,
      shadow: true, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 2, shadowBlur: 4,
      bg: true, bgColor: "#1f2933", bgOpacity: 0.75,
    },
  },
];

/** 一行可调属性：启用 checkbox + 颜色 + 主滑块 +（可选）偏移 X/Y 滑块。 */
function TextRow(props: {
  label: string;
  checked?: boolean;
  checkable?: boolean;
  onToggle?: (v: boolean) => void;
  color: string;
  onChangeColor: (c: string) => void;
  sliderLabel?: string;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  sliderValue?: number;
  onSliderChange?: (v: number) => void;
  offsetX?: number;
  offsetY?: number;
  onOffsetX?: (v: number) => void;
  onOffsetY?: (v: number) => void;
}) {
  const showToggle = props.checkable !== false;
  const showSlider = props.onSliderChange !== undefined;
  const showOffset = props.onOffsetX !== undefined;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/30 px-2.5 py-2">
      {showToggle && (
        <Checkbox
          checked={props.checked ?? false}
          onCheckedChange={(v) => props.onToggle?.(v === true)}
          aria-label={props.label}
        />
      )}
      <Label className="min-w-[68px] text-[12px] text-secondary-text">{props.label}</Label>
      {/* 颜色：复用封装的 ColorInput（取色器 + hex 文本一体），不在业务组件里手写 */}
      <ColorInput
        value={props.color}
        onChange={props.onChangeColor}
      />
      {showSlider && (
        <div className="flex min-w-[190px] flex-1 items-center gap-2">
          <Slider
            min={props.sliderMin ?? 0}
            max={props.sliderMax ?? 30}
            step={props.sliderStep ?? 1}
            value={[props.sliderValue ?? 0]}
            onValueChange={(v) => props.onSliderChange?.(v[0] ?? 0)}
            className="flex-1"
          />
          <span className="min-w-[72px] text-right text-[11px] text-secondary-text">
            {props.sliderLabel ?? ""}
          </span>
        </div>
      )}
      {showOffset && (
        <div className="flex w-full items-center gap-3 pl-[78px] text-[11px] text-dim">
          <span>X</span>
          <Slider
            min={-10}
            max={10}
            step={1}
            value={[props.offsetX ?? 0]}
            onValueChange={(v) => props.onOffsetX?.(v[0] ?? 0)}
            className="w-[120px]"
          />
          <span>{props.offsetX ?? 0}px</span>
          <span>Y</span>
          <Slider
            min={-10}
            max={10}
            step={1}
            value={[props.offsetY ?? 1]}
            onValueChange={(v) => props.onOffsetY?.(v[0] ?? 1)}
            className="w-[120px]"
          />
          <span>{props.offsetY ?? 1}px</span>
        </div>
      )}
    </div>
  );
}

export default function AppearanceSection() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const { t } = useI18n();

  const imageOptions = [
    { value: "Cover", label: t("settings_imageCover") },
    { value: "Background", label: t("settings_imageBackground") },
    { value: "Icon", label: t("settings_imageIcon") },
  ];

  const imageSelect = (label: string, key: "gridViewImage") => (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-xs text-secondary-text">{label}</label>
      <Select
        value={settings[key]}
        onValueChange={(v) => save({ [key]: v } as any)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {imageOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        <Slider
          min={120}
          max={320}
          step={10}
          value={[settings.cardWidth]}
          onValueChange={(v) => save({ cardWidth: v[0] ?? 180 })}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-dim">
          <span>120</span>
          <span>320</span>
        </div>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">{t("settings_font")}</label>
        <Select value={settings.fontFamily} onValueChange={(v) => save({ fontFamily: v })}>
          <SelectTrigger style={{ fontFamily: settings.fontFamily || undefined }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} style={{ fontFamily: o.value || undefined }}>
                {t(o.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-1 text-[11px] text-dim">{t("settings_fontHint")}</div>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">
          {t("settings_cardGap", { defaultValue: "卡片间距" })}: <strong>{settings.cardGap}px</strong>
        </label>
        <Slider
          min={0}
          max={20}
          step={1}
          value={[settings.cardGap]}
          onValueChange={(v) => save({ cardGap: v[0] ?? 8 })}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-dim">
          <span>0</span>
          <span>20</span>
        </div>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">
          {t("settings_cardFontSize", { defaultValue: "卡片字号" })}: <strong>{settings.cardFontSize ?? 15}px</strong>
        </label>
        <Slider
          min={12}
          max={22}
          step={1}
          value={[settings.cardFontSize ?? 15]}
          onValueChange={(v) => save({ cardFontSize: v[0] ?? 15 })}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-dim">
          <span>12</span>
          <span>22</span>
        </div>
        <div className="mt-1 text-[11px] text-dim">
          {t("settings_cardFontSizeHint", { defaultValue: "调整卡片上标题和别名的字号" })}
        </div>
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        <Checkbox
          id="card-font-bold"
          checked={!!settings.cardFontBold}
          onCheckedChange={(v) => save({ cardFontBold: v === true })}
        />
        <label htmlFor="card-font-bold" className="cursor-pointer text-[13px]">
          {t("settings_cardFontBold", { defaultValue: "卡片文字加粗" })}
        </label>
      </div>

      {/* 6 种卡片文字预设按钮（点一下切换整个 cardText）：
         正常 / 描边 / 荧光 / 半透明 / 阴影 / 便利贴。
         按钮缩略文字用对应的 CardTextStyle 实时渲染（所见即所得）。 */}
      <div className="mb-3.5">
        <label className="mb-1.5 block text-xs text-secondary-text">
          {t("settings_cardTextPreset", { defaultValue: "文字预设" })}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {CARD_TEXT_PRESETS.map((p) => {
            const s = p.style;
            const sw = s.stroke ? Math.max(0, Math.min(3, s.strokeWidth)) : 0;
            const showStroke = s.stroke && sw > 0;
            const showGlow = s.glow && s.glowBlur > 0;
            const showShadow = s.shadow && s.shadowBlur > 0;
            const showBg = s.bg && s.bgOpacity > 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => save({ cardText: s })}
                className="preset-btn flex h-12 items-center justify-center rounded-md border border-border bg-background/50 px-2 transition hover:border-border-strong"
                title={t(p.i18nKey, { defaultValue: p.defaultLabel })}
              >
                <span
                  style={{
                    display: "inline-block",
                    color: s.color,
                    WebkitTextStroke: showStroke ? `${sw}px ${s.strokeColor}` : "0 transparent",
                    paintOrder: "stroke fill",
                    textShadow: [
                      showShadow
                        ? `${s.shadowOffsetX}px ${s.shadowOffsetY}px ${s.shadowBlur}px ${s.shadowColor}`
                        : "0 0 0 transparent",
                      showGlow ? `0 0 ${s.glowBlur}px ${s.glowColor}` : "0 0 0 transparent",
                    ].join(", "),
                    backgroundColor: showBg
                      ? hexWithAlpha(s.bgColor, s.bgOpacity)
                      : "transparent",
                    borderRadius: showBg ? 4 : 0,
                    padding: showBg ? "1px 8px" : 0,
                    fontWeight: 600,
                    fontSize: "14px",
                    lineHeight: 1,
                  }}
                >
                  {t("settings_presetSample", { defaultValue: "样式" })}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 text-[11px] text-dim">
          {t("settings_cardTextPresetHint", { defaultValue: "点击下方按钮应用预设样式；下方编辑器仍可逐项微调。" })}
        </div>
      </div>

      {/* 卡片文字自定义：颜色/描边/发光/阴影/背景填充。
         用户可在下方逐项调，结果存 settings.cardText。 */}
      <div className="mt-[18px] rounded-xl border border-border bg-panel p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="font-bold">{t("settings_cardTextEditor", { defaultValue: "卡片文字样式" })}</div>
            <div className="mt-0.5 text-[11px] text-dim">
              {t("settings_cardTextEditorHint", { defaultValue: "逐项调整：颜色 / 描边 / 发光 / 阴影 / 背景填充" })}
            </div>
          </div>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-[11px] text-secondary-text hover:border-border-strong"
            onClick={() =>
              save({
                cardText: {
                  color: "#fff8e7",
                  stroke: true,
                  strokeColor: "#000000",
                  strokeWidth: 1.5,
                  glow: true,
                  glowColor: "#a040c8",
                  glowBlur: 10,
                  shadow: true,
                  shadowColor: "#000000",
                  shadowOffsetX: 0,
                  shadowOffsetY: 1,
                  shadowBlur: 2,
                  bg: false,
                  bgColor: "#000000",
                  bgOpacity: 0.5,
                },
              })
            }
          >
            {t("settings_cardTextReset", { defaultValue: "重置默认" })}
          </button>
        </div>

        {/* 实时预览卡片标题（所见即所得） */}
        <div className="mb-3 flex h-12 items-center justify-center rounded-md border border-border bg-input/50">
          <span
            style={{
              fontSize: `${settings.cardFontSize ?? 15}px`,
              fontWeight: settings.cardFontBold ? 700 : 500,
              color: settings.cardText?.color ?? "#fff8e7",
              WebkitTextStroke: `${
                settings.cardText?.stroke ? Math.max(0, Math.min(3, settings.cardText?.strokeWidth ?? 0)) : 0
              }px ${settings.cardText?.strokeColor ?? "transparent"}`,
              textShadow: [
                `${settings.cardText?.shadowOffsetX ?? 0}px ${settings.cardText?.shadowOffsetY ?? 1}px ${
                  settings.cardText?.shadowBlur ?? 0
                }px ${settings.cardText?.shadowColor ?? "transparent"}`,
                `0 0 ${settings.cardText?.glowBlur ?? 0}px ${settings.cardText?.glowColor ?? "transparent"}`,
              ].join(", "),
              backgroundColor:
                settings.cardText?.bg && (settings.cardText?.bgOpacity ?? 0) > 0
                  ? hexWithAlpha(
                      settings.cardText?.bgColor ?? "#000000",
                      settings.cardText?.bgOpacity ?? 0,
                    )
                  : "transparent",
              borderRadius: 4,
              padding: "2px 10px",
            }}
          >
            {t("settings_cardTextPreview", { defaultValue: "样式预览" })}
          </span>
        </div>

        {/* 5 个可调属性：颜色 / 描边 / 发光 / 阴影 / 背景填充 */}
        <TextRow
          label={t("settings_cardText_color", { defaultValue: "文字颜色" })}
          checked
          checkable={false}
          color={settings.cardText?.color ?? "#fff8e7"}
          onChangeColor={(c) => save({ cardText: { color: c } })}
        />
        <TextRow
          label={t("settings_cardText_stroke", { defaultValue: "描边" })}
          checked={!!settings.cardText?.stroke}
          onToggle={(v) => save({ cardText: { stroke: v } })}
          color={settings.cardText?.strokeColor ?? "#000000"}
          onChangeColor={(c) => save({ cardText: { strokeColor: c } })}
          sliderLabel={
            settings.cardText?.strokeWidth != null
              ? `${settings.cardText.strokeWidth.toFixed(1)}px`
              : "1.5px"
          }
          sliderMin={0}
          sliderMax={3}
          sliderStep={0.5}
          sliderValue={settings.cardText?.strokeWidth ?? 1.5}
          onSliderChange={(v) => save({ cardText: { strokeWidth: v } })}
        />
        <TextRow
          label={t("settings_cardText_glow", { defaultValue: "发光" })}
          checked={!!settings.cardText?.glow}
          onToggle={(v) => save({ cardText: { glow: v } })}
          color={settings.cardText?.glowColor ?? "#a040c8"}
          onChangeColor={(c) => save({ cardText: { glowColor: c } })}
          sliderLabel={
            settings.cardText?.glowBlur != null ? `${settings.cardText.glowBlur}px` : "10px"
          }
          sliderMin={0}
          sliderMax={30}
          sliderStep={1}
          sliderValue={settings.cardText?.glowBlur ?? 10}
          onSliderChange={(v) => save({ cardText: { glowBlur: v } })}
        />
        <TextRow
          label={t("settings_cardText_shadow", { defaultValue: "阴影" })}
          checked={!!settings.cardText?.shadow}
          onToggle={(v) => save({ cardText: { shadow: v } })}
          color={settings.cardText?.shadowColor ?? "#000000"}
          onChangeColor={(c) => save({ cardText: { shadowColor: c } })}
          // 阴影偏移用 X/Y 两个滑块简化：这里用"模糊"滑块当主控制。
          sliderLabel={
            settings.cardText?.shadowBlur != null
              ? `${settings.cardText.shadowBlur}px 模糊`
              : "2px 模糊"
          }
          sliderMin={0}
          sliderMax={20}
          sliderStep={1}
          sliderValue={settings.cardText?.shadowBlur ?? 2}
          onSliderChange={(v) => save({ cardText: { shadowBlur: v } })}
          // 偏移 X/Y 用一组小滑块
          offsetX={settings.cardText?.shadowOffsetX ?? 0}
          offsetY={settings.cardText?.shadowOffsetY ?? 1}
          onOffsetX={(v) => save({ cardText: { shadowOffsetX: v } })}
          onOffsetY={(v) => save({ cardText: { shadowOffsetY: v } })}
        />
        <TextRow
          label={t("settings_cardText_bg", { defaultValue: "背景填充" })}
          checked={!!settings.cardText?.bg}
          onToggle={(v) => save({ cardText: { bg: v } })}
          color={settings.cardText?.bgColor ?? "#000000"}
          onChangeColor={(c) => save({ cardText: { bgColor: c } })}
          sliderLabel={
            settings.cardText?.bgOpacity != null
              ? `${Math.round((settings.cardText.bgOpacity || 0) * 100)}%`
              : "0%"
          }
          sliderMin={0}
          sliderMax={1}
          sliderStep={0.05}
          sliderValue={settings.cardText?.bgOpacity ?? 0}
          onSliderChange={(v) => save({ cardText: { bgOpacity: v } })}
        />
      </div>
    </div>
  );
}
