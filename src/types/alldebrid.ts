import type { TorrentFile } from './player';

export interface VerifyAllDebridKeyResult {
  success: boolean;
  error?: string;
  username?: string;
}

export interface UploadMagnetResult {
  id?: number;
  ready?: boolean;
  error?: string;
}

export interface TorrentStatusResult {
  ready: boolean;
  status?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

export interface UnlockLinkResult {
  success: boolean;
  link?: string;
  error?: string;
}

export type GetTorrentFilesResult = TorrentFile[];
