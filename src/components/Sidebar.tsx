// 左侧标签栏（VS Code Activity Bar 成熟模式）：
//  - 一个固定的 toggle 按钮常驻在左边缘、屏幕垂直居中（永不随内容滚动）。
//  - 点击它向左"推出"抽屉（标签栏）；再点同一个按钮"收回"抽屉。
//  - 按钮文案随状态切换：收起显示"鼠标点击这里，搜索喜欢的游戏"，展开显示"关闭侧边栏"。
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { facetValuesOf, type FacetKey } from "../utils/selectors";
import WhoIsOnline from "./community/WhoIsOnline";

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 600;

// 侧栏可选的筛选维度（顶部下拉框选项）。默认是「标签」。
const FACET_OPTIONS: { value: FacetKey; labelKey: string }[] = [
  { value: "tag", labelKey: "facet_tag" },
  { value: "genre", labelKey: "facet_genre" },
  { value: "series", labelKey: "facet_series" },
  { value: "region", labelKey: "facet_region" },
  { value: "decade", labelKey: "facet_decade" },
];

export default function Sidebar() {
  const games = useGamesStore((s) => s.games);
  const facet = useGamesStore((s) => s.facet);
  const facetValues = useGamesStore((s) => s.facetValues);
  const facetMode = useGamesStore((s) => s.facetMode);
  const setFacet = useGamesStore((s) => s.setFacet);
  const toggleFacetValue = useGamesStore((s) => s.toggleFacetValue);
  const clearFacetValues = useGamesStore((s) => s.clearFacetValues);
  const setFacetMode = useGamesStore((s) => s.setFacetMode);
  const sidebarVisible = useGamesStore((s) => s.sidebarVisible);
  const toggleSidebar = useGamesStore((s) => s.toggleSidebar);
  const sidebarWidth = useSettingsStore((s) => s.settings.sidebarWidth);
  const saveSettings = useSettingsStore((s) => s.save);
  const { t } = useI18n();

  // 列表搜索词：只过滤侧边栏里显示的值，不影响 gamesStore 的全局搜索。
  const [listQuery, setListQuery] = useState("");

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

  // 按当前维度聚合（含计数）。标签维度跳过 "Tag: " 开头的旧自动标签残留。
  const facetStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of games) {
      for (const raw of facetValuesOf(g, facet)) {
        const k = raw.trim();
        if (!k) continue;
        if (facet === "tag" && /^Tag:\s*/i.test(k)) continue; // 跳过旧的自动标签
        map.set(k, (map.get(k) || 0) + 1);
      }
    }
    const list = Array.from(map.entries()).map(([name, count]) => ({ name, count }));
    if (facet === "decade") {
      // 年代按时间正序（1980s → 2020s），"未知"之类非年份标签排最后。
      const yearOf = (n: string) =>
        /^\d{4}s$/.test(n) ? Number(n.slice(0, 4)) : Number.MAX_SAFE_INTEGER;
      return list.sort((a, b) => yearOf(a.name) - yearOf(b.name) || a.name.localeCompare(b.name));
    }
    return list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [games, facet]);

  // 根据搜索词过滤列表（不区分大小写、中文包含匹配）。
  const visibleFacetValues = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return facetStats;
    return facetStats.filter(({ name }) => name.toLowerCase().includes(q));
  }, [facetStats, listQuery]);

  // 当前维度名（用于"已选 N 个XX"文案）。
  const facetLabelKey = FACET_OPTIONS.find((o) => o.value === facet)?.labelKey ?? "facet_tag";

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
          {/* 顶部：标题 + 重置（重置只清空已勾选的值，维度与 AND/OR 不变） */}
          <div className="sidebar-header">
            <span className="sidebar-header-title">{t("sidebar_title")}</span>
            <button
              type="button"
              className="sidebar-reset"
              onClick={clearFacetValues}
              disabled={facetValues.length === 0}
              title={t("sidebar_reset")}
            >
              {t("sidebar_reset")}
            </button>
          </div>

          {/* 维度下拉：决定侧栏列什么、拿什么筛。默认「标签」。 */}
          <div className="sidebar-facet-row">
            <span className="sidebar-facet-label">{t("facet_label")}</span>
            <Select value={facet} onValueChange={(v) => setFacet(v as FacetKey)}>
              <SelectTrigger className="sidebar-select" aria-label={t("facet_label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 多选语义下拉：全部匹配（AND，默认）/ 任一匹配（OR）。 */}
          <div className="sidebar-facet-row">
            <span className="sidebar-facet-label">{t("facet_mode_label")}</span>
            <Select
              value={facetMode}
              onValueChange={(v) => setFacetMode(v as "and" | "or")}
            >
              <SelectTrigger className="sidebar-select" aria-label={t("facet_mode_label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">{t("facet_mode_and")}</SelectItem>
                <SelectItem value="or">{t("facet_mode_or")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sidebar-tag-search">
            <Input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder={t("sidebar_tagSearch")}
              aria-label={t("sidebar_tagSearch")}
            />
          </div>

          {/* 已勾选的值：显示清空按钮，方便用户快速取消全部筛选。
              数字用 JS 模板字符串直接拼（不走 i18next 插值，"已选 N 个"这行现状就是硬编码中文）。 */}
          {facetValues.length > 0 && (
            <div className="sidebar-clear-row">
              {/* 清空动作已移到标题右侧的「重置」按钮，这里只保留已选数量的提示。 */}
              <span className="sidebar-clear-info">
                {`已选 ${facetValues.length} 个${t(facetLabelKey)}`}
              </span>
            </div>
          )}

          <div className="sidebar-tag-list">
            {visibleFacetValues.map(({ name, count }) => {
              const checked = facetValues.includes(name);
              // "#" 前缀是标签的语义，其他维度显示纯名称。
              const display = facet === "tag" ? `#${name}` : name;
              return (
                <label
                  key={name}
                  className={`sidebar-tag ${checked ? "checked" : ""}`}
                  title={`${display} (${count})`}
                >
                  <span className="sidebar-tag-name">{display}</span>
                  <span className="sidebar-tag-meta">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFacetValue(name)}
                    />
                    <span className="count">{count}</span>
                  </span>
                </label>
              );
            })}
            {visibleFacetValues.length === 0 && (
              <div className="sidebar-empty">{t("sidebar_noFacetValues")}</div>
            )}
          </div>

          {/* 右侧拖动条：拖动调宽度。 */}
          <div
            className="sidebar-resizer"
            onMouseDown={onResizeMouseDown}
            title={t("sidebar_resize")}
          />
          {/* 社区氛围：谁在玩（可设置关闭） */}
          <WhoIsOnline />
        </aside>
      )}
    </div>
  );
}
