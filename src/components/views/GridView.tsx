// Grid view: 16:9 cover cards grouped by the active grouping.
// Each card shows the cover (GIF supported) plus Play and Details buttons.
//
// The grouped grid is windowed with useVirtualGrid: only the rows near the
// viewport are mounted, so a 1000+ game library keeps the DOM small. Covers
// additionally load lazily via IntersectionObserver (useLazyImage), so neither
// the IPC bridge nor layout is flooded at startup.

import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGamesStore } from "../../stores/gamesStore";
import { useScrollStore } from "../../stores/scrollStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { Group } from "../../utils/selectors";
import type { Game } from "../../types/models";
import { displayName } from "../../utils/display";
import { imageUrl } from "../../utils/assets";
import { useI18n } from "../../i18n";
import { Image as ImageIcon, Play, Info } from "lucide-react";
import GameContextMenu from "../GameContextMenu";
import { useLazyImage } from "../../hooks/useLazyImage";
import { useVirtualGrid, type VirtualGridRow } from "../../hooks/useVirtualGrid";

interface Props {
  groups: Group[];
}

export default function GridView({ groups }: Props) {
  const navigate = useNavigate();
  const selected = useGamesStore((s) => s.selectedGameIds);
  const selectGame = useGamesStore((s) => s.selectGame);
  const launchGame = useGamesStore((s) => s.launchGame);
  const cardWidth = useSettingsStore((s) => s.settings.cardWidth);
  const cardGap = useSettingsStore((s) => s.settings.cardGap);

  const [menu, setMenu] = useState<{ game: Game; x: number; y: number } | null>(null);

  const saveGridScroll = useScrollStore((s) => s.saveGridScroll);
  const takeGridScroll = useScrollStore((s) => s.takeGridScroll);

  // 进详情页之前，先把当前的滚动位置记下来；等用户从详情页返回时再恢复，
  // 这样就不会一回来就跳到最顶上。
  const openDetails = (game: Game) => {
    // 诊断：如果 id 为空或含特殊字符，路由 `/game/:id` 可能匹配不上，被兜底
    // 路由 `Navigate to "/"` 拉回主页，表现就是"点详情闪一下没变化"。
    if (!game.id || /[\/\\?#]/.test(game.id)) {
      console.warn(
        "[openDetails] 游戏 id 异常，无法跳转详情：id=",
        JSON.stringify(game.id),
        "name=",
        game.name,
      );
    }
    const top = scrollRef.current?.scrollTop ?? 0;
    saveGridScroll(top);
    navigate(`/game/${encodeURIComponent(game.id)}`);
  };

  const { scrollRef, cols, totalSize, items, virtualizer, rowStartIndex } =
    useVirtualGrid({ groups, cardWidth, cardGap });

  // 等虚拟列表准备好之后，把记下来的滚动位置恢复回去。
  // 这里用 useLayoutEffect + virtualizer.scrollToOffset()（而不是直接改 scrollTop）
  // 是为了让虚拟列表在同一帧里就切换到该显示的那几行，顶部不会闪一下。
  // restoredRef 用来防止 totalSize 在挂载时变好几次而重复恢复。
  const restoredRef = useRef(false);
  useLayoutEffect(() => {
    if (restoredRef.current) return;
    if (totalSize <= 0) return;
    const saved = takeGridScroll();
    if (saved == null || saved <= 0) return;
    restoredRef.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) virtualizer.scrollToOffset(saved);
    });
    // takeGridScroll 这个函数是稳定的；真正等的是 totalSize（列表准备好了没）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSize]);

  const gap = Math.max(0, Math.min(20, cardGap ?? 8));

  const renderRow = (row: VirtualGridRow, startIndex: number) => {
    if (row.type === "header") {
      return (
        <div className="group-header">
          {row.label}
          <span className="count">{row.count}</span>
        </div>
      );
    }
    const gridStyle = {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: `${gap}px`,
      width: "100%",
    } as React.CSSProperties;
    return (
      <div className="game-grid" style={gridStyle}>
        {row.games.map((game, i) => (
          <GridCard
            key={game.id}
            game={game}
            index={startIndex + i}
            selected={selected.includes(game.id)}
            onSelect={(multi) => selectGame(game.id, multi)}
            onLaunch={() => launchGame(game.id)}
            onDetails={() => openDetails(game)}
            onContextMenu={(x, y) => setMenu({ game, x, y })}
          />
        ))}
      </div>
    );
  };

  // .vg-window is the only child of .content. Its explicit height drives the
  // .content scrollbar, and absolutely-positioned .vg-rows are placed at the
  // offsets returned by the virtualizer. This avoids any spacer/window ordering
  // ambiguity (the previous structure occasionally left .content with no
  // in-flow height and rendered only the initial rows).
  return (
    <div className="content" ref={scrollRef}>
      <div
        className="vg-window"
        style={{ position: "relative", height: `${totalSize}px` }}
      >
        {items.map(({ row, offset }) => {
          // Each row carries the global card index where its first game sits.
          // We pre-compute the running card-count in a single pass (O(n))
          // and look it up by row key, instead of recomputing per render.
          const startIndex = rowStartIndex.get(row.key) ?? 0;
          return (
            <div
              className="vg-row"
              key={row.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${offset}px)`,
              }}
            >
              {renderRow(row, startIndex)}
            </div>
          );
        })}
      </div>

      {menu && (
        <GameContextMenu
          game={menu.game}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function GridCard({
  game,
  index,
  selected,
  onSelect,
  onLaunch,
  onDetails,
  onContextMenu,
}: {
  game: Game;
  index: number;
  selected: boolean;
  onSelect: (multi: boolean) => void;
  onLaunch: () => void;
  onDetails: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const { t } = useI18n();
  const { ref: coverRef } = useLazyImage(game.coverImage);
  // imageUrl() is synchronous: it returns the cached blob URL or undefined.
  // While the IntersectionObserver hasn't fired yet, the placeholder is
  // shown. Once the card scrolls near, ensureImageLoaded() warms the cache
  // and a re-render swaps in the real image with a fade-in.
  const src = imageUrl(game.coverImage);

  return (
    <div
      className={`grid-card ${selected ? "selected" : ""}`}
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      <div className="cover" ref={coverRef as unknown as React.Ref<HTMLDivElement>}>
        {src ? (
          <img src={src} alt={game.name} loading="lazy" decoding="async" />
        ) : (
          <div className="placeholder">
            <ImageIcon size={30} />
          </div>
        )}
        {/* Debug badge: global card index (1-based for human readability),
            useful while diagnosing virtualisation ordering. The internal
            `index` prop is 0-based; we show index + 1. */}
        <span className="debug-badge">#{index + 1}</span>
        {game.installed && <span className="installed-dot" />}
        <div className="cover-actions">
          <button
            className="cover-btn play"
            title={t("grid_play")}
            onClick={(e) => {
              e.stopPropagation();
              onLaunch();
            }}
          >
            <Play size={16} fill="currentColor" />
            <span>{t("grid_play")}</span>
          </button>
          <button
            className="cover-btn details"
            title={t("grid_details")}
            onClick={(e) => {
              e.stopPropagation();
              onDetails();
            }}
          >
            <Info size={16} />
            <span>{t("grid_details")}</span>
          </button>
        </div>
      </div>
      <div className="title">{displayName(game)}</div>
      {(game.localizedNames?.length || game.alternateNames?.length) ? (
        <div
          className="alt-names"
          title={[
            ...((game.localizedNames || []).map((ln) => `${ln.language}: ${ln.name}`)),
            ...((game.alternateNames || [])),
          ].join("\n")}
        >
          {game.localizedNames?.slice(0, 1).map((ln) => (
            <span className="alt-name" key={ln.language}>{ln.name}</span>
          ))}
          {game.alternateNames?.slice(0, 1).map((alt) => (
            <span className="alt-name alias" key={alt}>{alt}</span>
          ))}
          {((game.localizedNames?.length || 0) + (game.alternateNames?.length || 0)) > 2 ? (
            <span className="alt-name more">
              +{((game.localizedNames?.length || 0) + (game.alternateNames?.length || 0)) - 2}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
