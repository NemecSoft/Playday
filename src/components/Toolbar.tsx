// Toolbar: search box only. Settings lives in the TitleBar app menu now.
//
// The search input is the primary "always-ready" action:
//   - it auto-focuses on mount and after each search/game load
//   - the global "/" (or Ctrl+F) shortcut jumps focus into it
// so the user can start typing a pinyin search at any time.

import { useEffect, useLayoutEffect, useRef } from "react";
import { LayoutGrid, Globe } from "lucide-react";
import { useGamesStore } from "../stores/gamesStore";
import { useI18n } from "../i18n";

export default function Toolbar() {
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const setSearch = useGamesStore((s) => s.setSearch);
  const viewMode = useGamesStore((s) => s.viewMode);
  const setViewMode = useGamesStore((s) => s.setViewMode);
  const loading = useGamesStore((s) => s.loading);
  const games = useGamesStore((s) => s.games);
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const focusSearch = () => {
    const el = inputRef.current;
    if (el) {
      el.focus({ preventScroll: true });
      try {
        el.select();
      } catch {
        /* ignore */
      }
    }
  };

  // Auto-focus the search box synchronously on mount, then re-focus after the
  // library finishes loading. requestAnimationFrame/setTimeout are avoided
  // because some WebView2 versions drop the focus when the game grid paints
  // right after mount.
  useLayoutEffect(() => {
    focusSearch();
  }, []);

  useEffect(() => {
    if (loading) return;
    // Re-focus once the library has loaded (game cards may have stolen focus).
    const t = setTimeout(focusSearch, 60);
    return () => clearTimeout(t);
  }, [loading, games.length]);

  // Global "/" (and Ctrl+F) shortcut focuses the search box.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" || tag === "textarea" || target?.isContentEditable;

      // Ctrl+F focuses the search box too (browsers' built-in find is disabled
      // in webview but the gesture is familiar).
      if ((e.key === "/" && !isEditable) || (e.ctrlKey && e.key.toLowerCase() === "f")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Refocus the search box when a modal (e.g. the startup announcement) closes
  // and might have stolen focus. Any code can trigger `window.dispatchEvent(
  // new Event("yungame:focus-search"))`.
  useEffect(() => {
    const onFocusSearch = () => focusSearch();
    window.addEventListener("yungame:focus-search", onFocusSearch);
    return () => window.removeEventListener("yungame:focus-search", onFocusSearch);
  }, []);

  return (
    <div className="toolbar">
      <div className="search-box">
        <input
          ref={inputRef}
          type="text"
          autoFocus
          placeholder={t("toolbar_searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="view-switcher">
        <button
          type="button"
          className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
          title={t("view_grid")}
          onClick={() => setViewMode("grid")}
        >
          <LayoutGrid size={15} />
          <span>{t("view_grid")}</span>
        </button>
        <button
          type="button"
          className={`view-btn ${viewMode === "planet" ? "active" : ""}`}
          title={t("view_planet")}
          onClick={() => setViewMode("planet")}
        >
          <Globe size={15} />
          <span>{t("view_planet")}</span>
        </button>
      </div>
    </div>
  );
}