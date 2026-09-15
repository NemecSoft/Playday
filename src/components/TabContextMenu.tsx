// 顶栏标签的**右键菜单**（2026-09-15 需求）：一键关掉"其它游戏标签" / "全部游戏标签"。
// 起因：游戏标签上限是 10 个，开满以后一个个去点 ✕ 太烦 —— 这是那条上限的配套出口。
//
// 出现哪些项（都是"能力"判断，不看当前状态）：
//   · 游戏标签上右键 → 关闭此标签 / 关闭其它游戏标签 / 关闭全部游戏标签
//     （只剩 1 个游戏标签时"关闭其它"没意义，不显示）
//   · 固定标签上右键 → **只有**"关闭全部游戏标签"：它们本身不可关（是入口），
//     但"把这些游戏标签都清掉"是合理诉求，右键"主页"就能用。
//   · 一个游戏标签都没有 → 干脆不显示菜单（没一项可用，弹个空框像 bug）。
//
// 关闭后的落脚点（退到哪个标签、历史怎么裁）全在 src/utils/tabs.ts，这里只管点哪一项。

import { CircleX, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n";
import { useUIStore } from "../stores/uiStore";
import { isGameTabId, type TabId } from "../utils/tabs";
import { ContextMenu, ContextMenuItem } from "./ui/context-menu";

interface Props {
  /** 被右键的那个标签。 */
  tabId: TabId;
  x: number;
  y: number;
  onClose: () => void;
}

export default function TabContextMenu({ tabId, x, y, onClose }: Props) {
  const { t } = useI18n();
  const tabs = useUIStore((s) => s.tabState.tabs);
  const closeTab = useUIStore((s) => s.closeTab);
  const closeGameTabs = useUIStore((s) => s.closeGameTabs);

  const isGame = isGameTabId(tabId);
  const gameCount = tabs.filter((tab) => isGameTabId(tab.id)).length;
  if (gameCount === 0) return null;

  // 每一项都是"先执行、再关菜单"（外壳不替它关，见 ui/context-menu.tsx 的说明）。
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <ContextMenu x={x} y={y} minWidth={160} onClose={onClose}>
      {isGame && (
        <ContextMenuItem
          icon={<X size={14} />}
          label={t("tab_menu_close")}
          onClick={run(() => closeTab(tabId))}
        />
      )}
      {isGame && gameCount > 1 && (
        <ContextMenuItem
          icon={<CircleX size={14} />}
          label={t("tab_menu_closeOthers")}
          onClick={run(() => closeGameTabs(tabId))}
        />
      )}
      <ContextMenuItem
        icon={<Trash2 size={14} />}
        label={t("tab_menu_closeAll")}
        onClick={run(() => closeGameTabs())}
        danger
      />
    </ContextMenu>
  );
}
