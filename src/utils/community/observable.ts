// 极简 Observable（订阅/退订/推送值）。社区氛围 provider 用它对外推送实时数据，
// 避免引入 rxjs 依赖。前端组件用 useSyncExternalStore 订阅它。

export type Subscriber<T> = (value: T) => void;

export class Observable<T> {
  private subs = new Set<Subscriber<T>>();
  private current: T;

  constructor(init: T) {
    this.current = init;
  }

  /** 当前值 */
  get value(): T {
    return this.current;
  }

  /** 订阅，返回取消函数 */
  subscribe(fn: Subscriber<T>): () => void {
    this.subs.add(fn);
    fn(this.current); // 订阅即推送当前值（useSyncExternalStore 需要 getSnapshot 一致）
    return () => {
      this.subs.delete(fn);
    };
  }

  /** 推送新值 */
  next(v: T): void {
    this.current = v;
    this.subs.forEach((fn) => {
      try {
        fn(v);
      } catch (e) {
        console.error("[community:observable]", e);
      }
    });
  }
}
