// Layout of the main app: the new browser-style TopBar is rendered separately
// by App.tsx. AppBody just composes (sidebar + main content) and the bottom
// status bar. The sidebar (tag filtering) is only relevant on the Home tab;
// Videos / Tools tabs get the full content width.

import Sidebar from "./Sidebar";
import MainContent from "./MainContent";
import StatusBar from "./StatusBar";
import { useUIStore } from "../stores/uiStore";

export default function AppBody() {
  const activeTab = useUIStore((s) => s.activeTab);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {activeTab === "home" && <Sidebar />}
        <MainContent />
      </div>
      <StatusBar />
    </div>
  );
}