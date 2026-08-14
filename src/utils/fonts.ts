// User-selectable UI fonts. The font-family values correspond to the
// @font-face rules in global.css (bundled under /fonts/*).

export interface FontOption {
  /** CSS font-family value ("" = use the theme default). */
  value: string;
  /** i18n key for the label. */
  labelKey: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { value: "", labelKey: "fontDefault" },
  { value: "FangZheng LiShu", labelKey: "fontFangZhengLiShu" },
  { value: "ZiKuTang QingKai", labelKey: "fontZiKuTangQingKai" },
  { value: "HarmonyOS Sans SC", labelKey: "fontHarmonyOS" },
];
