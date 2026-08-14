// 网格滚动位置记忆。
// 用户在点开某个游戏详情页之前，把网格当前的滚动位置存到这里；等从详情页
// 返回时再取出来恢复，这样就不会一返回就跳到最顶上。
// 这个值放在"模块级"的 store 里，所以就算网格组件卸载了，值也还在。
//
// 恢复是一次性的：取出来用掉之后就清空，这样以后再次进出详情页时，
// 是从"当时新打开的位置"开始，而不是一直用旧位置。

import { create } from "zustand";

interface ScrollState {
  /** 记下来的网格滚动位置（像素）；还没有值时为 null。 */
  gridScrollTop: number | null;
  saveGridScroll: (top: number) => void;
  takeGridScroll: () => number | null;
}

export const useScrollStore = create<ScrollState>((set, get) => ({
  gridScrollTop: null,
  saveGridScroll: (top) => set({ gridScrollTop: top }),
  takeGridScroll: () => {
    const top = get().gridScrollTop;
    if (top !== null) set({ gridScrollTop: null });
    return top;
  },
}));
