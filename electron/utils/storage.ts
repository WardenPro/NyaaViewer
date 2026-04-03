import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.join(app.getPath('userData'), 'nyaa-viewer');
const HISTORY_FILE = path.join(STORAGE_DIR, 'watch-history.json');
const CONFIG_FILE = path.join(STORAGE_DIR, 'config.json');

// Ensure storage directory exists
function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// Read or initialize a JSON file
function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`Failed to read ${filePath}:`, e);
  }
  return fallback;
}

// Write to JSON file
function writeJsonFile(filePath: string, data: unknown): void {
  try {
    ensureStorageDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Failed to write ${filePath}:`, e);
  }
}

// Watch history
export interface WatchEntry {
  infohash: string;
  title: string;
  lastPosition: number;
  duration: number;
  lastWatched: string;
  magnetUri: string;
  selectedSubtitle?: { id: string; language: string };
}

function getHistoryPath(): string {
  return HISTORY_FILE;
}

export function getWatchHistory(): WatchEntry[] {
  return readJsonFile<WatchEntry[]>(getHistoryPath(), []);
}

export function addWatchEntry(entry: WatchEntry): void {
  const history = getWatchHistory();
  const existingIndex = history.findIndex((e) => e.infohash === entry.infohash);

  if (existingIndex >= 0) {
    history[existingIndex] = { ...history[existingIndex], ...entry, lastWatched: new Date().toISOString() };
  } else {
    history.unshift({ ...entry, lastWatched: new Date().toISOString() });
  }

  writeJsonFile(getHistoryPath(), history);
}

export function updateWatchPosition(infohash: string, position: number): void {
  const history = getWatchHistory();
  const entry = history.find((e) => e.infohash === infohash);

  if (entry) {
    entry.lastPosition = position;
    entry.lastWatched = new Date().toISOString();
    writeJsonFile(getHistoryPath(), history);
  }
}

export function removeWatchEntry(infohash: string): void {
  const history = getWatchHistory();
  const filtered = history.filter((e) => e.infohash !== infohash);
  writeJsonFile(getHistoryPath(), filtered);
}

// Config
export interface AppConfig {
  allDebridApiKey?: string;
  preferredSubtitleLang?: string;
}

export function getConfig(): AppConfig {
  return readJsonFile<Partial<AppConfig>>(CONFIG_FILE, {});
}

export function setConfig(config: Partial<AppConfig>): void {
  const existing = getConfig();
  writeJsonFile(CONFIG_FILE, { ...existing, ...config });
}

// Register IPC handlers
export function registerStorageHandlers(): void {
  ipcMain.handle('get-watch-history', (): WatchEntry[] => {
    return getWatchHistory();
  });

  ipcMain.handle('add-watch-entry', (_event, entry: WatchEntry): void => {
    addWatchEntry(entry);
  });

  ipcMain.handle('update-watch-position', (_event, infohash: string, position: number): void => {
    updateWatchPosition(infohash, position);
  });

  ipcMain.handle('remove-watch-entry', (_event, infohash: string): void => {
    removeWatchEntry(infohash);
  });
}
