import { create } from 'zustand';
import type { NyaaResult } from '../types/nyaa';
import type { PlayerState } from '../types/player';
import type { WatchEntry } from '../types/storage';

interface AppStore {
  // Search
  searchQuery: string;
  searchResults: NyaaResult[];
  isSearching: boolean;
  setSearchQuery: (q: string) => void;
  setSearchResults: (results: NyaaResult[]) => void;
  setIsSearching: (v: boolean) => void;

  // Trending
  trendingResults: NyaaResult[];
  setTrendingResults: (results: NyaaResult[]) => void;

  // Player
  player: PlayerState;
  setPlayerState: (state: Partial<PlayerState>) => void;
  resetPlayerState: () => void;

  // Settings
  allDebridApiKey: string;
  isADConnected: boolean;
  adUsername: string;
  setAllDebridApiKey: (key: string) => void;
  setADConnected: (connected: boolean, username?: string) => void;

  // Watch History
  watchHistory: WatchEntry[];
  setWatchHistory: (history: WatchEntry[]) => void;
  removeWatchEntry: (infohash: string) => void;
  updateHistoryPosition: (infohash: string, position: number, duration: number) => void;

  // Subtitle preference
  preferredSubtitleLang: string;
  setPreferredSubtitleLang: (lang: string) => void;
}

const useAppStore = create<AppStore>()((set) => ({
  // Search
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (v) => set({ isSearching: v }),

  // Trending
  trendingResults: [],
  setTrendingResults: (results) => set({ trendingResults: results }),

  // Player
  player: {
    status: 'idle',
    currentTorrent: null,
    currentPosition: 0,
    duration: 0,
  },
  setPlayerState: (state) =>
    set((prev) => ({
      player: { ...prev.player, ...state },
    })),
  resetPlayerState: () =>
    set({
      player: {
        status: 'idle',
        currentTorrent: null,
        currentPosition: 0,
        duration: 0,
      },
    }),

  // Settings
  allDebridApiKey: '',
  isADConnected: false,
  adUsername: '',
  setAllDebridApiKey: (key) => set({ allDebridApiKey: key }),
  setADConnected: (connected, username) =>
    set({ isADConnected: connected, adUsername: username || '' }),

  // Watch History
  watchHistory: [],
  setWatchHistory: (history) => set({ watchHistory: history }),
  removeWatchEntry: (infohash) =>
    set((prev) => ({
      watchHistory: prev.watchHistory.filter((entry) => entry.infohash !== infohash),
    })),
  updateHistoryPosition: (infohash, position, duration) =>
    set((prev) => {
      const existing = prev.watchHistory.find((e) => e.infohash === infohash);
      if (existing) {
        return {
          watchHistory: prev.watchHistory.map((e) =>
            e.infohash === infohash
              ? { ...e, lastPosition: position, duration, lastWatched: new Date().toISOString() }
              : e
          ),
        };
      }
      return prev;
    }),

  // Subtitle preference
  preferredSubtitleLang: 'en',
  setPreferredSubtitleLang: (lang) => set({ preferredSubtitleLang: lang }),
}));

export default useAppStore;
