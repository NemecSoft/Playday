// Grid view: 16:9 cover cards grouped by the active grouping.
// Each card shows the cover (GIF supported) plus Play and Details buttons.
//
// The grouped grid is windowed with useVirtualGrid: only the rows near the
// viewport are mounted, so a 1000+ game library keeps the DOM small. Covers
// additionally load lazily via IntersectionObserver (useLazyImage), so neither
// the IPC bridge nor layout is flooded at startup.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { clampCardDescFontSize } from "../../utils/cardText";

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
  // 网格卡片行与行之间的垂直间距（独立于水平间距 cardGap，可在"设置-外观"里调）。
  const cardRowGap = useSettingsStore((s) => s.settings.cardRowGap);
  // 网格卡片是否显示简介（工具栏开关控制，持久化）。
  const showCardDescription = useSettingsStore((s) => s.settings.showCardDescription);
  // 网格卡片简介字号（独立于标题字号，可在"设置-外观"里调）。
  const cardDescFontSize = useSettingsStore((s) => s.settings.cardDescFontSize);

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

  // 行内非封面区高度（标题 + 简介）。精确公式，避免估算过大导致 cardRowGap=0
  // 仍有"行间空白"残留。
  //
  // 实际构成（无 alt-names，因为多数卡片没 alt，alt 多的卡片会让该行下溢一点）：
  //   .grid-card padding-top       = 6px
  //   .title-wrap margin-top       = 7px
  //   .title 行盒(15px字+padding2)  ≈ 22px
  //   .grid-desc margin-top (有)   = 4px
  //   .grid-desc 3行截断(字号*1.5*3)   // 字号随 cardDescFontSize 变化
  //   .grid-card padding-bottom    = cardRowGap（动态传入）
  //
  // 把这些加起来让 rowHeight = coverHeight + titleHeight + cardRowGap 精确等于真实渲染高度。
  // 这样 cardRowGap=0 时两行紧贴（除去下一张卡片自身无法消除的 padding-top）。
  const descFontSize = clampCardDescFontSize(cardDescFontSize);
  // 副标题（英文原名）行高：库里很多游戏有本地化中文名，副标题普遍存在，
  // 统一预留 15px 行高最稳（避免有副标题的卡片溢出盖住下方）。没副标题的卡片
  // 实际更矮，虚拟列表按行内最高卡片排布，不影响正确性。
  const origNameHeight = 15;
  const titlePlusDesc =
    6 +        // .grid-card padding-top
    7 +        // .title-wrap margin-top
    22 +       // .title 行高（font-size 15px * 1.2 + padding 2px）
    origNameHeight + // 副标题（英文原名）行高
    (showCardDescription ? 4 + descFontSize * 1.5 * 3 : 0); // 简介：margin-top + 3 行截断(line-height 1.5)
  const { scrollRef, cols, totalSize, items, virtualizer, rowStartIndex, measureRow } =
    useVirtualGrid({ groups, cardWidth, cardGap, cardRowGap, titleHeight: titlePlusDesc });

  // 滚轮约定（与浏览器一致）：
  //   Ctrl+滚轮 → 整页缩放（全局处理在 ZoomIndicator，这里不再管）；
  //   Alt+滚轮  → 调整封面大小（120~400px，即时生效，停手 300ms 后落盘）。
  // 必须用原生 wheel 监听 + passive:false 才能拦掉默认行为（Alt+滚轮默认会滚列表）。
  const applySettings = useSettingsStore((s) => s.apply);
  const saveSettings = useSettingsStore((s) => s.save);
  const cardWidthSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Alt+滚轮：封面大小（Ctrl+滚轮的整页缩放由 ZoomIndicator 全局处理）。
      if (!e.altKey) return;
      e.preventDefault();
      const cur = useSettingsStore.getState().settings.cardWidth;
      const next = Math.max(120, Math.min(400, cur + (e.deltaY < 0 ? 10 : -10)));
      if (next === cur) return;
      applySettings({ cardWidth: next });
      if (cardWidthSaveTimer.current) clearTimeout(cardWidthSaveTimer.current);
      cardWidthSaveTimer.current = setTimeout(() => {
        saveSettings({ cardWidth: useSettingsStore.getState().settings.cardWidth });
      }, 300);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (cardWidthSaveTimer.current) clearTimeout(cardWidthSaveTimer.current);
    };
  }, [scrollRef, applySettings, saveSettings]);

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

  // 水平间距：卡片左右之间，用 cardGap（上限 20）。
  const gap = Math.max(0, Math.min(20, cardGap ?? 8));

  // 行内子内容（封面/简介/alt-names）首次 mount 时可能还没渲染好，
  // measureElement 第一次测得高度偏低。只在"初次挂载 / 简介开关 / 列数变化"时
  // 下一帧强制重测一次，让真实行高生效。
  // 注意：不要把 rowGap 放进来——拖滑块时每次 save 都会触发全量重测，
  // 反而造成排布抖动（"跳动"）。行高变化已由 useVirtualGrid 内部按 rowHeight 处理。
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      virtualizer.measure();
    });
    return () => cancelAnimationFrame(raf);
  }, [items.length, showCardDescription, virtualizer]);

  const renderRow = (row: VirtualGridRow, startIndex: number) => {
    if (row.type === "header") {
      return (
        <div className="group-header">
          {row.label}
          <span className="count">{row.count}</span>
        </div>
      );
    }
    // 水平间距（卡片左右之间）用 cardGap；上下间距由 .grid-card 的 padding-bottom 承担
    // （CSS 变量 --card-row-gap，0 时两行紧贴）。
    const gridStyle = {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      columnGap: `${gap}px`,
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
            showDescription={showCardDescription}
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
        {items.map(({ row, offset, index }) => {
          // Each row carries the global card index where its first game sits.
          // We pre-compute the running card-count in a single pass (O(n))
          // and look it up by row key, instead of recomputing per render.
          const startIndex = rowStartIndex.get(row.key) ?? 0;
          return (
            <div
              className="vg-row"
              key={row.key}
              data-index={index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${offset}px)`,
              }}
            >
              <CardRowMeasurer rowKey={row.key} measureRow={measureRow}>
                {renderRow(row, startIndex)}
              </CardRowMeasurer>
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

/**
 * 测量一行卡片的真实高度，并告知虚拟列表。
 *
 * 背景：虚拟列表默认用"公式估算"行高（封面 16:9 + 标题区），但实际卡片里还有
 * 副标题、简介、别名(alt-names)等，公式可能漏算，导致估算偏小、下一行卡片的封面
 * "压"到上一行卡片的文字上。这里用 ResizeObserver 实测该行最高卡片的高度
 * （含卡片底部 padding-bottom，即含卡片间间距），写回虚拟列表，让行高精确等于
 * 卡片真实渲染高度，两行之间不再重叠（间距最小为 0 时两行卡片紧贴）。
 *
 * 实现要点（避免 ResizeObserver loop）：
 *   1) 只观察 CardRowMeasurer 自己的根元素，不观察内部 grid-card。
 *      因为根元素高度 = 内部最高 grid-card 高度（block 流自然撑开），
 *      任何 grid-card 变化都会触发根元素的尺寸变化回调，单层观察即可。
 *   2) 回调里用 requestAnimationFrame 把 resizeItem 推迟到下一帧，
 *      避免和 React 同步渲染冲突触发"loop completed with undelivered notifications"。
 */
function CardRowMeasurer({
  rowKey,
  measureRow,
  children,
}: {
  rowKey: string;
  measureRow: (rowKey: string, height: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 只把"最近的稳定 key 和测量回调"存起来，避免 effect 依赖每次渲染都变。
  const keyRef = useRef(rowKey);
  keyRef.current = rowKey;
  const measureRef = useRef(measureRow);
  measureRef.current = measureRow;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 取该行根元素的高度（block 流自然等于内部最高 grid-card 高度）。
    const measure = () => {
      const h = el.offsetHeight;
      if (h > 0) measureRef.current(keyRef.current, h);
    };
    // 首帧先测一次（可能此时子内容还没完全渲染，rAF 后 ResizeObserver 会再补）。
    const raf = requestAnimationFrame(measure);
    let pendingFrame = 0;
    const ro = new ResizeObserver(() => {
      // 用 rAF 推迟到下一帧执行，避免在 ResizeObserver 回调里同步触发
      // 虚拟列表的状态更新导致浏览器报"loop completed"错误。
      // 合并同帧的多次回调：只保留最新一次的 measure 调用。
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        measure();
      });
    });
    // 只观察根元素本身，避免对每个 grid-card 都注册观察回调。
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      ro.disconnect();
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}

function GridCard({
  game,
  index,
  selected,
  onSelect,
  onLaunch,
  onDetails,
  onContextMenu,
  showDescription,
}: {
  game: Game;
  index: number;
  selected: boolean;
  onSelect: (multi: boolean) => void;
  onLaunch: () => void;
  onDetails: () => void;
  onContextMenu: (x: number, y: number) => void;
  showDescription: boolean;
}) {
  const { t } = useI18n();
  const { ref: coverRef } = useLazyImage(game.coverImage);
  // 简介展开/收起：默认收成几行，点击可展开完整。受工具栏"简介"开关控制。
  // 注意：这里显示的是 Playday 用户维护的"简介"（intro），不是 Playnite 的"描述"（description）。
  const [descExpanded, setDescExpanded] = useState(false);
  const hasDesc = !!game.intro && game.intro.trim().length > 0;
  // imageUrl() is synchronous: it returns the cached blob URL or undefined.
  // While the IntersectionObserver hasn't fired yet, the placeholder is
  // shown. Once the card scrolls near, ensureImageLoaded() warms the cache
  // and a re-render swaps in the real image with a fade-in.
  const src = imageUrl(game.coverImage);

  // 说明：已移除 Aceternity spotlight 光晕（动态光效，按需求去掉）。
  return (
    <div
      className={`grid-card ${selected ? "selected" : ""}`}
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      {/* 静态荧光边框由 CSS 的 .cover::before 实现（见 global.css），无需额外 DOM 元素。 */}
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
      <div className="title-wrap">
        {/* 主标题：name（显示名，中文名） */}
        <div className="title">{displayName(game)}</div>
        {/* 副标题：原始英文名（origin_name）。仅当有 origin_name 且与主标题不同才显示。
            老游戏 origin_name 为空则不显示副标题。 */}
        {!!game.originName && displayName(game) !== game.originName && (
          <div className="title-orig">{game.originName}</div>
        )}
      </div>
      {/* 简介：受工具栏"简介"开关控制。有 description 且开关开启才显示。
           默认 2-3 行省略，点击可展开/收起完整文字。stopPropagation 避免误触卡片选中。 */}
      {showDescription && hasDesc && (
        <div
          className={`grid-desc ${descExpanded ? "expanded" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setDescExpanded((v) => !v);
          }}
          title={descExpanded ? t("masonry_collapse") : t("masonry_expand")}
        >
          {game.intro!.trim()}
        </div>
      )}
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
