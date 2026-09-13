// "启动游戏时暂停背景音乐"这条规则的守卫。
//
// 为什么值得单独测：实现只有一行调用，但它有个很容易在后续重构里被挪错的位置 ——
// launchGame 开头有两条**还没有真的启动**的出口（等级不够 / 等用户在弹窗里选启动项），
// 把暂停挪到函数开头，就会变成"点了一下但游戏没起来，音乐却被掐了"。
//
// 顺带钉住另一半决定：**故意不做"游戏退出后自动恢复"**。主进程的 game_exited 只在
// saveBackupMode=ask 且该游戏配了存档路径时才推给前端（electron/ipc/saveManager.ts），
// 拿它当"游戏结束"信号会时灵时不灵；现在的行为是"只停不恢复"，想继续听点一下播放即可。

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted：这些 mock 必须比 import 先就绪（vi.mock 的工厂在 import 期间执行，
// 直接引用模块顶层的变量会踩 TDZ）。
const { canPlayMock, launchGameMock, showNotificationMock } = vi.hoisted(() => ({
  canPlayMock: vi.fn(() => true),
  launchGameMock: vi.fn(async (): Promise<{ launched: boolean; error?: string }> => ({ launched: true })),
  showNotificationMock: vi.fn(async () => undefined),
}));

vi.mock("../../api/client", () => ({
  api: { launchGame: launchGameMock, showNotification: showNotificationMock },
}));
vi.mock("../../i18n", () => ({ t: (key: string) => key }));
vi.mock("../../utils/assets", () => ({ preloadImages: vi.fn(async () => undefined) }));
vi.mock("../authStore", () => ({ useAuthStore: { getState: () => ({ canPlay: canPlayMock }) } }));

import { useGamesStore } from "../gamesStore";
import { useMusicStore } from "../musicStore";
import type { Game } from "../../types/models";

/** 一个可启动的动作（只有 isPlayAction=true 的才参与启动）。 */
const playAction = (id: string) => ({
  id,
  name: `启动 ${id}`,
  type: "File" as const,
  path: `D:/SC/${id}.exe`,
  isPlayAction: true,
  trackGame: true,
});

/** 造一个游戏。Game 字段多，测试只关心 id/name/gameLevel/actions，其余用断言绕过。 */
function makeGame(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "星际争霸",
    gameLevel: 1,
    actions: [playAction("a1")],
    ...over,
  } as unknown as Game;
}

beforeEach(() => {
  // 三个 mock 都要清调用记录：否则上一个用例的调用会让后面的
  // `not.toHaveBeenCalled()` 直接失败（这里踩过）。
  canPlayMock.mockClear().mockReturnValue(true);
  launchGameMock.mockClear().mockResolvedValue({ launched: true });
  showNotificationMock.mockClear();
  useGamesStore.setState({ games: [makeGame()], pendingLaunch: null, launchingGame: null });
  // 每个用例都从"音乐正在放"开始。
  useMusicStore.setState({ playing: true });
});

describe("启动游戏：背景音乐让位", () => {
  it("启动成功 → 音乐被暂停", async () => {
    const ok = await useGamesStore.getState().launchGame("g1");
    expect(ok).toBe(true);
    expect(launchGameMock).toHaveBeenCalledWith("g1", "a1");
    expect(useMusicStore.getState().playing).toBe(false);
  });

  it("等级不够、根本没有启动 → 不许把音乐掐掉", async () => {
    canPlayMock.mockReturnValue(false);
    const ok = await useGamesStore.getState().launchGame("g1");
    expect(ok).toBe(false);
    expect(launchGameMock).not.toHaveBeenCalled();
    expect(useMusicStore.getState().playing).toBe(true);
  });

  it("有多个启动项（先弹选择窗）→ 选之前音乐照放，选定后才暂停", async () => {
    useGamesStore.setState({ games: [makeGame({ actions: [playAction("a1"), playAction("a2")] })] });

    const first = await useGamesStore.getState().launchGame("g1");
    expect(first).toBe(false); // 停在"等用户选"
    expect(useGamesStore.getState().pendingLaunch?.actions).toHaveLength(2);
    expect(useMusicStore.getState().playing).toBe(true); // 还没启动，别掐

    await useGamesStore.getState().launchGame("g1", "a2");
    expect(launchGameMock).toHaveBeenCalledWith("g1", "a2");
    expect(useMusicStore.getState().playing).toBe(false);
  });

  it("启动失败也不把音乐放回来（刻意不做自动恢复）", async () => {
    launchGameMock.mockResolvedValue({ launched: false, error: "文件不存在" });
    const ok = await useGamesStore.getState().launchGame("g1");
    expect(ok).toBe(false);
    expect(showNotificationMock).toHaveBeenCalled(); // 失败原因必须告诉用户
    expect(useMusicStore.getState().playing).toBe(false);
  });
});
