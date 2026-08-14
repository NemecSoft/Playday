// Tools tab: placeholder cards for extra utilities (screen recording, game
// enhancement, etc.). Functional implementations will be added incrementally.

import { useState } from "react";
import { Wrench, MonitorPlay, Gamepad2, Rocket, Cog } from "lucide-react";
import { useI18n } from "../../i18n";
import { Button } from "../ui/button";

interface ToolDef {
  id: string;
  titleKey: string;
  descKey: string;
  icon: typeof MonitorPlay;
  badge?: string;
}

const TOOLS: ToolDef[] = [
  {
    id: "screen-recorder",
    titleKey: "tools_recorder_title",
    descKey: "tools_recorder_desc",
    icon: MonitorPlay,
  },
  {
    id: "game-boost",
    titleKey: "tools_boost_title",
    descKey: "tools_boost_desc",
    icon: Rocket,
  },
  {
    id: "game-enhance",
    titleKey: "tools_enhance_title",
    descKey: "tools_enhance_desc",
    icon: Gamepad2,
  },
];

export default function ToolsView() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  return (
    <div className="content">
      <div className="flex items-center gap-2.5">
        <Wrench size={22} className="text-accent" />
        <h2 className="m-0 text-xl">{t("tools_title")}</h2>
      </div>
      <p className="mb-5 mt-2 text-[13px] text-dim">{t("tools_subtitle")}</p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {TOOLS.map(({ id, titleKey, descKey, icon: Icon }) => {
          const isOn = !!enabled[id];
          return (
            <div
              className={`flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 transition-colors ${isOn ? "border-accent shadow-[0_0_0_1px_var(--accent-soft)]" : ""}`}
              key={id}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon size={26} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-semibold text-primary-text">{t(titleKey)}</span>
                <p className="mt-1 text-xs leading-relaxed text-dim">{t(descKey)}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Button
                  variant={isOn ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEnabled((s) => ({ ...s, [id]: !s[id] }))}
                >
                  {isOn ? t("tools_disable") : t("tools_enable")}
                </Button>
                <span className="text-[11px] text-dim">{t("tools_comingSoon")}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-dim">
        <Cog size={15} />
        <span>{t("tools_note")}</span>
      </div>
    </div>
  );
}
