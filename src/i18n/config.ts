// i18next 配置：加载 locales 下的多语言 JSON，供 useI18n 使用。
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../locales/en.json";
import zhCN from "../../locales/zh-CN.json";
import zhTW from "../../locales/zh-TW.json";

export type LanguageCode = "en-US" | "zh-CN" | "zh-TW";

const resources = {
  "en-US": { translation: en },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: "en-US",
  fallbackLng: "en-US",
  interpolation: {
    escapeValue: false, // React already escapes
  },
  // Synchronous init (no backend/detector) so translations are ready before
  // the first render.
});

// Belt-and-braces: if for any reason init hasn't run, do a sync init now.
if (!i18n.isInitialized) {
  i18n.init({
    resources,
    lng: "en-US",
    fallbackLng: "en-US",
    interpolation: { escapeValue: false },
  });
}

// Update document lang on language change.
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
export { i18n };

/** Available language codes. */
export const availableLanguages = Object.keys(resources) as LanguageCode[];
