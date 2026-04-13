import { contextBridge, ipcRenderer } from 'electron';

// Define the API exposed to the renderer
const api = {
  // Search
  searchNyaa: (query: string, options?: any) =>
    ipcRenderer.invoke('search-nyaa', query, options),
  getTrending: () =>
    ipcRenderer.invoke('get-trending'),

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
  getSubtitleTracks: (filePath: string) =>
    ipcRenderer.invoke('get-subtitle-tracks', filePath),
  onPlayerPositionUpdate: (callback: (data: { position: number; duration: number }) => void) =>
    ipcRenderer.on('player-position-update', (_event, data) => callback(data)),
  onPlayerTracksUpdate: (callback: (tracks: unknown[]) => void) =>
    ipcRenderer.on('player-tracks-update', (_event, tracks) => callback(tracks)),
  onPlayerEnded: (callback: () => void) =>
    ipcRenderer.on('player-ended', () => callback()),
  onPlayerError: (callback: (error: string) => void) =>
    ipcRenderer.on('player-error', (_event, error) => callback(error)),

  // Storage
  getWatchHistory: () =>
    ipcRenderer.invoke('get-watch-history'),
  addWatchEntry: (entry: unknown) =>
    ipcRenderer.invoke('add-watch-entry', entry),
  updateWatchPosition: (infohash: string, position: number, duration: number) =>
    ipcRenderer.invoke('update-watch-position', infohash, position, duration),
  removeWatchEntry: (infohash: string) =>
    ipcRenderer.invoke('remove-watch-entry', infohash),

  // Auto-update
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback: (data: { type: string; version?: string; percent?: number; message?: string }) => void) =>
    ipcRenderer.on('auto-update:status', (_event, data) => callback(data)),
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),
  getDebugFile: () =>
    ipcRenderer.invoke('get-debug-file'),
};

contextBridge.exposeInMainWorld('electronAPI', api);

// Type definitions for the exposed API
export interface ElectronAPI {
  searchNyaa: (query: string, filter?: string) => Promise<unknown>;
  getTrending: () => Promise<unknown>;
  verifyAllDebridKey: (apiKey: string) => Promise<{ success: boolean; error?: string; username?: string }>;
  uploadMagnet: (magnetUri: string) => Promise<unknown>;
  getTorrentStatus: (torrentId: number) => Promise<unknown>;
  getTorrentFiles: (torrentId: number) => Promise<unknown>;
  unlockLink: (fileLink: string) => Promise<{ success: boolean; link?: string; error?: string }>;
  setAllDebridKey: (apiKey: string) => Promise<void>;
  getAllDebridKey: () => Promise<string | null>;
  setupVideoWindow: () => Promise<{ success: boolean; error?: string }>;
  showVideoWindow: (bounds: { x: number; y: number; width: number; height: number }) => Promise<number | null>;
  hideVideoWindow: () => Promise<void>;
  startPlayback: (url: string) => Promise<{ success: boolean; error?: string }>;
  pausePlayback: () => Promise<void>;
  seekPlayback: (position: number) => Promise<void>;
  stopPlayback: () => Promise<void>;
  getPlayerPosition: () => Promise<{ position: number; duration: number }>;
  setSubtitleTrack: (trackId: string | number) => Promise<void>;
  getSubtitleTracks: (filePath: string) => Promise<unknown[]>;
  onPlayerPositionUpdate: (callback: (data: { position: number; duration: number }) => void) => void;
  onPlayerTracksUpdate: (callback: (tracks: unknown[]) => void) => void;
  onPlayerEnded: (callback: () => void) => void;
  onPlayerError: (callback: (error: string) => void) => void;
  onUploadMagnetDebug: (callback: (data: string) => void) => void;
  getWatchHistory: () => Promise<unknown[]>;
  addWatchEntry: (entry: unknown) => Promise<void>;
  updateWatchPosition: (infohash: string, position: number, duration: number) => Promise<void>;
  removeWatchEntry: (infohash: string) => Promise<void>;

  // Auto-update
  checkForUpdates: () => Promise<{ checking?: boolean; error?: string }>;
  onUpdateStatus: (callback: (data: { type: string; version?: string; percent?: number; message?: string }) => void) => void;
  getAppVersion: () => Promise<string>;
  getDebugFile: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
