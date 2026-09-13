// 背景音乐播放队列的**纯逻辑**（三种模式的排队规则）—— 零依赖、可单测。
// 播放本身在 src/stores/musicStore.ts（<audio> 元素），这里只管"该放第几首"。
//
// 三种模式（设置项 musicMode，状态栏的音乐面板里可切）：
//   · shuffle    随机循环：整张歌单洗一轮 → 放完重新洗牌（不会在两首之间来回跳）；
//   · sequential 顺序循环：按曲库顺序放，到末尾回到第一首；
//   · single     单曲循环：**自动播完重放这首**；用户手动点"下一首/上一首"仍换曲
//                （播放器的通行做法 —— 否则按了没反应，像卡住）。
//
// 两个刻意保留的**不对称**（都有单测盯着，别"顺手统一"）：
//   1. 自动播完 vs 手动下一首：只有 single 模式区分这两者（auto=true 才重放当前曲）；
//   2. "上一首"：shuffle 不绕回（"回去"= 回到刚放过的那首，到第一首就停住），
//      sequential / single 绕回最后一首（列表循环模式下卡在开头像坏掉）。
// 为什么不直接给 <audio> 加 loop：那是"单曲循环"，而默认需求是"随机循环整个目录"。

import type { MusicMode } from "../../shared/models";

/** 面板里按这个顺序展示模式按钮（随机是默认，放第一个）。 */
export const MUSIC_MODES: MusicMode[] = ["shuffle", "sequential", "single"];

/**
 * 是否是合法的播放模式。
 * config.json 是**外部可改**的（用户/运维可能手写个 "looP"、null、数字），
 * 读进来必须校验，否则会静默落进"哪个分支都不匹配"的死角。
 */
export function isMusicMode(v: unknown): v is MusicMode {
  return v === "shuffle" || v === "sequential" || v === "single";
}

/** 洗牌（Fisher–Yates）。rng 可注入，便于单测。 */
export function shuffleOrder(count: number, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(i);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** 顺序队列（0,1,2,…）：顺序/单曲模式用它。 */
function identityOrder(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

/**
 * 队列是否还与当前曲库对得上。
 * 曲库变了（换音乐目录、增删文件）就必须作废重排，否则会指向已不存在的曲目
 * （表现是"点了下一首没声音"，最难查的一类问题）。
 */
export function isOrderValid(order: number[], count: number): boolean {
  if (count <= 0) return order.length === 0;
  if (order.length !== count) return false;
  const seen = new Set<number>();
  for (const i of order) {
    if (!Number.isInteger(i) || i < 0 || i >= count || seen.has(i)) return false;
    seen.add(i);
  }
  return true;
}

export interface QueuePos {
  /** 播放顺序（曲目索引数组）。 */
  order: number[];
  /** 当前在 order 里的位置（-1 = 没有可放的曲目）。 */
  pos: number;
}

/** 生成某模式的**初始**队列（从第一首开始放）。 */
export function orderFor(count: number, mode: MusicMode, rng: () => number = Math.random): QueuePos {
  if (count <= 0) return { order: [], pos: -1 };
  return { order: mode === "shuffle" ? shuffleOrder(count, rng) : identityOrder(count), pos: 0 };
}

/**
 * 换播放模式时重排队列 —— **当前这首不能换、也不能被打断**。
 * 做法：重排 order，然后把 pos 指到"当前曲在新 order 里的位置"。
 * （随机模式重洗后也是从当前曲继续，所以用户切模式时听到的还是同一首。）
 */
export function reorderForMode(
  order: number[],
  pos: number,
  count: number,
  mode: MusicMode,
  rng: () => number = Math.random,
): QueuePos {
  if (count <= 0) return { order: [], pos: -1 };
  const next = mode === "shuffle" ? shuffleOrder(count, rng) : identityOrder(count);
  const cur = currentTrackIndex(order, pos);
  if (cur < 0) return { order: next, pos: 0 }; // 当前没有曲目：从头放
  return { order: next, pos: Math.max(0, next.indexOf(cur)) };
}

export interface NextOptions {
  /** true = 一首**自动放完**推进；false/省略 = 用户手动点了"下一首"。 */
  auto?: boolean;
  rng?: () => number;
}

/** 下一首。 */
export function nextInQueue(
  order: number[],
  pos: number,
  count: number,
  mode: MusicMode = "shuffle",
  opts: NextOptions = {},
): QueuePos {
  const rng = opts.rng ?? Math.random;
  if (count <= 0) return { order: [], pos: -1 };
  if (!isOrderValid(order, count)) return orderFor(count, mode, rng);
  // 单曲循环 + 自动放完 → 重放当前这首（手动下一首不走这条，见文件头说明）。
  if (mode === "single" && opts.auto) return { order, pos };
  const next = pos + 1;
  if (next < order.length) return { order, pos: next };
  // 到末尾：随机模式重新洗牌（下一轮换个顺序），顺序/单曲回到第一首。
  return mode === "shuffle" ? { order: shuffleOrder(count, rng), pos: 0 } : { order, pos: 0 };
}

/** 上一首。 */
export function prevInQueue(
  order: number[],
  pos: number,
  count: number,
  mode: MusicMode = "shuffle",
  rng: () => number = Math.random,
): QueuePos {
  if (count <= 0) return { order: [], pos: -1 };
  if (!isOrderValid(order, count)) return orderFor(count, mode, rng);
  if (pos > 0) return { order, pos: pos - 1 };
  // 已经在第一首：随机模式停住，顺序/单曲绕到最后一首。
  return mode === "shuffle" ? { order, pos: 0 } : { order, pos: order.length - 1 };
}

/** 当前该放的曲目索引（没有可放曲目时为 -1）。 */
export function currentTrackIndex(order: number[], pos: number): number {
  if (pos < 0 || pos >= order.length) return -1;
  return order[pos];
}
