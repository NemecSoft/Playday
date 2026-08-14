// Progressive lazy image loading.
//
// - IntersectionObserver with a generous rootMargin pre-loads images just
//   before they scroll into view.
// - The actual IPC fetch is deferred to the browser's idle time
//   (`requestIdleCallback`) so heavy reading never competes with paint/layout.
// - `force` re-renders the card once the bytes are ready so the real image
//   fades in, giving a smooth "images appear one by one" effect.

import { useCallback, useEffect, useReducer, useRef } from "react";
import { ensureImageLoaded } from "../utils/assets";

type IdleHandle = ReturnType<typeof requestIdleCallback> | number;

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
    let idleHandle: IdleHandle | null = null;

    const trigger = () => {
      if (disposed || didLoad) return;
      didLoad = true;
      const run = () =>
        void ensureImageLoaded(path).then(() => {
          if (!disposed) force();
        });
      // Defer to idle so image I/O doesn't block scrolling / painting.
      if (typeof requestIdleCallback === "function") {
        idleHandle = requestIdleCallback(run, { timeout: 1500 });
      } else {
        run();
      }
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
      if (idleHandle !== null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleHandle);
      }
    };
  }, [path, rootMargin]);

  const ref = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
  }, []);

  return { ref };
}