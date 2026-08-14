// i18n 的门面层：底层用 i18next（见 ./config.ts）。对外暴露一个 useI18n() 钩子，
// 让各组件能用一致的方式读多语言文案。刻意直接读 i18next 实例（而不是用
// react-i18next 的钩子），是为了避开 React 19 下 hook/Suspense 的一些坑。

import { useSyncExternalStore } from "react";
import { i18n, type LanguageCode } from "./config";

export type { LanguageCode };

/** Subscribe to i18next language/version changes so components re-render. */
function subscribe(cb: () => void): () => void {
  i18n.on("languageChanged", cb);
  return () => {
    i18n.off("languageChanged", cb);
  };
}

/** Returns the current language + setter and the translation function `t`. */
export function useI18n() {
  const lang = useSyncExternalStore(
    subscribe,
    () => i18n.language as LanguageCode,
    () => i18n.language as LanguageCode
  );

  return {
    lang,
    setLang: (l: LanguageCode) => {
      if (l !== i18n.language) i18n.changeLanguage(l);
    },
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? i18n.t(key, vars) : i18n.t(key),
  };
}

/** Alias for direct i18next t() when not in a component. */
export function t(key: string, vars?: Record<string, string | number>) {
  return vars ? i18n.t(key, vars) : i18n.t(key);
}

/** Applies the active language to `document.documentElement.lang` (handled by i18next config). */
export function useApplyLang(): LanguageCode {
  return useI18n().lang;
}
