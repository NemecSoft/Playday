// 右键菜单的等级门禁回归测试（2026-09-14 需求：「等级不够的游戏只能看详情」——
// 右键菜单里**不显示**「开始游戏」，也**不显示**「备份游戏存档」）。
//
// 断言方式：不看文案（那是 i18n 的事），看**图标**——lucide 图标渲染出来带
// `lucide-play` / `lucide-info` / `lucide-database-backup` 类名，语种无关、稳定。
// 用 renderToString 不跑 effect；等级用 zustand 的 setState 直接摆（组件只读它）。
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import GameContextMenu from "../GameContextMenu";
import { useAuthStore } from "../../stores/authStore";
import type { Game } from "../../types/models";

function render(gameLevel: number, userLevel: number) {
  useAuthStore.setState({ userLevel }); // 1 = 黄金版，2 = 钻石版
  const game = { id: "g1", name: "测试游戏", gameLevel } as Game;
  return renderToString(
    <MemoryRouter>
      <GameContextMenu game={game} x={0} y={0} onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe("GameContextMenu 等级门禁", () => {
  it("等级不够：只有「详情」（不给开始游戏、不给备份存档）", () => {
    const html = render(2, 1); // 黄金版看钻石版游戏
    expect(html).toContain("lucide-info"); // 详情：保留
    expect(html).not.toContain("lucide-play"); // 开始游戏：不显示
    expect(html).not.toContain("lucide-database-backup"); // 备份游戏存档：不显示
  });

  it("等级够：三项齐全", () => {
    const html = render(2, 2); // 钻石版看钻石版游戏
    expect(html).toContain("lucide-play");
    expect(html).toContain("lucide-info");
    expect(html).toContain("lucide-database-backup");
  });

  it("黄金版看黄金版游戏（gameLevel 1）：三项齐全", () => {
    const html = render(1, 1);
    expect(html).toContain("lucide-play");
    expect(html).toContain("lucide-database-backup");
  });
});
