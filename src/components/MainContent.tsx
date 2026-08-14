// Main content area: renders the active top-level tab.
//   home   -> toolbar + library views (grid/list/details) or news page
//   videos -> videos tab
//   tools  -> extra tools tab

import { motion, AnimatePresence } from "framer-motion";
import Toolbar from "./Toolbar";
import GamesView from "./views/GamesView";
import NewsView from "./views/NewsView";
import VideosView from "./views/VideosView";
import ToolsView from "./views/ToolsView";
import { useGamesStore } from "../stores/gamesStore";
import { useUIStore } from "../stores/uiStore";

export default function MainContent() {
  const loading = useGamesStore((s) => s.loading);
  const activePage = useGamesStore((s) => s.activePage);
  const activeTab = useUIStore((s) => s.activeTab);

  // Identify the active view so switching tabs animates a fade/slide. The
  // animation is cheap (opacity + small y) and only runs on tab switch — it
  // does not affect scrolling within the virtualized GamesView.
  let viewKey: string;
  let view: React.ReactNode;
  if (activeTab === "videos") {
    viewKey = "videos";
    view = <VideosView />;
  } else if (activeTab === "tools") {
    viewKey = "tools";
    view = <ToolsView />;
  } else if (activePage === "news") {
    viewKey = "news";
    view = <NewsView />;
  } else {
    viewKey = loading ? "loading" : "home";
    view =
      activeTab === "home" && !loading ? (
        <>
          <Toolbar />
          <GamesView />
        </>
      ) : activeTab === "home" ? (
        <>
          <Toolbar />
          <div className="grid h-full place-items-center">
            <div className="size-[26px] animate-spin rounded-full border-[3px] border-border border-t-accent" />
          </div>
        </>
      ) : null;
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={viewKey}
          className="flex flex-1 flex-col overflow-hidden"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {view}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
