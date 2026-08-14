// Videos tab: lists every video attached to the library's games.
// A game's videos come from the `videos` field on the Game model
// (type: "youtube" | "file" | "url").

import { useMemo } from "react";
import { Clapperboard, Play, ExternalLink } from "lucide-react";
import { useGamesStore } from "../../stores/gamesStore";
import { displayName } from "../../utils/display";
import { imageUrl } from "../../utils/assets";
import { useI18n } from "../../i18n";
import type { GameVideo } from "../../types/models";

interface VideoEntry {
  gameId: string;
  gameName: string;
  cover?: string | null;
  video: GameVideo;
}

/** Convert a YouTube watch URL to its embeddable form. */
function toEmbedUrl(v: GameVideo): string | null {
  if (v.type === "youtube") {
    try {
      const u = new URL(v.url);
      if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
        let id = u.searchParams.get("v");
        if (!id && u.hostname.includes("youtu.be")) {
          id = u.pathname.split("/").filter(Boolean)[0] || null;
        }
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
    } catch {
      /* fall through */
    }
    return null;
  }
  // Local files / generic URLs: can't embed reliably here, show as a link.
  return null;
}

export default function VideosView() {
  const games = useGamesStore((s) => s.games);
  const { t } = useI18n();

  const entries = useMemo<VideoEntry[]>(() => {
    const out: VideoEntry[] = [];
    for (const g of games) {
      if (g.hidden || !g.videos || g.videos.length === 0) continue;
      for (const video of g.videos) {
        out.push({
          gameId: g.id,
          gameName: displayName(g),
          cover: g.coverImage || g.icon,
          video,
        });
      }
    }
    return out;
  }, [games]);

  return (
    <div className="content">
      <div className="mb-[18px] flex items-center gap-2.5">
        <Clapperboard size={22} className="text-accent" />
        <h2 className="m-0 text-xl">{t("videos_title")}</h2>
        <span className="count">{entries.length}</span>
      </div>

      {entries.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3.5 text-dim">
          <div className="opacity-40">
            <Clapperboard size={48} />
          </div>
          {t("videos_empty")}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
        {entries.map((entry, idx) => {
          const embed = toEmbedUrl(entry.video);
          const videoName = entry.video.name || entry.gameName;
          return (
            <div
              className="flex flex-col rounded-md border border-border bg-card transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(0,0,0,0.12)]"
              key={`${entry.gameId}-${idx}`}
            >
              <div className="relative aspect-video bg-black">
                {embed ? (
                  <iframe
                    src={embed}
                    title={videoName}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                    className="h-full w-full border-0"
                  />
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden text-dim">
                    {entry.cover ? (
                      <img src={imageUrl(entry.cover)} alt={videoName} className="h-full w-full object-cover opacity-60" />
                    ) : (
                      <Play size={40} />
                    )}
                    <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                      <ExternalLink size={12} /> {entry.video.type}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5 px-3 pb-1.5 pt-2.5">
                <span className="truncate text-sm font-semibold text-primary-text" title={videoName}>
                  {videoName}
                </span>
                <span className="truncate text-xs text-dim" title={entry.gameName}>
                  {entry.gameName}
                </span>
              </div>
              {!embed && entry.video.url && (
                <a
                  className="self-start px-3 pb-3 text-xs text-accent no-underline hover:underline"
                  href={entry.video.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("videos_open")}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
