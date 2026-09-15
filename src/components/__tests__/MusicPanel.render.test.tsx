// 音乐面板的渲染测试：曲目列表只显示文件名（不显示路径）、当前曲高亮、
// 三种循环模式按钮都在、进度与音量按当前值渲染。
//
// 与 GameDetailPage 的 render 测试同一套做法：用 react-dom/server 渲染，
// 不需要 jsdom（renderToString 不跑 useEffect，store 用假状态直接喂）。

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

// 变量名必须以 mock 开头：vi.mock 的工厂会被提升到文件顶部执行。
const mockPanelState = {
  tracks: [
    { name: "千千阙歌", rel: "千千阙歌.mp3", url: "/music/a.mp3", group: "" },
    { name: "海阔天空", rel: "粤语/海阔天空.mp3", url: "/music/b.mp3", group: "粤语" },
  ],
  trackIndex: 1,
  playing: true,
  mode: "sequential" as const,
  volume: 40,
  currentTime: 65,
  duration: 245,
  playTrack: vi.fn(),
  seek: vi.fn(),
};

vi.mock("../../stores/musicStore", () => ({
  useMusicStore: (sel: (s: typeof mockPanelState) => unknown) => sel(mockPanelState),
}));

vi.mock("../../i18n", () => ({
  useI18n: () => ({ t: (k: string) => `[${k}]` }),
}));

import MusicPanel from "../MusicPanel";

function render() {
  return renderToString(
    <MusicPanel onClose={() => {}} onSetMode={() => {}} onSetVolume={() => {}} />
  );
}

describe("MusicPanel", () => {
  it("曲目列表只显示文件名（子目录名另给），当前曲有高亮", () => {
    const html = render();
    expect(html).toContain("千千阙歌");
    expect(html).toContain("海阔天空");
    expect(html).toContain("粤语"); // 子目录名作为小标签
    expect(html).not.toContain("粤语/海阔天空.mp3"); // 不显示相对路径
    expect(html).toContain("is-current"); // 当前曲高亮
  });

  it("进度与音量按当前值渲染（65s / 245s / 40）", () => {
    const html = render();
    expect(html).toContain("1:05");
    expect(html).toContain("4:05");
    expect(html).toContain('value="40"'); // 音量滑杆
    expect(html).toContain('max="245"'); // 进度滑杆量程 = 时长
  });

  it("三种循环模式按钮都在，且当前模式高亮", () => {
    const html = render();
    expect(html).toContain("music_mode_shuffle");
    expect(html).toContain("music_mode_sequential");
    expect(html).toContain("music_mode_single");
    expect(html).toContain("music-btn-on"); // 当前模式（sequential）高亮
  });

  // 2026-09-15 需求：曲目名字前加序号。序号 = 1 起的列表位置（= 队列顺序）。
  it("曲目列表每项名字前有序号（1 起，且排在名字前面）", () => {
    const html = render();
    const idx1 = html.indexOf('music-panel-item-index">1<');
    const idx2 = html.indexOf('music-panel-item-index">2<');
    const name1 = html.indexOf('music-panel-item-name">千千阙歌<');
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(name1).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(name1); // 序号在名字之前
    expect(idx1).toBeLessThan(idx2); // 按列表顺序递增
  });
});
