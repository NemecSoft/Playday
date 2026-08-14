// Plugins / extensions management.

import { useEffect, useState } from "react";
import { Plug, RefreshCw, Trash2 } from "lucide-react";
import type { LibraryPluginInfo } from "../../types/models";
import { api } from "../../api/client";
import { useI18n } from "../../i18n";
import { Button } from "../ui/button";

export default function PluginsSection() {
  const [plugins, setPlugins] = useState<LibraryPluginInfo[]>([]);
  const { t } = useI18n();

  const load = async () => {
    const p = await api.discoverPlugins();
    setPlugins(p);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h3 className="mb-3.5">{t("settings_plugins_header")}</h3>

      <div className="mb-4">
        <Button onClick={load}>
          <RefreshCw size={15} /> {t("settings_rescanPlugins")}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {plugins.length === 0 && (
          <div className="text-dim">
            {t("settings_noPlugins")} <code>./extensions/plugins</code>.
          </div>
        )}
        {plugins.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2.5 rounded-md border border-border bg-input px-3 py-2"
          >
            <Plug size={16} className="text-accent-hover" />
            <span className="font-semibold">{p.name}</span>
            <span className="text-xs text-dim">{p.id}</span>
            <span className="ml-auto text-xs">
              {p.enabled ? <span className="text-success">{t("settings_enabled")}</span> : t("settings_disabled")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={async () => {
                await api.deleteLibraryPlugin(p.id);
                await load();
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
