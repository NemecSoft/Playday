// Left sidebar: only the tag list (no title, no search box, no collapse
// button). Auto-hides on mouseleave; re-appears when the user moves the mouse
// onto the vertical hint strip on the left edge.
//
// The sidebar is user-resizable: a drag handle on the right edge adjusts the
// width (range 160..600px). Width persists to the app settings on drag-end
// (the local state is used during drag for responsive UI without spamming
// the backend).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useGamesStore } from "../stores/gamesStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useI18n } from "../i18n";

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 600;

export default function Sidebar() {
  const games = useGamesStore((s) => s.games);
  const selectedTags = useGamesStore((s) => s.selectedTags);
  const toggleTag = useGamesStore((s) => s.toggleTag);
  const sidebarVisible = useGamesStore((s) => s.sidebarVisible);
  const setSidebarVisible = useGamesStore((s) => s.setSidebarVisible);
  const sidebarWidth = useSettingsStore((s) => s.settings.sidebarWidth);
  const saveSettings = useSettingsStore((s) => s.save);
  const { t } = useI18n();

  // Local width while dragging so the UI updates instantly without spamming
  // the backend. Persisted to settings on drag-end.
  const [liveWidth, setLiveWidth] = useState(sidebarWidth);
  useEffect(() => {
    if (!draggingRef.current) setLiveWidth(sidebarWidth);
  }, [sidebarWidth]);

  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = liveWidth;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [liveWidth]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      const next = Math.max(
        SIDEBAR_MIN,
        Math.min(SIDEBAR_MAX, startWidthRef.current + dx)
      );
      setLiveWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      void saveSettings({ sidebarWidth: liveWidth });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [liveWidth, saveSettings]);

  // Aggregate tags from all games with counts (sorted by frequency).
  const tagStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of games) {
      for (const tag of g.tags) {
        const k = tag.trim();
        if (!k) continue;
        map.set(k, (map.get(k) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [games]);

  return (
    <aside
      className={`sidebar ${sidebarVisible ? "" : "collapsed"}`}
      style={{ "--sidebar-width": `${liveWidth}px` } as CSSProperties}
      onMouseLeave={() => setSidebarVisible(false)}
    >
      {sidebarVisible ? (
        <>
          <div className="sidebar-tag-list">
            {tagStats.map(({ name, count }) => {
              const checked = selectedTags.includes(name);
              return (
                <label
                  key={name}
                  className={`sidebar-tag ${checked ? "checked" : ""}`}
                  title={`#${name} (${count})`}
                >
                  <span className="sidebar-tag-name">#{name}</span>
                  <span className="sidebar-tag-meta">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTag(name)}
                    />
                    <span className="count">{count}</span>
                  </span>
                </label>
              );
            })}
            {tagStats.length === 0 && (
              <div className="sidebar-empty">{t("sidebar_noTags")}</div>
            )}
          </div>
          <div
            className="sidebar-resizer"
            onMouseDown={onResizeMouseDown}
            title={t("sidebar_resize")}
          />
        </>
      ) : (
        // 折叠时：显示竖排提示窄条。它占布局流宽度，主内容区会被 flex 自动推开，
        // 从而不会遮挡游戏卡片（比之前的 position: fixed 覆盖方案更稳）。
        <div
          className="sidebar-handle"
          onMouseEnter={() => setSidebarVisible(true)}
          onClick={() => setSidebarVisible(true)}
          title={t("sidebar_open")}
        >
          {t("sidebar_handle_hint")}
        </div>
      )}
    </aside>
  );
}