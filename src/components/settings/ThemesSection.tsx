// Theme picker: a single flat list of styles and a single flat list of palettes.
// Clicking either injects its variables onto :root at runtime and persists to
// localStorage. No search, no category collapsing — just pick.

import { useState } from "react";
import {
  Check,
  Palette,
  type LucideIcon,
  // 风格图标（按 style.id 索引；不匹配时用 Palette 兜底）
  Apple,
  Square,
  Layers,
  Box,
  Zap,
  Grid3x3,
  Radio,
  // 配色图标（按 palette.id 索引；不匹配时用 Palette 兜底）
  Sun,
  Moon,
  Flame,
  Droplet,
  Leaf,
  Brush,
  Mountain, // 蓝山水：山峦
  Gem, // 钻石版：宝石
  Map, // 古地图：地图
  Swords, // 魔兽世界：双剑（史诗/战场）
  Gamepad2, // 英雄联盟：手柄（竞技/电竞）
  Sparkles, // 紫色流光：闪光（reactbits 暗黑紫 + 流光）
  // Zap 复用第 15 行的导入（赛博朋克与 s35 风格共用电流图标）
  Coffee, // Catppuccin：咖啡杯（社区招牌昵称"猫咖"）
  Feather, // 水墨·夜：羽毛笔（夜写水墨）
  Cloud, // 仙侠：流云（御剑青冥）
  Blocks, // 我的世界：方块
  Joystick, // Playnite 原版：摇杆（游戏库管理器本家）
  Eclipse, // eMixedNite：明暗交界（Mixed + Nite）
  MoonStar, // DH_Night：夜
} from "lucide-react";
import { themeLibrary } from "../../utils/themeLibrary";
import { styleLibrary } from "../../utils/styleLibrary";
import {
  applyPaletteTheme,
  applyStyleVars,
  getStoredStyleId,
  getStoredThemeId,
  storeStyleId,
  storeThemeId,
} from "../../utils/themeApply";
import { useI18n } from "../../i18n";
import { useSettingsStore } from "../../stores/settingsStore";

// 每个 style 用一个能代表其视觉特征的 lucide 图标。
// 风格 id 在 styleLibrary.ts 里定义；这里按 id 查表。
// 没匹配到时用 Palette（标准色板）兜底，保证始终有图标显示。
const styleIconMap: Record<string, LucideIcon> = {
  apple: Apple, // 苹果：直接用 Apple 图标（一个小苹果）
  s2: Square, // 软浮雕 Neumorphism：圆角方块代表凸起的"软"质感
  s3: Layers, // 毛玻璃 Glassmorphism：层叠透光
  s4: Box, // 粗野硬朗 Brutalism：硬边方块
  s35: Zap, // 赛博朋克：电流/科幻感
  s43: Grid3x3, // 像素风：像素网格
  s10: Radio, // 复古未来/蒸汽波：复古电子
  recordly: Layers, // Recordly：克制的层叠卡片 SaaS 风
};

// 每个 palette 用一个能代表其颜色/风格的 lucide 图标。
// palette id 在 themeLibrary.ts 里定义（如 "p-light"、"p-cn-red"），这里按 id 查表。
// 没匹配到时统一用 Palette（标准色板）兜底，保证始终有图标显示。
// 注意：之前 key 写成"chinese-red"等短串，跟 themeLibrary 里的"p-cn-red"对不上，
// 一直走 Palette 兜底。已修正为真实 id。
const paletteIconMap: Record<string, LucideIcon> = {
  "p-minecraft": Blocks, // 我的世界：方块
  "p-playnite": Joystick, // Playnite 原版：摇杆
  "p-emixednite": Eclipse, // eMixedNite：明暗交界
  "p-dh-night": MoonStar, // DH_Night：夜
  "p-reactbits": Sparkles, // 紫色流光：闪光
  "p-light": Sun, // 明亮：太阳
  "p-dark": Moon, // 暗黑：月亮
  "p-cn-red": Flame, // 中国红：红色火焰
  "p-cn-blue": Droplet, // 中国蓝：蓝色水滴
  "p-cn-green": Leaf, // 中国绿：绿叶
  "p-cn-ink": Brush, // 中国水墨：毛笔
  "p-cn-blue-mountain": Mountain, // 蓝山水：山峦
  "p-diamond": Gem, // 钻石版：宝石
  "p-ancient-map": Map, // 古地图：地图
  "p-wow-epic": Swords, // 魔兽世界：双剑
  "p-lol-neon": Gamepad2, // 英雄联盟：手柄
  "p-recordly": Palette, // Recordly：标准色板
  "p-cyberpunk": Zap, // 赛博朋克：电流
  "p-catppuccin": Coffee, // Catppuccin：咖啡杯
  "p-ink-night": Feather, // 水墨·夜：羽毛笔
  "p-xianxia": Cloud, // 仙侠：流云
};

export default function ThemesSection() {
  const { t } = useI18n();
  // 通过 settings store 把主题/风格同时持久化到后端 config.json，
  // 这样打包版(file://)重启后 localStorage 不可靠时也不丢。
  const saveSettings = useSettingsStore((s) => s.save);
  // 选中的 style/palette 必须用 React state，否则点别的风格时 localStorage
  // 改了样式应用了，但组件没重渲染，"选中态"会一直停在初始值（最上面的苹果）
  // —— 这是之前的 bug。
  const [styleId, setStyleId] = useState<string | null>(getStoredStyleId());
  const [paletteId, setPaletteId] = useState<string | null>(getStoredThemeId());

  return (
    <div>
      <h3 className="mb-1.5">{t("settings_themes_header")}</h3>
      <p className="mb-3 text-xs text-dim">{t("settings_themes_hint")}</p>

      {/* ---- Styles (flat list) ---- */}
      <div className="mb-5">
        <div className="mb-2 text-xs font-semibold text-secondary-text">
          {t("settings_styles_label")}（{styleLibrary.length}）
        </div>
        <div className="flex flex-col gap-2">
          {styleLibrary.map((s) => {
            const active = styleId === s.id;
            const Icon = styleIconMap[s.id] ?? Palette;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                title={s.name}
                onClick={() => {
                  applyStyleVars(s.vars);
                  storeStyleId(s.id); // 立即生效：存 localStorage
                  void saveSettings({ styleId: s.id }); // 持久化：存 config.json
                  setStyleId(s.id);
                  // Recordly 主题自带固定调色板：选中它时，自动带上配套的 p-recordly 配色。
                  if (s.id === "recordly") {
                    const rp = themeLibrary.find((p) => p.id === "p-recordly");
                    if (rp) {
                      applyPaletteTheme(rp.palette);
                      storeThemeId(rp.id);
                      void saveSettings({ themeId: rp.id });
                      setPaletteId(rp.id);
                      document.body.classList.toggle(
                        "theme-diamond",
                        rp.gradientClass === "theme-diamond",
                      );
                      document.body.dataset.themeId = rp.id;
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    applyStyleVars(s.vars);
                    storeStyleId(s.id);
                    void saveSettings({ styleId: s.id });
                    setStyleId(s.id);
                    if (s.id === "recordly") {
                      const rp = themeLibrary.find((p) => p.id === "p-recordly");
                      if (rp) {
                        applyPaletteTheme(rp.palette);
                        storeThemeId(rp.id);
                        void saveSettings({ themeId: rp.id });
                        setPaletteId(rp.id);
                        document.body.classList.toggle(
                          "theme-diamond",
                          rp.gradientClass === "theme-diamond",
                        );
                        document.body.dataset.themeId = rp.id;
                      }
                    }
                  }
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  active
                    ? "border-accent bg-item-active"
                    : "border-border bg-input hover:border-border-strong"
                }`}
              >
                {/* 标志图标：每种风格一个代表性图标，让用户一眼区分 */}
                <Icon
                  size={16}
                  className={`shrink-0 ${active ? "text-accent" : "text-secondary-text"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-primary-text">{s.zh}</div>
                  <div className="truncate text-[10px] text-dim">{s.name}</div>
                </div>
                {active && <Check size={14} className="shrink-0 text-accent" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Palettes (flat list, one row per palette) ---- */}
      <div>
        <div className="mb-2 text-xs font-semibold text-secondary-text">
          {t("settings_palettes_label")}（{themeLibrary.length}）
        </div>
        <div className="flex flex-col gap-2">
          {themeLibrary.map((p) => {
            const active = paletteId === p.id;
            // 配色图标：没匹配到时用 Palette（标准色板图标）兜底
            const Icon = paletteIconMap[p.id] ?? Palette;
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                title={p.name}
                onClick={() => {
                  applyPaletteTheme(p.palette);
                  storeThemeId(p.id); // 立即生效：存 localStorage
                  void saveSettings({ themeId: p.id }); // 持久化：存 config.json
                  setPaletteId(p.id);
                  // 切到带 gradientClass 的 palette（如钻石版、5 套新渐变配色）
                  // 时，给 body 加专属 class 触发 CSS 里的渐变背景；切回普通
                  // palette 时把专属 class 去掉。其他 palette 走默认的顶底渐变。
                  document.body.classList.toggle(
                    "theme-diamond",
                    p.gradientClass === "theme-diamond",
                  );
                  document.body.dataset.themeId = p.id;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    applyPaletteTheme(p.palette);
                    storeThemeId(p.id);
                    void saveSettings({ themeId: p.id });
                    setPaletteId(p.id);
                    document.body.classList.toggle(
                      "theme-diamond",
                      p.gradientClass === "theme-diamond",
                    );
                    document.body.dataset.themeId = p.id;
                  }
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  active
                    ? "border-accent bg-item-active"
                    : "border-border bg-input hover:border-border-strong"
                }`}
              >
                {/* 标志图标：每种配色一个代表性图标（中国红用火焰、中国绿用叶等） */}
                <Icon
                  size={16}
                  className={`shrink-0 ${active ? "text-accent" : "text-secondary-text"}`}
                />
                <div className="flex h-6 w-14 shrink-0 overflow-hidden rounded border border-border-strong">
                  <div style={{ flex: 1, background: p.palette.primary }} />
                  <div style={{ flex: 1, background: p.palette.background }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-primary-text">
                    {p.zh}
                  </div>
                  <div className="truncate text-[10px] text-dim">{p.name}</div>
                </div>
                {active && <Check size={14} className="shrink-0 text-accent" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
