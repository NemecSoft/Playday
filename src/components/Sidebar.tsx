// 左侧标签栏（VS Code Activity Bar 成熟模式）：
//  - 一个固定的 toggle 按钮常驻在左边缘、屏幕垂直居中（永不随内容滚动）。
//  - 点击它向左"推出"抽屉（标签栏）；再点同一个按钮"收回"抽屉。
//  - 按钮文案随状态切换：收起显示"点击这里按标签搜索游戏"，展开显示"关闭侧边栏"。
//  - 抽屉内有标签搜索框 + 按标签筛选；右侧拖动条可调宽度（160..600px），持久化到设置。
//
// 设计依据（成熟方案）：VS Code / Edge / Slack 的侧栏 toggle 模式——
//   抽屉外一个固定锚点按钮控制开合，按钮和抽屉解耦，天然不被抽屉内容滚动影响，
//   也没有"两个按钮样式不一致"或"鼠标移开误关闭"的问题。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useGamesStore } from "../stores/gamesStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useI18n } from "../i18n";
import { Input } from "./ui/input";

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 600;

export default function Sidebar() {
  const games = useGamesStore((s) => s.games);
  const selectedTags = useGamesStore((s) => s.selectedTags);
  const toggleTag = useGamesStore((s) => s.toggleTag);
  const clearTags = useGamesStore((s) => s.clearTags);
  const sidebarVisible = useGamesStore((s) => s.sidebarVisible);
  const toggleSidebar = useGamesStore((s) => s.toggleSidebar);
  const sidebarWidth = useSettingsStore((s) => s.settings.sidebarWidth);
  const saveSettings = useSettingsStore((s) => s.save);
  const { t } = useI18n();

  // 标签搜索词：只过滤侧边栏里显示的标签，不影响 gamesStore 的全局搜索。
  const [tagQuery, setTagQuery] = useState("");

  // 本地宽度：拖动时即时更新 UI，拖动结束才持久化到后端。
  const [liveWidth, setLiveWidth] = useState(sidebarWidth);
  useEffect(() => {
    if (!draggingRef.current) setLiveWidth(sidebarWidth);
  }, [sidebarWidth]);

  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // 鼠标按下拖动条时进入"拖动中"状态。抽屉内的拖动条不触发布局切换。
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

  // 按标签聚合（含计数，按频次排序）。
  // 防御性过滤：跳过 "Tag: " 开头的旧自动标签残留，只显示正常标签。
  const tagStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of games) {
      for (const tag of g.tags) {
        const k = tag.trim();
        if (!k) continue;
        if (/^Tag:\s*/i.test(k)) continue; // 跳过旧的自动标签
        map.set(k, (map.get(k) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [games]);

  // 根据搜索词过滤标签列表（不区分大小写、中文包含匹配）。
  const visibleTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return tagStats;
    return tagStats.filter(({ name }) => name.toLowerCase().includes(q));
  }, [tagStats, tagQuery]);

  // 一个固定 toggle 按钮 + 一个抽屉（抽屉展开时才渲染）。
  return (
    <div className="sidebar-root">
      {/* 固定 toggle 按钮：常驻左边缘、垂直居中，点击开合抽屉。
          它是"推出抽屉/收回抽屉"的同一把钥匙，文案随状态变化。 */}
      <button
        className={`sidebar-toggle-btn ${sidebarVisible ? "open" : ""}`}
        onClick={toggleSidebar}
        title={sidebarVisible ? t("sidebar_close") : t("sidebar_handle_hint")}
        aria-label={sidebarVisible ? t("sidebar_close") : t("sidebar_handle_hint")}
        aria-expanded={sidebarVisible}
      >
        {sidebarVisible ? t("sidebar_close") : t("sidebar_handle_hint")}
      </button>

      {/* 抽屉（标签栏）：只有展开时渲染。宽度可调。 */}
      {sidebarVisible && (
        <aside
          className="sidebar-panel"
          style={{ width: `${liveWidth}px` } as CSSProperties}
        >
          {/* 顶部：标题 */}
          <div className="sidebar-header">
            <span className="sidebar-header-title">{t("sidebar_title")}</span>
          </div>

          <div className="sidebar-tag-search">
            <Input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder={t("sidebar_tagSearch")}
              aria-label={t("sidebar_tagSearch")}
            />
          </div>

          {/* 已勾选的标签：显示清空按钮，方便用户快速取消全部筛选 */}
          {selectedTags.length > 0 && (
            <div className="sidebar-clear-row">
              {/* 用 JS 模板字符串直接拼数字，避免 i18next 插值不稳定。 */}
              <span className="sidebar-clear-info">
                {`已选 ${selectedTags.length} 个标签`}
              </span>
              <button className="sidebar-clear-btn" onClick={clearTags}>
                {t("sidebar_clear")}
              </button>
            </div>
          )}

          <div className="sidebar-tag-list">
            {visibleTags.map(({ name, count }) => {
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
            {visibleTags.length === 0 && (
              <div className="sidebar-empty">{t("sidebar_noTags")}</div>
            )}
          </div>

          {/* 右侧拖动条：拖动调宽度。 */}
          <div
            className="sidebar-resizer"
            onMouseDown={onResizeMouseDown}
            title={t("sidebar_resize")}
          />
        </aside>
      )}
    </div>
  );
}
