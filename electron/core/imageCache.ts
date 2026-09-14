// 图片字节缓存：按**总字节数**封顶的 LRU。纯逻辑、零依赖，所以能单测
// （读盘与编码在 electron/ipc/covers.ts）。
//
// 为什么必须按字节封顶、而不是像原来那样干脆不封顶：
//   原来的 `imageCache` 是个只增不减的 Map，缓存值还是 base64 **字符串**。
//   实测（本机 1369 张封面、原始 448MB）：滚完整个库会让主进程常驻 ≈ 675MB
//   （300 张时 RSS 已从 34MB 涨到 182MB）。大堆的代价是主 GC 停顿 ——
//   用户看到的就是"滚动中间明显卡一下"。加上上界后，常驻内存才有个确定的顶。

export interface ByteLruCache<T> {
  get(key: string): T | undefined;
  /** 写入并计入 bytes；超上限时按 LRU 逐出（单条自己就超上限则把自己逐出）。 */
  set(key: string, value: T, bytes: number): void;
  clear(): void;
  /** 当前条目数。 */
  count(): number;
  /** 当前总字节数（按 set 时传入的 bytes 累加）。 */
  bytes(): number;
  /** 累计被逐出的条目数。 */
  evicted(): number;
}

export function createByteLruCache<T>(capBytes: number): ByteLruCache<T> {
  // Map 的迭代顺序 = 插入顺序；"触碰"= 先删再塞回队尾，于是队首就是最久未用的。
  const map = new Map<string, { value: T; bytes: number }>();
  let total = 0;
  let evicted = 0;

  return {
    get(key) {
      const e = map.get(key);
      if (!e) return undefined;
      map.delete(key);
      map.set(key, e);
      return e.value;
    },
    set(key, value, bytes) {
      const prev = map.get(key);
      if (prev) {
        map.delete(key);
        total -= prev.bytes;
      }
      map.set(key, { value, bytes });
      total += Math.max(0, bytes);
      while (total > capBytes && map.size > 0) {
        const oldest = map.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        const e = map.get(oldest);
        map.delete(oldest);
        total -= e?.bytes ?? 0;
        evicted++;
      }
    },
    clear() {
      map.clear();
      total = 0;
    },
    count: () => map.size,
    bytes: () => total,
    evicted: () => evicted,
  };
}
