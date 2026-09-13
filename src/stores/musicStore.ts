// 背景音乐播放状态（zustand）+ 一个**模块级**的 <audio> 元素。
//
// 需求：进入主界面自动开始放、三种循环模式可切（单曲/顺序/随机）、状态栏能播放/暂停/
// 上一首/下一首、面板里能看进度/拖进度/调音量、放视频时音乐自动让位（暂停）。
// 分工：
//   · "该放第几首" = src/utils/musicQueue.ts（纯逻辑、有单测）；
//   · 这里做四件事：拉曲库（IPC get_music_library）、操作 <audio>、把状态暴露给控件、
//     把"程序自动推进"与"用户手动操作"区分开（单曲循环要重放还是换曲，只差这一个信号）。
//
// 为什么 <audio> 放模块级而不是 React 树里：切视图/重渲染/开关设置面板都不该打断播放；
// 而且全应用只能有一个播放器实例（多个 <audio> 会同时出声，听起来像回声）。
import { create } from "zustand";
import type { MusicMode } from "../../shared/models";
import { api } from "../api/client";
import {
  currentTrackIndex,
  isOrderValid,
  nextInQueue,
  orderFor,
  prevInQueue,
  reorderForMode,
} from "../utils/musicQueue";

export interface MusicTrack {
  name: string;
  rel: string;
  url: string;
  /** 所在子文件夹名（`rel` 的目录部分）；直接在音乐目录下时为空串。
   *  界面只显示文件名，同名文件靠这个分组名区分 —— 不显示完整路径。 */
  group: string;
}

/** 连续播放失败多少首就停下来（避免"整个目录都放不出来"时无限快速跳过）。 */
const MAX_CONSECUTIVE_ERRORS = 3;

let audio: HTMLAudioElement | null = null;
/** 当前已经设进 <audio> 的曲目（用它判断"要不要换 src"，而不是读 a.src —— 那是绝对化的 URL）。 */
let loadedRel: string | null = null;
let consecutiveErrors = 0;

/**
 * "视频让位"状态：
 *   ducking    —— 有一次"因为放视频而暂停"还没结束；
 *   duckResume —— 那次暂停之前音乐**本来是在放的**（关掉视频后要接着放）。
 * 为什么要记这两个标记：不记的话关掉视频就不知道该不该继续放 ——
 * 用户本来就没开音乐，看完视频音乐却突然响了，比不恢复更烦人。
 */
let ducking = false;
let duckResume = false;

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (audio) return audio;
  const a = new Audio();
  a.preload = "auto";
  // 一首放完 → 交给队列决定下一首。auto=true：单曲循环据此**重放当前曲**
  // （手动点"下一首"走 next(false)，不受单曲模式影响）。
  a.addEventListener("ended", () => useMusicStore.getState().next(true));
  a.addEventListener("playing", () => {
    consecutiveErrors = 0;
    useMusicStore.setState({ playing: true });
  });
  // 进度：timeupdate 约 4Hz。只有音乐面板订阅 currentTime/duration，
  // 状态栏那几个按钮不订阅，所以这个频率不会带来多余的渲染。
  a.addEventListener("timeupdate", () => {
    useMusicStore.setState({ currentTime: a.currentTime || 0 });
  });
  a.addEventListener("durationchange", () => {
    useMusicStore.setState({ duration: Number.isFinite(a.duration) ? a.duration : 0 });
  });
  a.addEventListener("pause", () => useMusicStore.setState({ playing: false }));
  a.addEventListener("error", () => {
    const st = useMusicStore.getState();
    consecutiveErrors += 1;
    console.warn("[music] 这首放不出来，跳过:", st.tracks[st.trackIndex]?.name ?? "?");
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error("[music] 连续多首播放失败，停止播放（检查音乐目录/文件格式）");
      useMusicStore.setState({ playing: false });
      return;
    }
    st.next();
  });
  audio = a;
  return a;
}

/** 把当前曲目设进 <audio> 并开始播放（内部用，别在组件里直接调）。 */
function playCurrent(): void {
  const a = ensureAudio();
  const st = useMusicStore.getState();
  const track = st.tracks[st.trackIndex];
  if (!a || !track) {
    useMusicStore.setState({ playing: false });
    return;
  }
  if (loadedRel !== track.rel) {
    loadedRel = track.rel;
    a.src = track.url;
  } else if (a.ended) {
    // 单曲循环：同一首放完了要再放一遍。此时 <audio> 停在结尾，必须显式回 0，
    // 否则有的实现会"一放就结束"，表现成"单曲循环不生效"。
    a.currentTime = 0;
  }
  a.volume = Math.max(0, Math.min(100, st.volume)) / 100;
  void a
    .play()
    .then(() => useMusicStore.setState({ playing: true }))
    .catch((e: unknown) => {
      // 自动播放被策略拦掉、或文件读不出来：不抛给上层，只是不放而已。
      console.warn("[music] 播放未开始:", e instanceof Error ? e.message : e);
      useMusicStore.setState({ playing: false });
    });
}

interface MusicState {
  tracks: MusicTrack[];
  /** 解析出来的音乐目录（设置界面显示用）。 */
  dir: string;
  /** 是否已经问过主进程（控件据此决定显不显示）。 */
  loaded: boolean;
  playing: boolean;
  /** 0~100 */
  volume: number;
  /** 播放模式：单曲循环 / 顺序循环 / 随机循环（音乐面板里切，存 config.json）。 */
  mode: MusicMode;
  /** 当前播放进度（秒）。 */
  currentTime: number;
  /** 当前曲目总时长（秒）；元数据还没到时为 0。 */
  duration: number;
  /** 播放顺序（曲目索引数组；随机模式是洗牌结果，顺序/单曲模式是 0,1,2…）。 */
  order: number[];
  /** 当前在 order 里的位置。 */
  pos: number;
  /** 当前曲目在 tracks 里的索引（-1 = 没有）。 */
  trackIndex: number;

  load: () => Promise<void>;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /**
   * 下一首。
   * @param auto true = 一首**自动放完**了（单曲循环据此重放当前曲）；
   *             省略 = 用户手动点了"下一首"（单曲模式也要真的换曲）。
   */
  next: (auto?: boolean) => void;
  prev: () => void;
  setVolume: (v: number) => void;
  /** 切播放模式：不打断当前这首（见 musicQueue.reorderForMode）。 */
  setMode: (mode: MusicMode) => void;
  /** 从列表里点某一首，直接播它。 */
  playTrack: (index: number) => void;
  /** 拖进度（秒）。 */
  seek: (sec: number) => void;
  /**
   * 放视频前让位：暂停音乐，并记住"本来在放"。
   * @param opts.resume 关掉视频后是否允许自动恢复 —— 外部播放器感知不到结束，传 false。
   */
  duckForVideo: (opts?: { resume?: boolean }) => void;
  /** 视频关掉后：若那次暂停前本来在放，就接着放。 */
  unduckAfterVideo: () => void;
}

export const useMusicStore = create<MusicState>((set, get) => ({
  tracks: [],
  dir: "",
  loaded: false,
  playing: false,
  volume: 50,
  mode: "shuffle",
  currentTime: 0,
  duration: 0,
  order: [],
  pos: -1,
  trackIndex: -1,

  // 拉曲库 + 按当前模式定好第一首（**不自动播**：播不播由设置决定，见 App 里的接线）。
  // 换音乐目录后重新调用即可（会重置队列）。模式取 store 里的当前值 ——
  // App 启动时会先把设置里的 mode 同步进来（异步 IPC 比它慢，所以顺序是对的）。
  load: async () => {
    try {
      const lib = await api.getMusicLibrary();
      // 子文件夹名在这里统一算出来（`rel` 是唯一事实来源，别让每个组件各切一次字符串）。
      const tracks: MusicTrack[] = (lib.tracks ?? []).map((t) => ({
        ...t,
        group: t.rel.includes("/") ? t.rel.slice(0, t.rel.lastIndexOf("/")) : "",
      }));
      if (tracks.length === 0) {
        loadedRel = null;
        audio?.pause();
        set({
          tracks: [],
          dir: lib.dir ?? "",
          loaded: true,
          playing: false,
          order: [],
          pos: -1,
          trackIndex: -1,
          currentTime: 0,
          duration: 0,
        });
        return;
      }
      const q = orderFor(tracks.length, get().mode);
      set({
        tracks,
        dir: lib.dir ?? "",
        loaded: true,
        order: q.order,
        pos: q.pos,
        trackIndex: currentTrackIndex(q.order, q.pos),
        currentTime: 0,
        duration: 0,
      });
    } catch (e) {
      console.warn("[music] 读取音乐目录失败:", e);
      set({ tracks: [], loaded: true, playing: false, order: [], pos: -1, trackIndex: -1 });
    }
  },

  play: () => {
    const st = get();
    // 用户手动播 = 接管，"视频让位"关系就此结束（关掉视频不该再自动恢复一次）。
    duckResume = false;
    if (st.tracks.length === 0) return;
    // 已经在放同一首就别重设 src（否则每次重渲染都会从头开始）。
    if (st.playing && loadedRel === st.tracks[st.trackIndex]?.rel) return;
    playCurrent();
  },

  pause: () => {
    duckResume = false;
    audio?.pause();
    set({ playing: false });
  },

  toggle: () => {
    if (get().playing) get().pause();
    else get().play();
  },

  // 下一首：mode 决定"到末尾怎么办"（随机重洗 / 顺序回第一首 / 单曲自动重放当前曲）。
  next: (auto = false) => {
    const st = get();
    if (st.tracks.length === 0) return;
    const q = nextInQueue(st.order, st.pos, st.tracks.length, st.mode, { auto });
    set({
      order: q.order,
      pos: q.pos,
      trackIndex: currentTrackIndex(q.order, q.pos),
      currentTime: 0,
    });
    playCurrent();
  },

  prev: () => {
    const st = get();
    if (st.tracks.length === 0) return;
    const q = prevInQueue(st.order, st.pos, st.tracks.length, st.mode);
    set({
      order: q.order,
      pos: q.pos,
      trackIndex: currentTrackIndex(q.order, q.pos),
      currentTime: 0,
    });
    playCurrent();
  },

  setVolume: (v) => {
    const vol = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    set({ volume: vol });
    if (audio) audio.volume = vol / 100;
  },

  // 切模式：只重排队列，**不动正在放的那首**（用户切模式不该被打断）。
  setMode: (mode) => {
    const st = get();
    const q = reorderForMode(st.order, st.pos, st.tracks.length, mode);
    set({ mode, order: q.order, pos: q.pos, trackIndex: currentTrackIndex(q.order, q.pos) });
  },

  // 从列表点歌：直接跳过去放（队列是排列，一定找得到这首；找不到就按当前模式重排）。
  playTrack: (index) => {
    const st = get();
    if (st.tracks.length === 0) return;
    const i = Math.max(0, Math.min(st.tracks.length - 1, Math.round(Number(index) || 0)));
    let order = st.order;
    let pos = order.indexOf(i);
    if (!isOrderValid(order, st.tracks.length) || pos < 0) {
      const q = orderFor(st.tracks.length, st.mode);
      order = q.order;
      pos = q.pos;
    }
    set({ order, pos, trackIndex: i, currentTime: 0 });
    playCurrent();
  },

  // 拖进度：直接写 <audio>.currentTime。音频由本地 HTTP 服务器提供、支持 Range，
  // 所以任意位置都能立刻播（不支持下 Range 的话拖到中间会重新缓冲整个文件）。
  seek: (sec) => {
    const a = audio;
    if (!a) return;
    const want = Number.isFinite(sec) ? sec : 0;
    const d = Number.isFinite(a.duration) ? a.duration : 0;
    const t = Math.max(0, d > 0 ? Math.min(d, want) : want);
    try {
      a.currentTime = t;
    } catch {
      // 元数据还没到时设置 currentTime 会抛，忽略：用户拖一下不该让界面崩。
    }
    set({ currentTime: t });
  },

  duckForVideo: (opts) => {
    const st = get();
    // 只在第一次让位时记录"本来在放"——否则在视频浮层里连点几个视频，
    // 第二次进来时音乐已经停了，会误记成"本来没放"，关掉后就不恢复了。
    if (!ducking) {
      ducking = true;
      duckResume = (opts?.resume ?? true) && st.playing;
    }
    if (st.playing) {
      audio?.pause();
      set({ playing: false });
    }
  },

  unduckAfterVideo: () => {
    const resume = duckResume;
    ducking = false;
    duckResume = false;
    if (resume) playCurrent();
  },
}));
