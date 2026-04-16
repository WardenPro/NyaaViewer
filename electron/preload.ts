import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  GetTorrentFilesResult,
  TorrentStatusResult,
  UnlockLinkResult,
  UploadMagnetResult,
  VerifyAllDebridKeyResult,
} from '../src/types/alldebrid';
import type { NyaaResult, NyaaSearchOptions } from '../src/types/nyaa';
import type {
  PlayerPositionUpdateData,
  SubtitleTrack,
} from '../src/types/player';
import type { ScheduleDay } from '../src/types/schedule';
import type { WatchEntry } from '../src/types/storage';
import type { AutoUpdateStatusEvent } from '../src/types/update';

type Unsubscribe = () => void;

function subscribeToChannel<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function subscribeToSignal(channel: string, callback: () => void): Unsubscribe {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Define the API exposed to the renderer
const api = {
  // Search
  searchNyaa: (query: string, options?: NyaaSearchOptions) =>
    ipcRenderer.invoke('search-nyaa', query, options),
  getTrending: () =>
    ipcRenderer.invoke('get-trending'),
  getWeeklySchedule: () =>
    ipcRenderer.invoke('get-weekly-schedule'),

  // AllDebrid
  verifyAllDebridKey: (apiKey: string) =>
    ipcRenderer.invoke('verify-alldebrid-key', apiKey),
  uploadMagnet: (magnetUri: string) =>
    ipcRenderer.invoke('upload-magnet', magnetUri),
  getTorrentStatus: (torrentId: number) =>
    ipcRenderer.invoke('get-torrent-status', torrentId),
  getTorrentFiles: (torrentId: number) =>
    ipcRenderer.invoke('get-torrent-files', torrentId),
  unlockLink: (fileLink: string) =>
    ipcRenderer.invoke('unlock-link', fileLink),
  setAllDebridKey: (apiKey: string) =>
    ipcRenderer.invoke('set-alldebrid-key', apiKey),
  getAllDebridKey: () =>
    ipcRenderer.invoke('get-alldebrid-key'),
  getPreferredSubtitleLang: () =>
    ipcRenderer.invoke('get-preferred-subtitle-lang'),
  setPreferredSubtitleLang: (lang: string) =>
    ipcRenderer.invoke('set-preferred-subtitle-lang', lang),

  // Player
  setupVideoWindow: () =>
    ipcRenderer.invoke('setup-video-window'),
  showVideoWindow: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('show-video-window', bounds),
  hideVideoWindow: () =>
    ipcRenderer.invoke('hide-video-window'),
  startPlayback: (url: string) =>
    ipcRenderer.invoke('start-playback', url),
  pausePlayback: () =>
    ipcRenderer.invoke('pause-playback'),
  seekPlayback: (position: number) =>
    ipcRenderer.invoke('seek-playback', position),
  stopPlayback: () =>
    ipcRenderer.invoke('stop-playback'),
  getPlayerPosition: () =>
    ipcRenderer.invoke('get-player-position'),
  setSubtitleTrack: (trackId: string | number) =>
    ipcRenderer.invoke('set-subtitle-track', trackId),
  getSubtitleTracks: () =>
    ipcRenderer.invoke('get-subtitle-tracks'),
  onPlayerPositionUpdate: (callback: (data: PlayerPositionUpdateData) => void) =>
    subscribeToChannel<PlayerPositionUpdateData>('player-position-update', callback),
  onPlayerTracksUpdate: (callback: (tracks: SubtitleTrack[]) => void) =>
    subscribeToChannel<SubtitleTrack[]>('player-tracks-update', callback),
  onPlayerEnded: (callback: () => void) =>
    subscribeToSignal('player-ended', callback),
  onPlayerError: (callback: (error: string) => void) =>
    subscribeToChannel<string>('player-error', callback),

  // Storage
  getWatchHistory: () =>
    ipcRenderer.invoke('get-watch-history'),
  addWatchEntry: (entry: WatchEntry) =>
    ipcRenderer.invoke('add-watch-entry', entry),
  updateWatchPosition: (infohash: string, position: number, duration: number) =>
    ipcRenderer.invoke('update-watch-position', infohash, position, duration),
  removeWatchEntry: (infohash: string) =>
    ipcRenderer.invoke('remove-watch-entry', infohash),

  // Auto-update
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback: (data: AutoUpdateStatusEvent) => void) =>
    subscribeToChannel<AutoUpdateStatusEvent>('auto-update:status', callback),
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),
  getDebugFile: () =>
    ipcRenderer.invoke('get-debug-file'),
};

contextBridge.exposeInMainWorld('electronAPI', api);

// Type definitions for the exposed API
export interface ElectronAPI {
  searchNyaa: (query: string, options?: NyaaSearchOptions) => Promise<NyaaResult[]>;
  getTrending: () => Promise<NyaaResult[]>;
  getWeeklySchedule: () => Promise<ScheduleDay[]>;
  verifyAllDebridKey: (apiKey: string) => Promise<VerifyAllDebridKeyResult>;
  uploadMagnet: (magnetUri: string) => Promise<UploadMagnetResult>;
  getTorrentStatus: (torrentId: number) => Promise<TorrentStatusResult>;
  getTorrentFiles: (torrentId: number) => Promise<GetTorrentFilesResult>;
  unlockLink: (fileLink: string) => Promise<UnlockLinkResult>;
  setAllDebridKey: (apiKey: string) => Promise<void>;
  getAllDebridKey: () => Promise<string | null>;
  getPreferredSubtitleLang: () => Promise<string | null>;
  setPreferredSubtitleLang: (lang: string) => Promise<void>;
  setupVideoWindow: () => Promise<{ success: boolean; error?: string }>;
  showVideoWindow: (bounds: { x: number; y: number; width: number; height: number }) => Promise<number | null>;
  hideVideoWindow: () => Promise<void>;
  startPlayback: (url: string) => Promise<{ success: boolean; error?: string }>;
  pausePlayback: () => Promise<void>;
  seekPlayback: (position: number) => Promise<void>;
  stopPlayback: () => Promise<void>;
  getPlayerPosition: () => Promise<PlayerPositionUpdateData>;
  setSubtitleTrack: (trackId: string | number) => Promise<void>;
  getSubtitleTracks: () => Promise<SubtitleTrack[]>;
  onPlayerPositionUpdate: (callback: (data: PlayerPositionUpdateData) => void) => Unsubscribe;
  onPlayerTracksUpdate: (callback: (tracks: SubtitleTrack[]) => void) => Unsubscribe;
  onPlayerEnded: (callback: () => void) => Unsubscribe;
  onPlayerError: (callback: (error: string) => void) => Unsubscribe;
  getWatchHistory: () => Promise<WatchEntry[]>;
  addWatchEntry: (entry: WatchEntry) => Promise<void>;
  updateWatchPosition: (infohash: string, position: number, duration: number) => Promise<void>;
  removeWatchEntry: (infohash: string) => Promise<void>;

  // Auto-update
  checkForUpdates: () => Promise<{ checking?: boolean; error?: string }>;
  onUpdateStatus: (callback: (data: AutoUpdateStatusEvent) => void) => Unsubscribe;
  getAppVersion: () => Promise<string>;
  getDebugFile: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
