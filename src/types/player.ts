import type { NyaaResult } from './nyaa';

export type PlayerPlaybackStatus = 'idle' | 'playing' | 'paused';

export interface TorrentFile {
  path: string;
  size: number;
  id: number;
  link?: string;
}

export interface SubtitleTrack {
  id: string;
  language: string;
  codec: string;
  name?: string;
  forced?: boolean;
  default?: boolean;
}

export interface PlayerPositionUpdateData {
  position: number;
  duration: number;
}

export interface PlayerState {
  status: PlayerPlaybackStatus;
  currentTorrent: NyaaResult | null;
  currentPosition: number;
  duration: number;
}
