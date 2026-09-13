// 界面字体选项（下拉用）。
//
// 字体来源 = **应用自带字体目录**里实际存在的文件（主进程扫描后经 IPC 报给前端，
// 见 electron/core/fonts.ts 与 src/utils/uiFont.ts）。这里只负责"把文件列表变成选项"。
//
// ⚠️ 以前这里写死了 3 个字体名（FangZheng LiShu / ZiKuTang QingKai / HarmonyOS Sans SC），
// 指向 global.css 里的 /fonts/*.ttf —— 其中两个文件在 fonts 目录里根本不存在，
// 选中只会静默回退系统字体。现在改成扫描真实文件，丢什么进 fonts 就能选什么。

export interface FontOption {
  /** CSS font-family 值（"" = 系统默认字体，即不指定）。 */
  value: string;
  /** 有 labelKey 时用 i18n 文案，否则直接用 label（字体名）。 */
  labelKey?: string;
  label?: string;
}

/**
 * 永远存在的一项："" = 用**应用自带字体**（fonts 目录里的默认字体，通常是
 * fonts\字酷堂清楷 简.ttf）；自带字体不可用时才回退系统字体。
 * 注意别再叫它"系统默认字体" —— 空值的语义是"用自带的"，不是"用系统的"。
 */
export const SYSTEM_FONT_OPTION: FontOption = { value: "", labelKey: "fontAppDefault" };

/**
 * 字体文件列表 → 下拉选项（第一项固定是"系统默认字体"）。
 * 按 family 去重：同一款字体放多个格式（ttf + otf）时只留第一个。
 */
export function toFontOptions(files: { family: string }[]): FontOption[] {
  const seen = new Set<string>();
  const out: FontOption[] = [SYSTEM_FONT_OPTION];
  for (const f of files) {
    const family = (f.family ?? "").trim();
    if (!family || seen.has(family)) continue;
    seen.add(family);
    out.push({ value: family, label: family });
  }
  return out;
}
