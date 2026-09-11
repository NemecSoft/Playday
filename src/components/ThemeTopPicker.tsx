// 顶栏主题下拉：全部预设配色一键切换（纯预设，无自定义）。
// 数据源 themeLibrary（含手工主题 + _gen-themes.mjs 抓取的 tweakcn 社区主题）。
// 选择即生效（applyPaletteTheme 注入 :root）并双写持久化：
//   localStorage（storeThemeId，重启即恢复）+ config.json（saveSettings）。
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { themeLibrary } from "../utils/themeLibrary";
import {
  applyPaletteTheme,
  getStoredThemeId,
  storeThemeId,
} from "../utils/themeApply";
import { useSettingsStore } from "../stores/settingsStore";

export default function ThemeTopPicker() {
  const saveSettings = useSettingsStore((s) => s.save);
  const [open, setOpen] = useState(false);
  const [themeId, setThemeId] = useState<string | null>(() => getStoredThemeId());
  const ref = useRef<HTMLDivElement>(null);

  // 当前主题（没存过时默认暗黑）。
  const current =
    themeLibrary.find((p) => p.id === themeId) ??
    themeLibrary.find((p) => p.id === "p-dark") ??
    themeLibrary[0];

  // 点击外部关闭。
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (id: string) => {
    const entry = themeLibrary.find((p) => p.id === id);
    if (!entry) return;
    applyPaletteTheme(entry.palette);
    storeThemeId(id); // 立即生效：localStorage
    void saveSettings({ themeId: id }); // 持久化：config.json（打包版 file:// 下 localStorage 不可靠）
    setThemeId(id);
    // 专属背景（渐变/流光）由 global.css 按 body[data-theme-id] / body class 分发。
    document.body.dataset.themeId = id;
    document.body.classList.toggle("theme-diamond", entry.gradientClass === "theme-diamond");
    document.body.classList.toggle("theme-reactbits", entry.gradientClass === "theme-reactbits");
    setOpen(false);
  };

  return (
    <div className="theme-top-picker" ref={ref}>
      <button
        className="theme-top-picker-btn"
        title={current.desc ? `${current.zh}｜${current.desc}` : "切换主题"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="theme-dot" style={{ background: current.palette.accent }} />
        <span className="theme-top-picker-label">{current.zh}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="theme-top-picker-list">
          {themeLibrary.map((p) => {
            const active = p.id === themeId;
            // 悬停提示：中文名 + 搭配理念（desc 由 _patch-theme-desc.mjs 维护）
            const tip = p.desc ? `${p.zh}｜${p.desc}` : p.name;
            return (
              <button
                key={p.id}
                className={`theme-top-picker-item ${active ? "active" : ""}`}
                title={tip}
                onClick={() => pick(p.id)}
              >
                <span className="theme-dot" style={{ background: p.palette.accent }} />
                <span className="theme-top-picker-item-label">{p.zh}</span>
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
