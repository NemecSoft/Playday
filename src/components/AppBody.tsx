// Layout of the main app: the browser-style TopBar and the bottom status bar
// are rendered separately by App.tsx (so the status bar also shows on the
// game detail page). AppBody just composes sidebar + main content.
// The sidebar (tag filtering) is only relevant on the Home tab;
// Videos / Tools tabs get the full content width.

import Sidebar from "./Sidebar";
import MainContent from "./MainContent";
import { useUIStore } from "../stores/uiStore";

export default function AppBody() {
  const activeTab = useUIStore((s) => s.activeTab);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {activeTab === "home" && <Sidebar />}
        <MainContent />
      </div>
    </div>
  );
}