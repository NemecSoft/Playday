// Library statistics store.

import { create } from "zustand";
import { api } from "../api/client";
import type { LibraryStats } from "../types/models";

interface LibraryState {
  stats: LibraryStats | null;

  loadStats: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  stats: null,

  loadStats: async () => {
    const stats = await api.libraryStats();
    set({ stats });
  },
}));
