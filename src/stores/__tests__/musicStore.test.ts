// 背景音乐 store 的行为测试。
//
// 为什么要测到这一层：这里有几条**很容易被后来的改动破坏、但界面上一时看不出来**的规则 ——
//   ① 放视频时"让位"暂停，关掉视频后**只有本来在放**才恢复；
//   ② 用户中途自己接管过（手动播/暂停），关掉视频后**不许**再擅自恢复；
//   ③ 切循环模式不打断当前这首；单曲模式"自动播完重放、手动下一首换曲"。
//
// 做法：造一个假 <audio>（只实现 store 用到的那几个成员）+ 一个假的 window，
// 这样在 node 环境里也能观察"到底有没有真的去播"（play 调用次数）。

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({ api: { getMusicLibrary: vi.fn() } }));

/** 假 <audio>：记录 play/pause 调用，供断言"该不该恢复播放"。 */
class FakeAudio {
  static last: FakeAudio | null = null;
  preload = "";
  src = "";
  volume = 1;
  currentTime = 0;
  /** 元数据没到 = 0（与真实实现一致） */
  duration = 0;
  ended = false;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  private listeners = new Map<string, Array<() => void>>();

  constructor() {
    FakeAudio.last = this;
  }

  addEventListener(type: string, fn: () => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  play() {
    this.playCalls += 1;
    this.paused = false;
    this.emit("playing");
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
    this.emit("pause");
  }

  private emit(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
}

// store 里的 ensureAudio() 会先看 typeof window —— node 环境里没有 window，
// 所以先补一个假的，再把 Audio 换成上面的假实现。
(globalThis as unknown as { window: unknown }).window = {};
(globalThis as unknown as { Audio: unknown }).Audio = FakeAudio;

import { useMusicStore } from "../musicStore";

/** 三条测试曲目。 */
const TRACKS = [
  { name: "甲", rel: "甲.mp3", url: "/music/a.mp3", group: "" },
  { name: "乙", rel: "乙.mp3", url: "/music/b.mp3", group: "" },
  { name: "丙", rel: "丙.mp3", url: "/music/c.mp3", group: "" },
];

/** 把 store 摆到"正在放第 0 首"的状态，并拿到假 audio。 */
function resetPlaying() {
  useMusicStore.setState({
    tracks: TRACKS,
    loaded: true,
    playing: true,
    volume: 50,
    mode: "shuffle",
    currentTime: 12,
    duration: 0,
    order: [0, 1, 2],
    pos: 0,
    trackIndex: 0,
  });
  // 触发一次播放：ensureAudio 会创建假 audio（src 与真实曲目对齐）
  useMusicStore.getState().play();
  const fake = FakeAudio.last!;
  fake.playCalls = 0;
  fake.pauseCalls = 0;
  return fake;
}

describe("视频让位：暂停背景音乐，并且只有本来在放才恢复", () => {
  beforeEach(() => {
    useMusicStore.setState({ playing: false });
  });

  it("内置播放器：让位 → 暂停；关掉视频 → 自动恢复", () => {
    const fake = resetPlaying();
    useMusicStore.getState().duckForVideo();
    expect(useMusicStore.getState().playing).toBe(false);
    expect(fake.pauseCalls).toBeGreaterThan(0);

    useMusicStore.getState().unduckAfterVideo();
    expect(fake.playCalls).toBe(1); // 恢复了一次
  });

  it("本来就没在放 → 关掉视频不会突然开始放", () => {
    const fake = resetPlaying();
    useMusicStore.setState({ playing: false });
    fake.playCalls = 0;

    useMusicStore.getState().duckForVideo();
    useMusicStore.getState().unduckAfterVideo();
    expect(fake.playCalls).toBe(0);
  });

  it("系统播放器（resume:false）：暂停但不自动恢复", () => {
    const fake = resetPlaying();
    useMusicStore.getState().duckForVideo({ resume: false });
    expect(useMusicStore.getState().playing).toBe(false);

    useMusicStore.getState().unduckAfterVideo();
    expect(fake.playCalls).toBe(0);
  });

  it("浮层里连点几个视频：只有第一次让位才记「本来在放」", () => {
    const fake = resetPlaying();
    useMusicStore.getState().duckForVideo(); // 第一次：本来在放
    useMusicStore.getState().duckForVideo(); // 第二次：此时已经暂停
    useMusicStore.getState().unduckAfterVideo();
    expect(fake.playCalls).toBe(1); // 仍然恢复（不会被第二次误记成"本来没放"）
  });

  it("用户中途手动接管过 → 关掉视频不再擅自恢复", () => {
    const fake = resetPlaying();
    useMusicStore.getState().duckForVideo();
    useMusicStore.getState().play(); // 用户自己点播放
    fake.playCalls = 0;
    useMusicStore.getState().unduckAfterVideo();
    expect(fake.playCalls).toBe(0);
  });
});

describe("播放模式：切模式不打断、单曲自动重放", () => {
  it("setMode 只重排队列：当前这首不变", () => {
    resetPlaying();
    useMusicStore.setState({ trackIndex: 2, pos: 0, order: [2, 0, 1] });
    useMusicStore.getState().setMode("sequential");
    const st = useMusicStore.getState();
    expect(st.mode).toBe("sequential");
    expect(st.trackIndex).toBe(2); // 还在放同一首
    expect(st.order).toEqual([0, 1, 2]); // 但队列变成顺序
  });

  it("单曲模式：自动播完重放当前曲；手动下一首换曲", () => {
    resetPlaying();
    useMusicStore.getState().setMode("single");
    useMusicStore.setState({ trackIndex: 1, pos: 1 });
    useMusicStore.getState().next(true); // 自动播完
    expect(useMusicStore.getState().trackIndex).toBe(1);
    useMusicStore.getState().next(); // 手动下一首
    expect(useMusicStore.getState().trackIndex).toBe(2);
  });
});

describe("点歌与拖进度", () => {
  it("playTrack：列表里点哪首就放哪首", () => {
    resetPlaying();
    useMusicStore.getState().playTrack(2);
    expect(useMusicStore.getState().trackIndex).toBe(2);
  });

  it("seek：写进 currentTime，并按当前时长夹住越界值", () => {
    const fake = resetPlaying();
    fake.duration = 100;
    useMusicStore.getState().seek(30);
    expect(useMusicStore.getState().currentTime).toBe(30);
    expect(fake.currentTime).toBe(30);

    useMusicStore.getState().seek(999); // 超过时长 → 夹到 100
    expect(useMusicStore.getState().currentTime).toBe(100);
    useMusicStore.getState().seek(-5); // 负数 → 夹到 0
    expect(useMusicStore.getState().currentTime).toBe(0);
  });

  it("seek：非法值不写入 NaN（拖出 NaN 不该让进度条炸掉）", () => {
    resetPlaying();
    useMusicStore.getState().seek(Number.NaN);
    expect(Number.isFinite(useMusicStore.getState().currentTime)).toBe(true);
    expect(useMusicStore.getState().currentTime).toBe(0);
  });
});
