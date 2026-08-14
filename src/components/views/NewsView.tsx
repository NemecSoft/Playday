// News / announcements page showing the most recently added games.
// Sorts all games by their `added` timestamp (newest first) and renders a
// vertical feed with cover, name, release date and a short description.

import { useMemo } from "react";
import { useGamesStore } from "../../stores/gamesStore";
import { displayName } from "../../utils/display";
import { imageUrl } from "../../utils/assets";
import { Sparkles, CalendarDays, Play } from "lucide-react";
import { useI18n } from "../../i18n";
import { Button } from "../ui/button";

export default function NewsView() {
  const games = useGamesStore((s) => s.games);
  const launchGame = useGamesStore((s) => s.launchGame);
  const { t } = useI18n();

  // Newest first by `added`.
  const recent = useMemo(() => {
    return [...games]
      .filter((g) => !g.hidden)
      .sort((a, b) => {
        const ta = a.added ? new Date(a.added).getTime() : 0;
        const tb = b.added ? new Date(b.added).getTime() : 0;
        return tb - ta;
      });
  }, [games]);

  return (
    <div className="content">
      <div className="mb-[18px] flex items-center gap-2.5">
        <Sparkles size={22} className="text-accent" />
        <h2 className="m-0 text-xl">{t("news_title")}</h2>
        <span className="count">{recent.length}</span>
      </div>

      {recent.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3.5 text-dim">
          <div className="opacity-40">
            <Sparkles size={48} />
          </div>
          {t("news_empty")}
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {recent.map((g) => (
          <div
            className="flex gap-4 rounded-md border border-border bg-panel p-[14px_16px] transition-colors hover:border-border-strong"
            key={g.id}
          >
            <div className="h-[118px] w-[88px] shrink-0 overflow-hidden rounded-md border border-border bg-input">
              {imageUrl(g.coverImage) || imageUrl(g.icon) ? (
                <img
                  src={imageUrl(g.coverImage) || imageUrl(g.icon)}
                  alt={g.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-3xl font-bold">
                  {g.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="text-base font-bold text-primary-text">{displayName(g)}</span>
                {g.releaseDate && (
                  <span className="inline-flex items-center gap-1 text-xs text-dim">
                    <CalendarDays size={13} />
                    {new Date(g.releaseDate).getFullYear()}
                  </span>
                )}
              </div>
              <div className="my-1 mb-2 text-xs text-secondary-text">
                {g.developer.length > 0 && <span>{g.developer.join(", ")}</span>}
                {g.platform.length > 0 && <span>• {g.platform.join(", ")}</span>}
              </div>
              {g.description && <p className="text-[13px] leading-relaxed text-secondary-text">{g.description}</p>}
              <Button size="sm" onClick={() => launchGame(g.id)}>
                <Play size={14} fill="currentColor" /> {t("details_play")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
