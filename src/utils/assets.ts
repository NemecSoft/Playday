// 本地图片地址的处理工具。
//
// 游戏里的 `cover_image` 可能是两种情况：
//   - 网上的 http(s) 地址——原样用，不用处理；
//   - 本地文件的绝对路径（在 CoverImages 或 library/images 目录里）。
//
// 本地图片不直接用文件系统路径塞给 <img>（Electron 渲染进程无权直接读任意
// 绝对路径，且路径还可能被安全校验拦下）。更稳妥的做法是走后端 IPC 的
// `read_images_batch` 命令，一次能把多张图的原始字节和类型一起读回来。
// 前端再把字节转成 `blob:` 地址，并用 LRU 缓存，保证每个文件只读一次，
// 占用的内存也有上限，不会越攒越多。
//
// 字节的**形态两端不同**（2026-09 实测，这直接决定滚动卡不卡）：
//   桌面端：`data` 是裸字节（主进程发 Buffer，结构化克隆到渲染进程就是 Uint8Array）→ 直接进 Blob；
//   网站端：`data` 是 base64 字符串（HTTP JSON 传不了二进制，见 server/server.mjs）→ 走 atob + 逐字节填。
// 所以下面的转换两种都要容。实测渲染进程落地成本（含 IPC 反序列化，见 docs/design/cover-images.md）：
//   1920×1080 PNG 43.1ms → 2.7ms；1500×843 PNG 19.9ms → 1.5ms。

import { api } from "../api/client";
import { useImageProgressStore } from "../stores/imageProgressStore";

const isRemote = (s: string) => /^https?:\/\//i.test(s) || /^asset:\/\//i.test(s);
const isLocalPath = (s: string) => /^[a-zA-Z]:[\\/]/i.test(s) || s.startsWith("/") || s.startsWith("\\");

/**
 * 把 base64 字符串还原成字节数组（WebView2 运行时一定支持 atob）。
 * 转出来的结果可以直接拿去 new Blob(...) 用。
 */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(new ArrayBuffer(len));
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 后端读回来的图片数据 → 字节。两种形态都容（见文件头说明）：
 *   Uint8Array（桌面端）—— 直接用，不再逐字节拷贝；
 *   string（网站端 base64）—— atob + 逐字节填。
 */
export function payloadToBytes(data: string | Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof data === "string") return base64ToBytes(data);
  if (data instanceof Uint8Array) return data as Uint8Array<ArrayBuffer>;
  return new Uint8Array(data as unknown as ArrayBuffer);
}

/**
 * 把后端读回来的图片数据做成 `blob:` 地址。
 *
 * ⚠️ 这里**故意不用 requestIdleCallback 推迟**（2026-09 实测改的）：
 *   二进制过 IPC 之后，每张图的落地成本只有 0.5–2.8ms（见 docs/design/cover-images.md），
 *   而 `requestIdleCallback(run, { timeout: 900 })` 在主线程忙时会一直等到 timeout ——
 *   等于给每张图白加最多 900ms 的等待。它和 useLazyImage 里那层 1500ms 叠起来，
 *   就是用户看到的"图片要两三秒才出来"。
 *   真需要让路时用 suspendImageLoading()（弹窗期间挂起），那是确定的、可恢复的，
 *   而不是"等到空闲"这种不确定的延迟。
 */
function decodeBlob(data: string | Uint8Array, mime: string): Promise<string> {
  const bytes = payloadToBytes(data);
  const blob = new Blob([bytes], { type: mime });
  return Promise.resolve(URL.createObjectURL(blob));
}

// ---- 挂起机制（让后台加载别和弹窗动画抢资源） -----------------------------
//
// 当有弹窗（比如公告弹窗）显示时，我们希望它能顺畅地开出来、也能顺畅地看，
// 不被主界面封面的加载干扰。所以允许在弹窗打开期间把图片加载"挂起"：
// 已经开始的、和排着队的封面解码都先暂停，等弹窗关掉后再恢复。这样就把
// 界面动画和后台加载彻底分开了。

let suspended = false;
let resumeWait: Promise<void> | null = null;
let resumeResolvers: Array<() => void> = [];

/** Suspend all local-image loading (covers) until {@link resumeImageLoading}. */
export function suspendImageLoading(): void {
  suspended = true;
}

/** 恢复之前被挂起的图片加载。 */
export function resumeImageLoading(): void {
  if (!suspended) return;
  suspended = false;
  const resolvers = resumeResolvers;
  resumeResolvers = [];
  resumeWait = null;
  for (const r of resolvers) r();
}

/** 没挂起就直接通过；挂起中就先等着，直到恢复。 */
function waitIfSuspended(): Promise<void> {
  if (!suspended) return Promise.resolve();
  if (!resumeWait) {
    resumeWait = new Promise((resolve) => resumeResolvers.push(resolve));
  }
  return resumeWait;
}

/** 一次 IPC 调用里带多少张图的路径（太多会让单次往返变慢）。 */
const BATCH_SIZE = 24;
/** 同时能并发几批请求。 */
const BATCH_CONCURRENCY = 2;
/** 前端缓存里最多保留多少个 blob 地址（防止内存越攒越多）。 */
const BLOB_LRU_CAP = 220;

// ---- LRU blob URL cache ---------------------------------------------------

interface BlobEntry {
  url: string;
  size: number; // approximate bytes for LRU accounting
}

const blobCache = new Map<string, BlobEntry>();
/** Paths currently being fetched (to avoid duplicate in-flight requests). */
const inflight = new Map<string, Promise<string | undefined>>();

function touchBlobCacheSize() {
  // Approximate LRU eviction using the Map's insertion order. We re-insert
  // touched entries to move them to the back, then drop the front.
  while (blobCache.size > BLOB_LRU_CAP) {
    const oldest = blobCache.keys().next().value;
    if (!oldest) break;
    const e = blobCache.get(oldest);
    if (e) {
      try {
        URL.revokeObjectURL(e.url);
      } catch {
        /* ignore */
      }
    }
    blobCache.delete(oldest);
  }
}

function putBlob(path: string, url: string) {
  const size = Math.max(1, Math.round(url.length / 4)); // very rough byte estimate
  // Re-insert to move to back (LRU).
  blobCache.delete(path);
  blobCache.set(path, { url, size });
  touchBlobCacheSize();
}

function getBlob(path: string): string | undefined {
  const e = blobCache.get(path);
  if (!e) return undefined;
  // Touch.
  blobCache.delete(path);
  blobCache.set(path, e);
  return e.url;
}

// ---- Single-image loading (concurrency-limited) --------------------------

/**
 * 同时在飞的单图请求数。原来是 3 —— 实测一屏 30 张：并发 3 要 133ms，并发 8 只要 79ms
 * （见 docs/design/cover-images.md）。图片解码本身不在主线程，多放几个不吃主线程，
 * 但能明显缩短"一屏铺满"的时间，所以放宽到 6。
 */
const SINGLE_CONCURRENCY = 6;
let activeSingle = 0;
const singleQueue: Array<() => void> = [];

function acquireSingle(): Promise<void> {
  if (activeSingle < SINGLE_CONCURRENCY) {
    activeSingle++;
    return Promise.resolve();
  }
  return new Promise((resolve) => singleQueue.push(resolve));
}
function releaseSingle() {
  // ⚠️ 后进先出（pop），不是先进先出（shift）。滚动时用户的视线落在**最近**触发的那批图上，
  // 队列前面那些是"已经滚过去"的行。实测（前面排了 100 条已滚过的请求）：FIFO 时当前视野
  // 那 6 张要等 208ms，后进先出只要 19ms —— 差 10 倍，而这正是"滚过去再停下来看"的日常动作。
  const next = singleQueue.pop();
  if (next) {
    next(); // hand off the slot
  } else {
    activeSingle--;
  }
}

async function loadOne(path: string): Promise<string | undefined> {
  const existing = inflight.get(path);
  if (existing) return existing;
  const p = (async () => {
    await waitIfSuspended(); // pause while an overlay is shown
    await acquireSingle();
    try {
      const res = await api.readImage(path);
      const url = await decodeBlob(res.data, res.mime);
      putBlob(path, url);
      return url;
    } catch {
      return undefined;
    } finally {
      releaseSingle();
      inflight.delete(path);
    }
  })();
  inflight.set(path, p);
  return p;
}

// ---- Batch loader ---------------------------------------------------------

async function loadBatch(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  // 先把这一批登记成"在飞"：并发的 ensureImageLoaded()（卡片刚好滚进视野时）会等这批的
  // 结果，而不会对同一张图另起一次单图请求。
  // ⚠️ 这里以前写的是 `inflight.set(p, loadOne(p))` —— 那不是"登记"，是**真的又取了一遍**：
  // 同一张图被单图 IPC + 批量 IPC 各读一次，预载的耗时、IPC 流量、内存全部翻倍。
  // 占位 promise 只登记不加载，整批结束后各自解析成自己那张图的 blob 地址。
  let settle: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  // 这一批里"已经有人读过或在读"的挑出来不读：卡片可能抢在预载前面发了单图请求
  // （视口内的图就是这么来的），那种路径再读一次就是纯浪费。
  // 不变式：**同一张图、同一时刻，只有一条读取在飞**。
  // ⚠️ 必须在下面"登记占位"**之前**挑，否则刚登记的占位会被自己当成"有人在读"，
  // 整批都被跳过（写完立刻被单测抓到了）。
  const toRead = paths.filter((p) => !getBlob(p) && !inflight.has(p));
  for (const p of paths) {
    if (!inflight.has(p)) inflight.set(p, done.then(() => getBlob(p)));
  }
  if (toRead.length === 0) {
    for (const p of paths) inflight.delete(p);
    settle();
    return;
  }
  try {
    const results = await api.readImagesBatch(toRead);
    // Decode one payload at a time, yielding a frame between them so a large batch
    // never blocks the main thread / animation frames in one synchronous burst.
    // Also pause while an overlay is shown so the overlay animates smoothly.
    await waitIfSuspended();
    for (let i = 0; i < toRead.length; i++) {
      const r = results[i];
      if (!r) continue;
      const url = await decodeBlob(r.data, r.mime);
      putBlob(toRead[i], url);
      // 只让出**一帧**，不是"等到空闲"：一批 24 张连着做有几十毫秒，让一帧就够，
      // 而 requestIdleCallback 那种推迟的延迟是不确定的（最多可到 timeout）。
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } catch {
    /* swallow — individual paths can be retried later */
  } finally {
    // Mark all in-flight entries for these paths as done.
    for (const p of paths) inflight.delete(p);
    settle(); // 放掉上面登记的占位（各自的 then 会去缓存里取自己的 blob 地址）
  }
}

// Ensure the given local path is being loaded (single-flight).
function ensureLocal(path: string): Promise<string | undefined> {
  const cached = getBlob(path);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(path);
  if (existing) return existing;
  const p = loadOne(path);
  inflight.set(path, p);
  return p;
}

// ---- Public API -----------------------------------------------------------

/**
 * Synchronously returns a usable URL for `<img src>` for a local-or-remote
 * image path. Remote URLs pass through unchanged. For local paths, returns
 * the cached blob URL if available, otherwise `undefined` — the caller is
 * expected to trigger `ensureImageLoaded` for missing paths.
 */
export function imageUrl(src?: string): string | undefined {
  if (!src || !src.trim()) return undefined;
  const s = src.trim();
  if (isRemote(s)) return s;
  if (!isLocalPath(s)) return undefined;
  // Return the cached blob URL if already loaded. Loading is triggered by the
  // IntersectionObserver (useLazyImage) so we never flood IPC at mount time.
  return getBlob(s);
}

/** Begin loading a single path; resolves when the bytes are decoded into a blob URL. */
export function ensureImageLoaded(path: string): Promise<string | undefined> {
  return ensureLocal(path);
}

/**
 * Pre-load all local images in a list of paths (e.g. on app startup), batching
 * IPC calls so the UI stays responsive, and reporting progress through
 * `useImageProgressStore`. Each IPC call covers up to `BATCH_SIZE` paths; up
 * to `BATCH_CONCURRENCY` batches are in flight at once.
 */
export async function preloadImages(paths: Array<string | undefined>): Promise<void> {
  const unique = new Set<string>();
  for (const p of paths) {
    if (!p) continue;
    const s = p.trim();
    if (!isRemote(s) && isLocalPath(s) && !getBlob(s) && !inflight.has(s)) unique.add(s);
  }
  const pending = [...unique];
  if (pending.length === 0) return;

  const progress = useImageProgressStore.getState();
  progress.begin(pending.length);

  // Split into chunks; run a small pool of chunks in parallel.
  const chunks: string[][] = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    chunks.push(pending.slice(i, i + BATCH_SIZE));
  }

  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length) {
      const myIdx = cursor++;
      if (myIdx >= chunks.length) return;
      const chunk = chunks[myIdx];
      // 只取一次：loadBatch 内部会把这一批登记成"在飞"，供并发的单图请求复用。
      // （以前这里还额外对每个路径调了 loadOne，等于整批读两遍 —— 见 loadBatch 的注释。）
      await loadBatch(chunk);
      for (let k = 0; k < chunk.length; k++) progress.tick();
    }
  }
  const workers = Array.from({ length: Math.min(BATCH_CONCURRENCY, chunks.length) }, () => worker());
  await Promise.all(workers);

  progress.reset();
}

/** Pre-load images from a list of games (cover / background / icon / screenshots). */
export async function preloadGameImages(
  games: Array<{
    coverImage?: string;
    backgroundImage?: string;
    icon?: string;
    screenshots?: string[];
  }>
): Promise<void> {
  const paths: Array<string | undefined> = [];
  for (const g of games) {
    paths.push(g.coverImage, g.backgroundImage, g.icon);
    if (g.screenshots) paths.push(...g.screenshots);
  }
  await preloadImages(paths);
}

/** Release cached blob URLs (call on app teardown). */
export function releaseImageCache(): void {
  for (const e of blobCache.values()) {
    try {
      URL.revokeObjectURL(e.url);
    } catch {
      /* ignore */
    }
  }
  blobCache.clear();
}

/** Force-reload a single image path (e.g. after a rescan). */
export function invalidateImage(path: string): void {
  const e = blobCache.get(path);
  if (e) {
    try {
      URL.revokeObjectURL(e.url);
    } catch {
      /* ignore */
    }
    blobCache.delete(path);
  }
  void api.clearImageCache().catch(() => undefined);
}