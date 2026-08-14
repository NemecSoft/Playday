// Tracks the progress of local cover/background image preloading so the UI can
// show a "loading images x/y" indicator instead of appearing frozen while
// thousands of covers are fetched via IPC.

import { create } from "zustand";

interface ImageProgressState {
  /** Total images to load in the current batch (0 = idle). */
  total: number;
  /** Number of images already loaded. */
  loaded: number;
  /** Number of images that failed to load (still counted towards progress). */
  failed: number;

  /** Start tracking a batch of `total` images. */
  begin: (total: number) => void;
  /** Mark one image as loaded (success or failure). */
  tick: () => void;
  /** Reset to idle. */
  reset: () => void;
}

export const useImageProgressStore = create<ImageProgressState>((set) => ({
  total: 0,
  loaded: 0,
  failed: 0,

  begin: (total) => set({ total: total > 0 ? total : 0, loaded: 0, failed: 0 }),
  tick: () => set((s) => ({ loaded: Math.min(s.loaded + 1, Math.max(s.total, 1)) })),
  reset: () => set({ total: 0, loaded: 0, failed: 0 }),
}));

/** True while there are still images being preloaded. */
export const isImageLoading = (s: ImageProgressState): boolean => s.total > 0 && s.loaded < s.total;
