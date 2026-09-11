// 综合主题/配色/字体设计器。
// 两段式布局：
//   1) 顶部"整套预设"——每个预设是一整套视觉方案，点一下整套应用。
//   2) 下方"分项微调"——在预设基础上逐项调整（配色/背景渐变/圆角/字体/卡片）。
// 所有改动实时生效（applyDesigner 写 CSS 变量）并持久化（save 到 settings.designer）。
import { useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { DESIGNER_PRESETS } from "../../utils/designerPresets";
import { applyDesigner } from "../../utils/designerApply";
import { DEFAULT_DESIGNER } from "../../../shared/models";
import { ColorInput } from "../ui/color-input";
import { Slider } from "../ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { FONT_OPTIONS } from "../../utils/fonts";
import { useI18n } from "../../i18n";
import type { DesignerConfig } from "../../../shared/models";

// 卡片文字预设（复用 AppearanceSection 里的 6 种：正常/描边/荧光/半透明/阴影/便利贴）。
const CARD_TEXT_PRESETS: Array<{ id: string; label: string; style: DesignerConfig["cardText"] }> = [
  {
    id: "normal", label: "正常",
    style: { color: "#e8eaed", stroke: false, strokeColor: "#000000", strokeWidth: 0, glow: false, glowColor: "#ffffff", glowBlur: 0, shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0, bg: false, bgColor: "#000000", bgOpacity: 0 },
  },
  {
    id: "stroke", label: "描边",
    style: { color: "#e8eaed", stroke: true, strokeColor: "#000000", strokeWidth: 1.5, glow: false, glowColor: "#ffffff", glowBlur: 0, shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0, bg: false, bgColor: "#000000", bgOpacity: 0 },
  },
  {
    id: "glow", label: "荧光",
    style: { color: "#ffffff", stroke: false, strokeColor: "#000000", strokeWidth: 0, glow: true, glowColor: "#3b82f6", glowBlur: 15, shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0, bg: false, bgColor: "#000000", bgOpacity: 0 },
  },
  {
    id: "semi", label: "半透明",
    style: { color: "#e8eaed", stroke: false, strokeColor: "#000000", strokeWidth: 0, glow: false, glowColor: "#ffffff", glowBlur: 0, shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0, bg: true, bgColor: "#000000", bgOpacity: 0.45 },
  },
  {
    id: "shadow", label: "阴影",
    style: { color: "#ffffff", stroke: false, strokeColor: "#000000", strokeWidth: 0, glow: false, glowColor: "#ffffff", glowBlur: 0, shadow: true, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 2, shadowBlur: 4, bg: false, bgColor: "#000000", bgOpacity: 0 },
  },
  {
    id: "sticky", label: "便利贴",
    style: { color: "#fef3c7", stroke: false, strokeColor: "#000000", strokeWidth: 0, glow: false, glowColor: "#ffffff", glowBlur: 0, shadow: true, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 1, shadowBlur: 3, bg: true, bgColor: "#7c2d12", bgOpacity: 0.8 },
  },
];

export default function DesignerSection() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);

  // 本地 designer 状态（从 settings.designer 初始化）。
  const [designer, setDesigner] = useState<DesignerConfig>(() => ({
    ...DEFAULT_DESIGNER,
    ...(settings.designer || {}),
  }));
  // 保存防抖计时器
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // settings.designer 变化时同步本地（外部导入/恢复）。
  useEffect(() => {
    setDesigner({ ...DEFAULT_DESIGNER, ...(settings.designer || {}) });
  }, [settings.designer]);

  // 更新 designer 的一部分：即时 applyDesigner + 防抖保存。
  const update = (patch: Partial<DesignerConfig>) => {
    const next = { ...designer, ...patch } as DesignerConfig;
    setDesigner(next);
    applyDesigner(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void save({ designer: next });
    }, 300);
  };

  // 应用整套预设：展开预设 config 到 designer，并保存。
  const applyPreset = (presetId: string) => {
    const preset = DESIGNER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next = { ...preset.config, presetId } as DesignerConfig;
    setDesigner(next);
    applyDesigner(next);
    void save({ designer: next });
  };

  // 预设预览配色（用于缩略图）
  const previews = useMemo(
    () =>
      DESIGNER_PRESETS.map((p) => ({
        id: p.id,
        name: p.defaultLabel,
        from: p.previewColors[0],
        to: p.previewColors[1],
      })),
    [],
  );

  const { t } = useI18n();

  return (
    <div className="designer-section space-y-5">
      {/* ============ 1) 整套预设 ============ */}
      <div>
        <h3 className="mb-2 text-sm font-medium">整套预设</h3>
        <div className="flex flex-wrap gap-2">
          {previews.map((p) => (
            <button
              key={p.id}
              className={`designer-preset-card ${
                designer.presetId === p.id ? "active" : ""
              }`}
              style={{
                background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
              }}
              onClick={() => applyPreset(p.id)}
              title={p.name}
            >
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ============ 2) 分项微调 ============ */}
      <div className="space-y-4">
        {/* 配色 */}
        <div className="designer-field">
          <Label>配色方案</Label>
          <Select
            value={designer.paletteId || ""}
            onValueChange={(v) => update({ paletteId: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择配色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="p-fluent">Fluent 黑</SelectItem>
              <SelectItem value="p-fluent-light">Fluent 白</SelectItem>
              <SelectItem value="p-dark">暗黑</SelectItem>
              <SelectItem value="p-light">明亮</SelectItem>
              <SelectItem value="p-recordly">Recordly</SelectItem>
              <SelectItem value="p-cn-red">中国红</SelectItem>
              <SelectItem value="p-cn-green">中国绿</SelectItem>
              <SelectItem value="p-cn-blue-mountain">山水蓝</SelectItem>
              <SelectItem value="p-cn-ink">水墨</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 背景渐变 */}
        <div className="designer-field">
          <Label>主背景</Label>
          <div className="flex items-center gap-2">
            <button
              className={`designer-chip ${designer.bgMode === "solid" ? "active" : ""}`}
              onClick={() => update({ bgMode: "solid" })}
            >
              单色
            </button>
            <button
              className={`designer-chip ${designer.bgMode === "gradient" ? "active" : ""}`}
              onClick={() =>
                update({
                  bgMode: "gradient",
                  bgGradient: designer.bgGradient || { from: "#171a1f", to: "#2a1b3d", angle: 135 },
                })
              }
            >
              渐变
            </button>
          </div>
          {designer.bgMode === "gradient" && designer.bgGradient && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <ColorInput
                  value={designer.bgGradient.from}
                  onChange={(v) =>
                    update({ bgGradient: { ...designer.bgGradient!, from: v } })
                  }
                />
                <ColorInput
                  value={designer.bgGradient.to}
                  onChange={(v) =>
                    update({ bgGradient: { ...designer.bgGradient!, to: v } })
                  }
                />
                <Slider
                  min={0}
                  max={360}
                  step={15}
                  value={[designer.bgGradient.angle]}
                  onValueChange={([a]) =>
                    update({ bgGradient: { ...designer.bgGradient!, angle: a } })
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {designer.bgGradient.angle}°
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 面板渐变 */}
        <div className="designer-field">
          <Label>面板（侧栏/顶部/弹窗）</Label>
          <div className="flex items-center gap-2">
            <button
              className={`designer-chip ${designer.panelMode === "solid" ? "active" : ""}`}
              onClick={() => update({ panelMode: "solid" })}
            >
              单色
            </button>
            <button
              className={`designer-chip ${designer.panelMode === "gradient" ? "active" : ""}`}
              onClick={() =>
                update({
                  panelMode: "gradient",
                  panelGradient: designer.panelGradient || { from: "#1c2027", to: "#2a1b3d", angle: 135 },
                })
              }
            >
              渐变
            </button>
          </div>
          {designer.panelMode === "gradient" && designer.panelGradient && (
            <div className="mt-2 flex items-center gap-2">
              <ColorInput
                value={designer.panelGradient.from}
                onChange={(v) =>
                  update({ panelGradient: { ...designer.panelGradient!, from: v } })
                }
              />
              <ColorInput
                value={designer.panelGradient.to}
                onChange={(v) =>
                  update({ panelGradient: { ...designer.panelGradient!, to: v } })
                }
              />
              <Slider
                min={0}
                max={360}
                step={15}
                value={[designer.panelGradient.angle]}
                onValueChange={([a]) =>
                  update({ panelGradient: { ...designer.panelGradient!, angle: a } })
                }
              />
            </div>
          )}
        </div>

        {/* 圆角 */}
        <div className="designer-field">
          <Label>圆角程度：{designer.radius}px（0=直角，20=大圆角）</Label>
          <Slider
            min={0}
            max={20}
            step={1}
            value={[designer.radius]}
            onValueChange={([r]) => update({ radius: r })}
          />
        </div>

        {/* 字体 */}
        <div className="designer-field">
          <Label>界面字体</Label>
          <Select
            value={designer.fontFamily || ""}
            onValueChange={(v) => update({ fontFamily: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="选择字体" />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => (
                <SelectItem key={f.value || "default"} value={f.value}>
                  {t(f.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 卡片设计 */}
        <div className="space-y-2">
          <Label>卡片设计</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">背景</span>
            <button
              className={`designer-chip ${designer.cardBg === "panel" ? "active" : ""}`}
              onClick={() => update({ cardBg: "panel" })}
            >
              跟随面板
            </button>
            <button
              className={`designer-chip ${designer.cardBg === "solid" ? "active" : ""}`}
              onClick={() =>
                update({ cardBg: "solid", cardBgColor: designer.cardBgColor || "#1f242c" })
              }
            >
              单色
            </button>
            <button
              className={`designer-chip ${designer.cardBg === "gradient" ? "active" : ""}`}
              onClick={() =>
                update({
                  cardBg: "gradient",
                  cardGradient: designer.cardGradient || { from: "#1f242c", to: "#2a1b3d", angle: 135 },
                })
              }
            >
              渐变
            </button>
          </div>
          {designer.cardBg === "solid" && (
            <div className="mt-1">
              <ColorInput
                value={designer.cardBgColor || "#1f242c"}
                onChange={(v) => update({ cardBgColor: v })}
              />
            </div>
          )}
          {designer.cardBg === "gradient" && designer.cardGradient && (
            <div className="mt-1 flex items-center gap-2">
              <ColorInput
                value={designer.cardGradient.from}
                onChange={(v) =>
                  update({ cardGradient: { ...designer.cardGradient!, from: v } })
                }
              />
              <ColorInput
                value={designer.cardGradient.to}
                onChange={(v) =>
                  update({ cardGradient: { ...designer.cardGradient!, to: v } })
                }
              />
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Checkbox
              checked={designer.cardBorder}
              onCheckedChange={(c) => update({ cardBorder: !!c })}
              id="card-border"
            />
            <Label htmlFor="card-border">显示卡片边框</Label>
          </div>
        </div>

        {/* 卡片文字预设 */}
        <div className="space-y-2">
          <Label>卡片文字</Label>
          <div className="flex flex-wrap gap-2">
            {CARD_TEXT_PRESETS.map((p) => (
              <button
                key={p.id}
                className="designer-chip"
                onClick={() => update({ cardText: p.style })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
