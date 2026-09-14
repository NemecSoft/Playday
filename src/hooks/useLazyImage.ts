// Progressive lazy image loading.
//
// - IntersectionObserver with a generous rootMargin pre-loads images just
//   before they scroll into view.
// - 取图**不**再推迟到 requestIdleCallback（见下）：那给每张图加了一个 1.5s 的
//   延迟上界，是"图片要两三秒才出来"的主因。
// - `force` re-renders the card once the bytes are ready so the real image
//   fades in, giving a smooth "images appear one by one" effect.
//
// 为什么去掉 idle 推迟（2026-09，实测）：
//   这条链路上每张图的成本已经很低 —— 二进制过 IPC + 解码，一屏 30 张合计只要
//   79–133ms（含冷读，见 docs/design/cover-images.md）。而 `requestIdleCallback(run,
//   { timeout: 1500 })` 在主线程持续繁忙时（滚动 + React 重渲染 + 解码并发）会一直等
//   到 timeout 才执行：一张图最多白等 1.5s，加上解码那层的 900ms 就是 2.4s。
//   "让出主线程"本意是好的，但代价是一张图要等几百毫秒到几秒才**开始**加载，
//   而它的实际工作只有几毫秒 —— 这是纯粹的延迟上界，不是吞吐问题。
//   真需要让路时，assets.ts 里还有 suspend 机制（弹窗期间挂起）可用。

import { useCallback, useEffect, useReducer, useRef } from "react";
import { ensureImageLoaded } from "../utils/assets";

export function useLazyImage(path: string | undefined, rootMargin = "600px") {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!path) return;
    // Non-local paths (http / asset://) are rendered directly; nothing to do.
    if (!/^[a-zA-Z]:[\\/]/.test(path) && !path.startsWith("/") && !path.startsWith("\\")) {
      force();
      return;
    }
    const el = elRef.current;
    if (!el) return;

    let disposed = false;
    let didLoad = false;

    const trigger = () => {
      if (disposed || didLoad) return;
      didLoad = true;
      // 立刻取（不再排队等 idle）：几毫秒的活不该等 1.5s。加载顺序由 assets.ts 的
      // 队列负责（后进先出 = 最近滚到的那批优先），这里只负责"进入视野就触发"。
      void ensureImageLoaded(path).then(() => {
        if (!disposed) force();
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            trigger();
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );
    io.observe(el);

    return () => {
      disposed = true;
      io.disconnect();
    };
  }, [path, rootMargin]);

  const ref = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
  }, []);

  return { ref };
}