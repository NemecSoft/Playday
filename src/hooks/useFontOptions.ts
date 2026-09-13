// 下拉用的"可用字体"列表：应用自带字体目录里有什么就列什么。
//
// 清单在启动时已经拉过一次（main.tsx 的 setupUiFonts），这里只是订阅它：
// 还没拉到就自己拉一次（loadUiFonts 幂等），拉到后触发重渲染。
// fonts 目录不存在时列表里只剩"系统默认字体"一项。

import { useEffect, useState } from "react";
import { loadUiFonts, uiFontsState } from "../utils/uiFont";
import type { FontOption } from "../utils/fonts";

export function useFontOptions(): FontOption[] {
  const [options, setOptions] = useState<FontOption[]>(() => uiFontsState().options);
  useEffect(() => {
    let alive = true;
    void loadUiFonts().then((s) => {
      if (alive) setOptions(s.options);
    });
    return () => {
      alive = false;
    };
  }, []);
  return options;
}
