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
 * 把一张 base64 图片解码成 `blob:` 地址，并且先让出浏览器的空闲/渲染帧。
 * 因为 atob、复制到 Uint8Array、建 Blob 这些操作都会卡住主线程；如果一次性
 * 连续解码很多张（比如一下子滚动进视口几十张封面），就会把 React 的动画帧
 * 堵住，让公告这类弹窗明显卡顿。改成让浏览器"有空再解码"，这样图片加载和
 * 界面动画就不会互相抢主线程了。
 */
function decodeBlobInIdle(
  b64: string,
  mime: string,
): Promise<string> {
  return new Promise((resolve) => {
    const run = () => {
      const bytes = base64ToBytes(b64);
      const blob = new Blob([bytes], { type: mime });
      resolve(URL.createObjectURL(blob));
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 900 });
    } else {
      // 兜底：至少让出一个任务，好让浏览器先画一帧。
      setTimeout(run, 0);
    }
  });
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

/** Maximum concurrent single-image IPC requests in flight. Prevents the UI
 * from being flooded when a large grid mounts all at once. Kept small so
 * images fade in progressively instead of all at once. */
const SINGLE_CONCURRENCY = 3;
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
  const next = singleQueue.shift();
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
      const url = await decodeBlobInIdle(res.data, res.mime);
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
  try {
    const results = await api.readImagesBatch(paths);
    // Decode one payload at a time through idle scheduling so a large batch
    // never blocks the main thread / animation frames in one synchronous burst.
    // Also pause while an overlay is shown so the overlay animates smoothly.
    await waitIfSuspended();
    for (let i = 0; i < paths.length; i++) {
      const r = results[i];
      if (!r) continue;
      const url = await decodeBlobInIdle(r.data, r.mime);
      putBlob(paths[i], url);
    }
  } catch {
    /* swallow — individual paths can be retried later */
  } finally {
    // Mark all in-flight entries for these paths as done.
    for (const p of paths) inflight.delete(p);
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
      // Mark every path in this chunk as in-flight so a concurrent preload
      // call doesn't double-fetch the same paths.
      for (const p of chunk) {
        inflight.set(p, loadOne(p).then((u) => u));
      }
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