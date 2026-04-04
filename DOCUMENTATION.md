# NyaaViewer - Complete Technical Documentation

> v1.3.0 — Electron desktop app for searching and streaming anime torrents from nyaa.si via AllDebrid + mpv.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Build System & Configuration](#2-build-system--configuration)
3. [Entry Points](#3-entry-points)
4. [Global State Management (Zustand Store)](#4-global-state-management-zustand-store)
5. [Renderer Process — Pages](#5-renderer-process--pages)
6. [Renderer Process — Components](#6-renderer-process--components)
7. [Renderer Process — Styles](#7-renderer-process--styles)
8. [Main Process — Electron Entry](#8-main-process--electron-entry)
9. [Main Process — Preload / Context Bridge](#9-main-process--preload--context-bridge)
10. [IPC Handlers](#10-ipc-handlers)
11. [Services](#11-services)
12. [Utilities](#12-utilities)
13. [Scripts](#13-scripts)
14. [Data Flow Diagrams](#14-data-flow-diagrams)
15. [Key Design Patterns & Conventions](#15-key-design-patterns--conventions)
16. [API Reference — AllDebrid v4/v4.1](#16-api-reference--alldebrid-v4v41)
17. [API Reference — nyaa.si RSS](#17-api-reference--nyaasi-rss)
18. [Platform-Specific Behavior](#18-platform-specific-behavior)
19. [Debugging & Troubleshooting](#19-debugging--troubleshooting)
20. [Known Limitations & TODOs](#20-known-limitations--todos)

---

## 1. Architecture Overview

The application follows the **Electron main/renderer process pattern** with IPC as the sole communication channel between them.

```
┌───────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS (React)                │
│                                                            │
│  main.tsx ──► App.tsx ──► Routes ──► Pages ──► Components │
│  ┌─────────────────┐    ┌─────────────────────┐           │
│  │ HomePage        │    │ PlayerPage          │           │
│  │ - hero search   │    │ - magnet upload     │           │
│  │ - trending      │    │ - poll AD status    │           │
│  │ - resume watch  │    │ - unlock link       │           │
│  │                 │    │ - mpv playback      │           │
│  │ SearchPage      │    │ - subtitle select   │           │
│  │ - result cards  │    │ - watch history     │           │
│  │ - sort/filter   │    │ - progress bar      │           │
│  │                 │    │                     │           │
│  │ SettingsPage    │    │ SearchPage          │           │
│  │ - AD API key    │    │ - results grid      │           │
│  │ - subtitle lang │    │ - resolution filter │           │
│  │ - auto-update   │    │                     │           │
│  │                 │    │ SettingsPage        │           │
│  │                 │    │ - AD config         │           │
│  │                 │    │ - prefs             │           │
│  └────────┬────────┘    └──────────┬──────────┘           │
│           └───────────┐  ┌────────┘                      │
│                  Zustand Store (appStore.ts)              │
│                       ┌───┴───┐                           │
│            contextBridge.exposeInMainWorld                │
│                       │window.electronAPI                 │
└───────────────────────┼───────────────────────────────────┘
                        │ ipcRenderer.invoke / .on
┌───────────────────────┼───────────────────────────────────┐
│                    MAIN PROCESS (Electron)                  │
│                                                             │
│  main.ts ─── creates BrowserWindow, registers IPC handlers  │
│                                                             │
│  IPC Layer          Service Layer         Utils           │
│  ┌─────────────┐   ┌───────────────┐   ┌───────────────┐  │
│  │ search.ts   │──►│ nyaa.ts       │   │ storage.ts    │  │
│  │             │   │ (RSS+XML)     │   │ (JSON files)  │  │
│  │ alldebrid.ts│──►│ alldebrid.ts  │   │ binaries.ts   │  │
│  │             │   │ (axios API)   │   │ (path resol.) │  │
│  │ player.ts   │──►│ mpv.ts        │   │               │  │
│  │             │   │ (spawn+sock)  │   │               │  │
│  │             │──►│ subtitles.ts  │   └───────────────┘  │
│  │             │   │ (mediainfo)   │                       │
│  │             │──►│ video-window  │                       │
│  │             │   │ (BrowserView) │                       │
│  └─────────────┘   └───────────────┘                       │
│                                                             │
│  Auto-Updater: electron-updater (GitHub Releases)          │
└─────────────────────────────────────────────────────────────┘
```

### Core Concept

The user never downloads torrent files locally. Instead:
1. Search nyaa.si via RSS — no torrent file download needed
2. Upload magnet link to AllDebrid's servers
3. AllDebrid downloads the torrent server-side
4. Once ready, AllDebrid provides direct streaming URLs for individual files
5. The app streams via mpv with subtitle support and watch history tracking

---

## 2. Build System & Configuration

### package.json

| Field | Value |
|-------|-------|
| Name | `nyaa-viewer` |
| Version | `1.3.0` |
| Main entry | `dist-electron/main.js` |

**Scripts:**

| Script | What it does |
|--------|-------------|
| `npm run dev` | Launches Vite dev server on localhost:5173, Electron loads from dev server |
| `npm run build` | Downloads binaries → `tsc` → `vite build` → `electron-builder` (all platforms) |
| `npm run build:win` | Same as build but `electron-builder --win` (NSIS installer) |
| `npm run build:mac` | Same as build but `electron-builder --mac` (DMG + zip) |
| `npm run build:lintest` | Same as build but `electron-builder --linux` (AppImage) |
| `npm run preview` | `vite preview` — serve production build locally |
| `npm run typecheck` | `tsc --noEmit` — type check without emitting |
| `npm run download-binaries` | Runs `scripts/download-binaries.js` to fetch mpv/mediainfo |

**Runtime Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `axios` | ^1.7.0 | HTTP client for AllDebrid API calls |
| `electron-updater` | ^6.8.3 | Auto-update via GitHub Releases |
| `fast-xml-parser` | ^4.4.0 | Parse nyaa.si RSS XML feeds |
| `react` | ^18.3.0 | UI library |
| `react-dom` | ^18.3.0 | React DOM renderer |
| `react-router-dom` | ^6.28.0 | Client-side routing (HashRouter) |
| `zustand` | ^5.0.0 | Global state management |

**Dev Dependencies:** TypeScript 5.6, Vite 6, vite-plugin-electron 0.28, vite-plugin-electron-renderer 0.14, Electron 33, electron-builder 25, TailwindCSS 3.4, PostCSS, Autoprefixer, @types/react, @types/react-dom, @vitejs/plugin-react.

### tsconfig.json

- **Target**: ES2020
- **Module**: ESNext
- **ModuleResolution**: bundler
- **JSX**: react-jsx
- **noEmit**: true (Vite handles compilation)
- **skipLibCheck**: true
- **strict**: false — NOT in strict mode
- **noUnusedLocals**: false
- **noUnusedParameters**: false
- **Includes**: `src/**`, `electron/**`

### vite.config.ts

- Uses `@vitejs/plugin-react` for JSX transform and HMR
- Two `vite-plugin-electron` entries:
  - `electron/main.ts` → `dist-electron/main.js`
  - `electron/preload.ts` → `dist-electron/preload.js`
- Path alias: `@` → `./src`
- `vite-plugin-electron-renderer` enables limited Node.js APIs in renderer
- Dev server proxies API requests to `localhost:9587` (Electron main)

### electron-builder.yml

```yaml
appId: com.nyaaviewer.app
productName: NyaaViewer
directories:
  output: release/
files: [dist, dist-electron, bin/**/*]

# Windows: NSIS (not one-click, per-machine, custom install dir allowed)
# macOS: DMG + zip, category: entertainment
# Linux: AppImage, category: Utility
# Publish: GitHub Releases → WardenPro/NyaaViewer
```

### index.html

Minimal HTML shell with:
- `<meta charset="UTF-8" />`
- `<meta http-equiv="Content-Security-Policy" content="..." />` — restricts allowed sources
- Loads `/src/main.tsx` via Vite

### tailwind.config.js

Custom color palette:
- **Primary**: indigo family (#6366f1 base, #4f46e5 dark, #818cf8 light)
- **Dark theme**: bg #0f0f14, card #1a1a22, border #2a2a3a, text #e2e8f0

### postcss.config.js

Standard Tailwind + Autoprefixer setup.

---

## 3. Entry Points

### src/main.tsx — React Entry

```tsx
import { HashRouter } from 'react-router-dom';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
```

**Why HashRouter?** BrowserRouter uses the History API which doesn't work with Electron's `file://` protocol. HashRouter uses URL hash fragments which work correctly with local file loading.

### electron/main.ts — Electron Main Entry

**Window Creation:**
- Size: 1200x800, centered
- `titleBarStyle: 'hiddenInset'` — custom title bar (Mac-style traffic lights)
- `contextIsolation: true` — security: renderer can't access Node.js directly
- `nodeIntegration: false` — security: no Node.js in renderer
- `webPreferences.preload: path.join(__dirname, 'preload.js')` — exposes electronAPI

**Dev vs Production:**
- Dev: `mainWindow.loadURL('http://localhost:5173')`
- Production: `mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))`

**Auto-Updater (production only):**
- Waits 2 seconds after window shows
- `autoUpdater.checkForUpdates()`
- Checks every 4 hours via `setInterval`
- Events forwarded via `mainWindow.webContents.send('auto-update:status', {...})`
- Statuses: `checking`, `available`, `downloading`, `downloaded`, `error`
- On `downloaded`: calls `autoUpdater.quitAndInstall()`

**IPC Registration:** Calls `registerSearchHandlers()`, `registerAllDebridHandlers()`, `registerPlayerHandlers()`, `registerStorageHandlers()` from respective IPC modules.

**Export:** `getMainWindow()` — getter used by IPC handler modules.

### src/App.tsx — Router + Auto-Update Banner

**Routes:**
- `/` → `HomePage`
- `/search` → `SearchPage`
- `/player` → `PlayerPage`
- `/settings` → `SettingsPage`
- `*` → redirect to `/`

**Auto-Update Banner:**
- Subscribes to `window.electronAPI.onUpdateStatus`
- Shows fixed banner at bottom-right when status is `downloading`
- Displays progress bar with percentage
- Message: `Downloading update v{version}...` and `Update downloaded - installing on next launch` when done

---

## 4. Global State Management (Zustand Store)

**File:** `src/store/appStore.ts`

Single Zustand store managing all frontend state. All state is synchronous and reactive.

### Store Slices

#### Search Slice
| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `searchQuery` | string | `''` | Current search text |
| `searchResults` | NyaaResult[] | `[]` | Results from nyaa.si RSS |
| `isSearching` | boolean | `false` | Loading spinner flag |
| `setSearchQuery` | (q: string) => void | — | Sets query |
| `setSearchResults` | (results: NyaaResult[]) => void | — | Sets results |
| `setIsSearching` | (v: boolean) => void | — | Sets loading flag |

#### Trending Slice
| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `trendingResults` | NyaaResult[] | `[]` | Top-seeded torrents |
| `setTrendingResults` | (results: NyaaResult[]) => void | — | Sets trending |

#### Player Slice (nested `player` object)
| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `player.isPlaying` | boolean | `false` | Whether mpv is playing |
| `player.currentTorrent` | NyaaResult \| null | `null` | Currently playing torrent |
| `player.currentPosition` | number | `0` | Current playback position (seconds) |
| `player.duration` | number | `0` | Total duration (seconds) |
| `setPlayerState` | (Partial<PlayerState>) => void | — | Merges partial state |
| `resetPlayerState` | () => void | — | Resets all player state |

#### Settings Slice
| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `allDebridApiKey` | string | `''` | AllDebrid API key |
| `isADConnected` | boolean | `false` | Connection status |
| `adUsername` | string | `''` | AD account username |
| `setAllDebridApiKey` | (key: string) => void | — | Sets API key |
| `setADConnected` | (connected, username?) => void | — | Sets connection state |

#### Watch History Slice
| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `watchHistory` | WatchEntry[] | `[]` | History of watched torrents |
| `setWatchHistory` | (history: WatchEntry[]) => void | — | Sets full history |
| `updateHistoryPosition` | (infohash, pos, dur) => void | — | Updates position (upserts) |

**Note:** `updateHistoryPosition` only updates existing entries — it doesn't create new ones. New entries are created via `addWatchEntry` in the main process storage.ts.

#### Subtitle Preference Slice
| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `preferredSubtitleLang` | string | `'en'` | Default subtitle language |
| `setPreferredSubtitleLang` | (lang: string) => void | — | Sets preferred language |

### Exported Types

```typescript
interface NyaaResult {
  title: string; size: string; seeders: number; leechers: number;
  date: string; infohash: string; magnetUri: string; resolution?: string;
}

interface TorrentFile {
  path: string; size: number; id: number;
}

interface WatchEntry {
  infohash: string; title: string; lastPosition: number; duration: number;
  lastWatched: string; magnetUri: string;
  selectedSubtitle?: { id: string; language: string };
}

interface PlayerState {
  isPlaying: boolean; currentTorrent: NyaaResult | null;
  currentPosition: number; duration: number;
}
```

---

## 5. Renderer Process — Pages

### 5.1 HomePage.tsx
**Purpose:** Landing page with hero search, trending torrents, and resume-watching.

**Key behavior:**
- On mount: fetches trending torrents via `window.electronAPI.getTrending()` and watch history via `window.electronAPI.getWatchHistory()`
- Calls `setTrendingResults()` and `setWatchHistory()` in store to populate state
- Renders three sections:
  1. **Hero** — large centered search bar with subtitle text
  2. **Resume Watching** — `<ResumeWatchSection entries={watchHistory}>` (shows only if history exists)
  3. **Trending** — `<TrendingSection items={trending}>` (shows only if trending exists)

### 5.2 SearchPage.tsx
**Purpose:** Search results grid with filtering and sorting.

**Key behavior:**
- On mount or when `searchQuery` changes: calls `window.electronAPI.searchNyaa(query, resolutionFilter)`
- Resolution filter: dropdown (All, 1080p, 720p, 480p) — filters results client-side by resolution tag
- Sort toggle: by seeders (default, descending) or title (alphabetical A→Z)
- Each result rendered as `<SearchResult torrent={item}>`
- "Stream" button navigates to `/player` with route state: `{ state: { torrent } }`
- Shows loading spinner while `isSearching` is true
- Empty state message when no results found

### 5.3 PlayerPage.tsx
**Purpose:** Complete streaming flow — torrent upload, polling, file selection, mpv playback, subtitle control, watch history persistence.

**Key state variables:**
- `isLoading` — shows spinner during magnet upload/polling
- `torrentStatus` — current AD torrent status (downloading, ready, error)
- `torrentFiles` — list of files in the torrent from AD
- `selectedFile` — which video file to play
- `subtitleTracks` — available subtitle tracks from mediainfo
- `selectedSubtitle` — currently active subtitle track
- `error` — error message for display
- `pollProgress` — 0-100 during magnet download wait
- `showDebug` / `debugContent` — debug mode for troubleshooting

**Streaming flow (`startTorrentFlow` function):**
1. Check AD API key exists in store — if not, show error
2. `uploadMagnet(magnetUri)` → returns `{ id, ready, data }`
3. If not ready: start polling loop
   - Every 5s: `getTorrentStatus(id)` → check `statusCode === 4` (ready) or `=== 5` (error)
   - Max 120 attempts (10 min) → timeout error
   - Update `pollProgress` = `(attempt / 120) * 100`
4. Once ready: `getTorrentFiles(id)` → filter to video extensions (`.mkv`, `.mp4`, `.webm`, `.avi`, `.mov`, `.wmv`), sort by size descending
5. If multiple video files → show file picker UI
6. User selects file (or auto-picks largest)
7. `unlockLink(selectedFile.link)` → `{ success, link }` (direct streaming URL)
8. `startPlayback(url)` → spawns mpv in main process
9. Set up event listeners: position updates, track updates, playback end, errors

**Playback controls UI:**
- Progress bar (current pos / duration) — clickable to seek
- Play/Pause toggle button
- Stop button (kills mpv, resets state, navigates back to `/search`)
- Subtitle selector dropdown

**Watch history persistence:**
- Every 30s while playing: `updateWatchPosition(infohash, position, duration)`
- Also called on playback end with final position
- Uses `addWatchEntry` IPC to create/update entries in main process

**Error handling:**
- No API key → error message with link to settings
- AD API error → error with debug info
- Magnet timeout → "Download timed out after 10 minutes"
- mpv error → "Playback failed to start"
- No video files → "No video files found in torrent"

### 5.4 SettingsPage.tsx
**Purpose:** User configuration — AD API key, subtitle language, auto-updates.

**Sections:**
1. **AllDebrid Configuration:**
   - Password-masked input for API key
   - "Test & Save" button → calls `verifyAllDebridKey(key)`
   - Connection status: green "Connected as {username}" or red error
   - On mount: auto-loads saved key from storage, verifies connection

2. **Subtitle Preferences:**
   - Dropdown: en, fr, es, ja, de, pt, it
   - Saves to store AND persists via `setConfig` IPC to disk

3. **About:**
   - App version (from `getAppVersion()`)
   - Manual update check button
   - Status display for update progress

---

## 6. Renderer Process — Components

### 6.1 Layout.tsx
Collapsible sidebar navigation shell. 56px collapsed, 224px expanded. Three nav items: Home (`/`), Search (`/search`), Settings (`/settings`). Active route highlighted with primary color. Toggle button changes between hamburger/X icon.

### 6.2 SearchBar.tsx
Form with text input (placeholder "Search nyaa.si...") and resolution dropdown (All, 1080p, 720p, 480p). Resolution selection shows a badge pill. On submit: sets query in store, navigates to `/search`. Supports Enter key submission.

### 6.3 SearchResult.tsx
Single torrent result card. Shows: resolution badge (auto-detected from title), title (truncated, hover color change), seeders (color-coded: green >50, yellow >10, red ≤10), leechers, size, date. "Stream" button appears on hover with opacity transition.

### 6.4 ResumeWatchSection.tsx
Responsive grid (1→2→3 columns) of "continue watching" cards. Each card: title (truncated), progress bar (`width: (pos/dur)*100%`), formatted timestamps, last-watched date, remove (x) button on hover. Clicking navigates to `/player` with torrent from history.

### 6.5 SubtitleSelector.tsx
Subtitle track list with human-readable language mapping (en→English, fr→French, etc.). "Off" option always first. Each track shows language name + codec (SRT, ASS, PGS, etc.). Selected track highlighted with primary color background.

### 6.6 TrendingSection.tsx
Numbered list (1-10) of most-seeded torrents. Each item: title + seeder count. Clicking navigates to `/search` with torrent title as query. **Note:** imports `useAppStore` at bottom of file (after component) to avoid hoisting issues.

---

## 7. Renderer Process — Styles

### globals.css
Tailwind directives (`@tailwind base`, `@tailwind components`, `@tailwind utilities`). Custom dark color palette via tailwind.config.js.

**Custom utility classes (via @apply):**
- `.card` — `bg-dark-card rounded-xl p-4 border border-dark-border`
- `.btn-primary` — `bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary-dark transition-colors`
- `.btn-secondary` — `bg-dark-border text-dark-text rounded-lg px-4 py-2 hover:bg-dark-border-hover transition-colors`
- `.input-field` — `bg-dark-input text-dark-text rounded-lg px-3 py-2 border border-dark-border focus:outline-none focus:border-primary`

**Global styles:** Reset (margin, padding, box-sizing), custom thin dark scrollbar, system sans-serif font.

### tailwind.config.js
- Primary: indigo (#6366f1 base, #4f46e5 dark, #818cf8 light)
- Dark theme: bg #0f0f14, card #1a1a22, border #2a2a3a, text #e2e8f0

---

## 8. Main Process — Electron Entry

### electron/main.ts

**Window creation:**
- Size: 1200×800, centered
- `titleBarStyle: 'hiddenInset'` (Mac-style traffic lights)
- `contextIsolation: true`, `nodeIntegration: false`
- Preload: `dist-electron/preload.js`

**Dev vs Production:**
- Dev: loads `http://localhost:5173`
- Prod: loads `dist/index.html` via `loadFile`

**Auto-updater (prod only):**
- 2s delay after window show → `checkForUpdates()`
- Every 4 hours → `checkForUpdates()`
- Events forwarded to renderer: checking → available → downloading (progress %) → downloaded → `quitAndInstall()`
- On "downloaded": auto-installs on next restart

**Exports:** `getMainWindow()` — accessor used by IPC modules

---

## 9. Main Process — Preload / Context Bridge

### electron/preload.ts

Exposes `window.electronAPI` via `contextBridge.exposeInMainWorld`. Complete API reference:

#### Search
| Method | Params | Returns |
|--------|--------|---------|
| `searchNyaa` | `query, filter?` | `Promise<NyaaResult[]>` |
| `getTrending` | — | `Promise<NyaaResult[]>` |

#### AllDebrid
| Method | Params | Returns |
|--------|--------|---------|
| `verifyAllDebridKey` | `apiKey` | Promise<{success, username?, error?}> |
| `uploadMagnet` | `magnetUri` | Promise<{id, ready}> |
| `getTorrentStatus` | `torrentId` | Promise<{ready, status}> |
| `getTorrentFiles` | `torrentId` | Promise<TorrentFile[]> |
| `unlockLink` | `fileLink` | Promise<{success, link?, error?}> |
| `setAllDebridKey` | `apiKey` | Promise<void> |
| `getAllDebridKey` | — | Promise<string|null> |

#### Player
| Method | Params | Returns |
|--------|--------|---------|
| `startPlayback` | `url` | Promise<{success, error?}> |
| `pausePlayback` | — | Promise<void> |
| `seekPlayback` | `position: number` | Promise<void> |
| `stopPlayback` | — | Promise<void> |
| `getPlayerPosition` | — | Promise<{position, duration}> |
| `setSubtitleTrack` | `trackId` | Promise<void> |
| `getSubtitleTracks` | `filePath` | Promise<unknown[]> |
| `setupVideoWindow` | — | Promise<{success, error?}> (unused) |
| `showVideoWindow` | `bounds` | Promise<number|null> (unused) |
| `hideVideoWindow` | — | Promise<void> (unused) |

#### Player Events
| Event | Callback | Description |
|-------|----------|-------------|
| `onPlayerPositionUpdate` | `{position, duration}` | Every 1s while playing |
| `onPlayerTracksUpdate` | `tracks[]` | Subtitle track changes |
| `onPlayerEnded` | — | Playback completed |
| `onPlayerError` | `error: string` | Playback failure |

#### Storage
| Method | Params | Returns |
|--------|--------|---------|
| `getWatchHistory` | — | Promise<WatchEntry[]> |
| `addWatchEntry` | `entry` | Promise<void> |
| `updateWatchPosition` | `infohash, pos, dur` | Promise<void> |
| `removeWatchEntry` | `infohash` | Promise<void> |

#### Utilities
| Method | Returns | Description |
|--------|---------|-------------|
| `checkForUpdates` | Promise | Manual update check |
| `onUpdateStatus` | `{type, version?, percent?, message?}` | Auto-update events |
| `getAppVersion` | Promise<string> | App version string |
| `getDebugFile` | Promise<string|null> | `/tmp/nyaa-debug.json` contents |

---


### 10.1 search.ts
**File:** `electron/ipc/search.ts`

| Handler | IPC Channel | Service Call | Description |
|---------|------------|--------------|-------------|
| `search-nyaa` | `search-nyaa(query, filter?)` | `searchNyaa(query, filter)` | Searches nyaa.si RSS |
| `get-trending` | `get-trending()` | `getTrending()` | Gets top 10 trending |

**Filter behavior:** If `filter` is provided (e.g., "1080p"), only returns results where `resolution === filter`. Filter is applied in the nyaa.ts service during RSS parsing.

### 10.2 alldebrid.ts
**File:** `electron/ipc/alldebrid.ts`

| Handler | IPC Channel | Service Call | Description |
|---------|------------|--------------|-------------|
| `verify-alldebrid-key` | `verify-alldebrid-key(apiKey)` | `AllDebridService.verifyKey(apiKey)` | Verifies credentials |
| `upload-magnet` | `upload-magnet(magnetUri)` | `AllDebridService.uploadMagnet(magnetUri)` | Uploads magnet to AD |
| `get-torrent-status` | `get-torrent-status(torrentId)` | `AllDebridService.getTorrentStatus(torrentId)` | Polls torrent status |
| `get-torrent-files` | `get-torrent-files(torrentId)` | `AllDebridService.getTorrentFiles(torrentId)` | Gets file list |
| `unlock-link` | `unlock-link(fileLink)` | `AllDebridService.unlockFile(fileLink)` | Gets streaming URL |
| `set-alldebrid-key` | `set-alldebrid-key(apiKey)` | Service.setKey + storage.setConfig | Sets and persists key |
| `get-alldebrid-key` | `get-alldebrid-key()` | Returns singleton key | Gets current saved key |
| `get-debug-file` | `get-debug-file()` | Reads `/tmp/nyaa-debug.json` | Debug file contents |

**Startup behavior:** On module load, reads saved API key from `storage.ts` and calls `AllDebridService.setApiKey()` if found.

### 10.3 player.ts
**File:** `electron/ipc/player.ts`

| Handler | IPC Channel | Service Call | Description |
|---------|------------|--------------|-------------|
| `start-playback` | `start-playback(url)` | `mpvService.startPlayback(url)` | Spawns mpv process |
| `pause-playback` | `pause-playback()` | `mpvService.pause()` | Toggles pause |
| `seek-playback` | `seek-playback(position)` | `mpvService.seek(position)` | Seeks to position |
| `stop-playback` | `stop-playback()` | `mpvService.stop()` | Kills mpv |
| `get-player-position` | `get-player-position()` | `mpvService.getPosition()` | Gets pos/duration |
| `set-subtitle-track` | `set-subtitle-track(trackId)` | `mpvService.setSubtitleTrack(trackId)` | Sets subtitle |
| `get-subtitle-tracks` | `get-subtitle-tracks(filePath)` | `extractSubtitleTracks(filePath)` | Gets tracks from file |
| `setup-video-window` | `setup-video-window()` | `videoWindowService.create()` | Creates BrowserView (unused) |
| `show-video-window` | `show-video-window(bounds)` | `videoWindowService.show()` | Shows BrowserView (unused) |
| `hide-video-window` | `hide-video-window()` | `videoWindowService.hide()` | Hides BrowserView (unused) |

**Event forwarding setup (in mpv.ts):**
```typescript
mpvService.onPositionUpdate((data) => mainWindow.webContents.send('player-position-update', data));
mpvService.onEnded(() => mainWindow.webContents.send('player-ended'));
mpvService.onError((err) => mainWindow.webContents.send('player-error', err));
mpvService.onTracks((tracks) => mainWindow.webContents.send('player-tracks-update', tracks));
```

---

## 10. IPC Handlers

### 10.1 ipc/search.ts
**File:** `electron/ipc/search.ts`

| Handler | IPC Channel | Service Call | Description |
|---------|-------------|--------------|-------------|
| search-nyaa | `ipcRenderer.invoke('search-nyaa', query, filter?)` | `searchNyaa(query, filter)` | Searches nyaa.si RSS feed |
| get-trending | `ipcRenderer.invoke('get-trending')` | `getTrending()` | Gets top 10 trending torrents |

**Filter behavior:** If `filter` is provided (e.g. "1080p"), client-side filtering keeps only results where `resolution === filter`.

### 10.2 ipc/alldebrid.ts
**File:** `electron/ipc/alldebrid.ts`

| Handler | IPC Channel | Description |
|---------|-------------|-------------|
| verify-alldebrid-key | `verifyAllDebridKey(apiKey)` | Verifies credentials via AD `/v4/user` |
| upload-magnet | `uploadMagnet(magnetUri)` | Uploads magnet to AD servers |
| get-torrent-status | `getTorrentStatus(torrentId)` | Polls torrent download progress |
| get-torrent-files | `getTorrentFiles(torrentId)` | Gets file list from completed torrent |
| unlock-link | `unlockLink(fileLink)` | Gets direct streaming URL for a file |
| set-alldebrid-key | `setAllDebridKey(apiKey)` | Sets key on service AND persists to config.json |
| get-alldebrid-key | `getAllDebridKey()` | Returns currently saved API key |
| get-debug-file | `getDebugFile()` | Reads `/tmp/nyaa-debug.json` for troubleshooting |

**Startup behavior:** On module load, reads saved API key from `storage.ts` and calls `AllDebridService.setApiKey()` if a key exists.

### 10.3 ipc/player.ts
**File:** `electron/ipc/player.ts`

| Handler | IPC Channel | Service Call | Description |
|---------|-------------|--------------|-------------|
| start-playback | `startPlayback(url)` | `mpvService.startPlayback(url)` | Spawns mpv with streaming URL |
| pause-playback | `pausePlayback()` | `mpvService.pause()` | Toggle play/pause |
| seek-playback | `seekPlayback(position)` | `mpvService.seek(position)` | Seek to absolute position (seconds) |
| stop-playback | `stopPlayback()` | `mpvService.stop()` | Kill mpv process + clean up |
| get-player-position | `getPlayerPosition()` | `mpvService.getPosition()` | Get current pos + duration |
| set-subtitle-track | `setSubtitleTrack(trackId)` | `mpvService.setSubtitleTrack(trackId)` | Set subtitle track (or "no") |
| get-subtitle-tracks | `getSubtitleTracks(filePath)` | `extractSubtitleTracks(filePath)` | Get subtitle tracks from media file |
| setup-video-window | `setupVideoWindow()` | `videoWindowService.create()` | Create BrowserView (unused) |
| show-video-window | `showVideoWindow(bounds)` | `videoWindowService.show()` | Show BrowserView (unused) |
| hide-video-window | `hideVideoWindow()` | `videoWindowService.hide()` | Hide BrowserView (unused) |

**Event forwarding** — mpvService emits events that are forwarded to the renderer via `webContents.send`:
- `player-position-update` — every 1s while playing → `{position: number, duration: number}`
- `player-tracks-update` — when subtitle tracks are fetched → `SubtitleTrack[]`
- `player-ended` — when mpv process exits naturally → no data
- `player-error` — on stderr or socket errors → error message string

---

## 11. Services

### 11.1 nyaa.ts — Search Engine
**File:** `electron/services/nyaa.ts`

**Functions:**

#### `searchNyaa(query: string, filter?: string): Promise<NyaaResult[]>`
Fetches `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}` with custom User-Agent `NyaaViewer/1.3.0`.

**Parsing flow:**
1. `fetch()` with 15s timeout
2. `XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })`
3. Extracts `rss.channel.item` array
4. For each item:
   - `title` — from RSS `<title>`
   - `size` — from `<nyaa:infoHash>` size field
   - `seeders/leechers` — from `<nyaa:seeders>` / `<nyaa:leechers>`
   - `date` — from `<pubDate>`, parsed to ISO
   - `infoHash` — from `<nyaa:infoHash>` (40-char hex)
   - `magnetUri` — constructed as `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}&tr=${encodeURIComponent(announceUrl)}`
   - `resolution` — auto-detected from title (`/1080p/i`, `/720p/i`, `/480p/i`)

5. Filters: only items with valid 40-char infohash
6. Optional: if `filter` is set, only returns matching resolution
7. Sorts by seeders descending

#### `getTrending(): Promise<NyaaResult[]>`
Same as `searchNyaa` but fetches `https://nyaa.si/?page=rss` (no query parameter). Returns top 10 items by seeders.

### 11.2 alldebrid.ts — API Client
**File:** `electron/services/alldebrid.ts`

**Constructor:**
```typescript
this.api = axios.create({
  baseURL: 'https://api.alldebrid.com',
  timeout: 30000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
```

**Methods:**

#### `setApiKey(key: string)`
Sets the Bearer auth header: `Authorization: Bearer ${key}`

#### `verifyKey(key: string): Promise<{success: boolean; username?: string; error?: string}>`
GET `/v4/user?agent=nyaa-viewer&apikey=${key}`

Returns `{ success: true, username }` or `{ success: false, error }`.

#### `uploadMagnet(magnetUri: string): Promise<{id: number; ready: boolean; data?: any}>`
POST `/v4/magnet/upload`
Body: `magnets[]=${encodeURIComponent(magnetUri)}&agent=nyaa-viewer`

Returns `{ id: number, ready: boolean, data: { magnets: [...] } }`.

#### `getTorrentStatus(id: number): Promise<{ready: boolean; status: string; fileName?: string; fileSize?: number}>`
POST `/v4.1/magnet/status`
Body: `id=${id}&agent=nyaa-viewer`

Status codes:
- `0`: Unknown
- `1`: Downloading
- `2`: Downloaded
- `3`: Error
- `4`: Ready (statusCode === 4 means ready)
- `5`: Uploading
- `6`: Archived

Returns `{ ready: statusCode === 4, status: magnet.status, fileName, fileSize }`.

#### `getTorrentFiles(id: number): Promise<{path: string; size: number; id: number; link: string}[]>`
POST `/v4/magnet/files`
Body: `id[]=${id}&agent=nyaa-viewer`

Recursively flattens nested file/folder structure:
```typescript
function flatten(files: any[], parentPath = ''): File[] {
  return files.flatMap((f) => {
    const path = parentPath ? `${parentPath}/${f.n}` : f.n;
    return f.e ? [{ path, size: f.s, id: f.id, link: f.l }] : flatten(f.f || [], path);
  });
}
```

#### `unlockFile(fileLink: string): Promise<{success: boolean; link?: string; error?: string}>`
POST `/v4/link/unlock`
Body: `link=${encodeURIComponent(fileLink)}&agent=nyaa-viewer`

Returns `{ success, link: data.link }` where `link` is the direct streaming URL.

**Debug logging:** All API responses are written to `/tmp/nyaa-debug.json` for troubleshooting.

### 11.3 alldebrid-singleton.ts — Global Instance
**File:** `electron/services/alldebrid-singleton.ts`

Exports a single global `AllDebridService` instance. All IPC handlers import and use this shared instance. The API key is set once on startup from storage and updated when the user changes it.

### 11.4 mpv.ts — Player Process
**File:** `electron/services/mpv.ts`

**Architecture:** mpv is spawned as a child process with Unix domain socket IPC communication.

**Key properties:**
- `process: ChildProcess | null` — the mpv child process
- `socketPath: string` — Unix socket path (temp file)
- `socket: net.Socket | null` — connected socket for IPC
- `positionPoll: NodeJS.Timeout | null` — interval timer for position polling

**Methods:**

#### `startPlayback(url: string): Promise<void>`
1. Kills any existing mpv instance
2. Creates temp socket path: `${os.tmpdir()}/mpv-socket-${Date.now()}`
3. Spawns mpv with args:
   ```
   --no-terminal
   --input-ipc-server=<socketPath>
   --keep-open=yes
   --hwdec=auto
   --ytdl=no
   --sub-auto=fuzzy
   --slang=${preferredLang}
   --volume=100
   ```
4. Waits for socket file to appear (up to 30s, checking every 100ms)
5. Connects via `net.Socket` to the Unix socket
6. Starts position polling every 1s
7. Emits `onReady` event

#### `pause(): void`
Sends `cycle pause` command via `sendMessage('cycle', 'pause')`.

#### `seek(position: number): void`
Sends `seek ${position} absolute` command.

#### `stop(): void`
1. Sends `quit` command
2. Kills process if still alive
3. Cleans up socket file
4. Clears position poll

#### `setSubtitleTrack(trackId: string | number): void`
- If `trackId === 'no'` or `0`: sends `set sid no`
- Otherwise: sends `set sid ${trackId}`

#### `getPosition(): Promise<{position: number; duration: number}>`
Sends `get_property time-pos` and `get_property duration`, returns combined object.

#### `getTracks(): Promise<any[]>`
Sends `get_property track-list`, returns array of subtitle tracks.

#### `sendMessage(command: string, args?: any[]): void`
Formats JSON message: `{"command": ["${command}", ${args ? JSON.stringify(args) : ''}]}\n` and writes to socket.

#### `onMessage(callback: (message: any) => void): void`
Parses incoming socket data as JSON, calls callback with parsed message.

#### `onPositionUpdate(callback: (data: {position: number; duration: number}) => void): void`
Registers callback for position updates (called by polling loop).

#### `onEnded(callback: () => void): void`
Registers callback for playback completion (detected when mpv exits).

#### `onError(callback: (error: string) => void): void`
Registers callback for stderr or socket errors.

#### `onReady(callback: () => void): void`
Registers callback for when mpv is ready and socket is connected.

#### `onTracks(callback: (tracks: any[]) => void): void`
Registers callback for subtitle track list updates.

### 11.5 subtitles.ts — Subtitle Extraction
**File:** `electron/services/subtitles.ts`

**Function:** `extractSubtitleTracks(filePath: string): Promise<SubtitleTrack[]>`

Runs `mediainfo --Output=JSON ${filePath}` and parses the `media.track` array for tracks where `@type === 'Text'`.

**Extracted properties per track:**
- `id`: 1-based index (compatible with mpv's `--sid` flag)
- `language`: ISO 639-2 code (e.g., 'eng', 'fre', 'jpn')
- `format`: codec format (SRT, ASS, PGS, VobSub, etc.)
- `title`: track title/description
- `forced`: boolean — is forced subtitle
- `default`: boolean — is default subtitle

**Codec normalization:**
```typescript
const formatMap: Record<string, string> = {
  'SubRip': 'SRT',
  'Advanced SSA': 'ASS',
  'SubStation Alpha': 'SSA',
  'PGS': 'PGS',
  'VobSub': 'VOBSUB',
  'Timed Text': 'TTML',
  'WebVTT': 'VTT',
};
```

Also has a stub `extractSubtitleTracksFromUrl(url: string)` — not implemented, logs warning.

### 11.6 video-window.ts — BrowserView Overlay
**File:** `electron/services/video-window.ts`

Manages an Electron `BrowserView` that can overlay the main window. This is **currently unused** — the streaming flow uses mpv in its own standalone window instead.

**Methods:**
- `create(parent: BrowserWindow)`: Creates new BrowserView with preload
- `show(bounds: {x, y, width, height})`: Sets bounds and adds to parent window
- `hide()`: Removes view from parent window
- `destroy()`: Cleanup
- `getWindowId()`: Returns native window handle (HWND on Windows, NSWindow on Mac, X11 on Linux) for potential mpv embedding

---

## 12. Utilities

### 12.1 binaries.ts — Binary Path Resolution
**File:** `electron/utils/binaries.ts`

**Functions:**

#### `getBinDir(): string`
- Production: `${process.resourcesPath}/bin/`
- Dev: `${process.cwd()}/bin/`

#### `getMpvPath(): string`
- Checks bundled `bin/` first
- Falls back to system PATH
- Platform-specific names: `mpv.exe` (Win), `mpv` (Mac/Linux)

#### `getMediainfoPath(): string`
- Same strategy as `getMpvPath()`
- Platform-specific names: `mediainfo.exe` (Win), `MediaInfo` (Mac), `mediainfo` (Linux)

#### `areBinariesAvailable(): boolean`
- Checks both mpv and mediainfo exist on filesystem

#### `downloadBinaries(): Promise<void>`
- Downloads mpv and mediainfo for Windows/Mac from GitHub URLs
- Extracts archives (7z, zip, tar.gz/tar.bz2)
- Makes executable on Unix (`chmod +x`)
- Linux: tells user to install via package manager

### 12.2 storage.ts — JSON File Persistence
**File:** `electron/utils/storage.ts`

**Storage location:** `${app.getPath('userData')}/nyaa-viewer/`

**Files:**
- `watch-history.json` — array of WatchEntry objects
- `config.json` — `{ allDebridApiKey, preferredSubtitleLang }`

**Functions:**

#### `getWatchHistory(): Promise<WatchEntry[]>`
Reads and parses `watch-history.json`. Returns empty array on error.

#### `addWatchEntry(entry: WatchEntry): Promise<void>`
Upserts by infohash: if entry with same infohash exists, replaces it; otherwise appends.

#### `updateWatchPosition(infohash: string, position: number, duration: number): Promise<void>`
Finds entry by infohash, updates `lastPosition`, `duration`, and `lastWatched`. No-op if not found.

#### `removeWatchEntry(infohash: string): Promise<void>`
Removes entry matching infohash from array.

#### `getConfig(): Promise<{allDebridApiKey?: string; preferredSubtitleLang?: string}>`
Reads and parses `config.json`. Returns empty object on error.

#### `setConfig(partial: object): Promise<void>`
Merges partial config into existing config file.

#### `registerStorageHandlers(): void`
Wires up five IPC handlers:
- `get-watch-history` → `getWatchHistory()`
- `add-watch-entry` → `addWatchEntry(entry)`
- `update-watch-position` → `updateWatchPosition(infohash, position, duration)`
- `remove-watch-entry` → `removeWatchEntry(infohash)`

---

## 13. Scripts

### scripts/download-binaries.js

Downloads mpv binary for the current platform.

**Windows:** From `https://mpv.srsfckn.biz/mpv-latest-x86_64.7z`, extracts with 7zip or PowerShell.

**macOS:** From `https://laboratory.stolendata.net/~djinn/mpv_osx/mpv-latest.tar.gz`, extracts with `tar`.

**Linux:** Tells user to install via package manager (`sudo apt install mpv mediainfo`).

---

## 14. Data Flow Diagrams

### Search Flow
```
User types in SearchBar → onSubmit → setSearchQuery(store) → navigate('/search')
  → SearchPage useEffect: window.electronAPI.searchNyaa(query, resolutionFilter)
    → IPC: 'search-nyaa' → searchNyaa() in nyaa.ts
      → fetch('https://nyaa.si/?page=rss&q=...') → XMLParser → NyaaResult[]
  → setSearchResults(results) → render <SearchResult> cards
```

### Streaming Flow
```
User clicks "Stream" → navigate('/player', {state: {torrent}})
  → PlayerPage: startTorrentFlow()
    1. Check AD key in store → error if missing
    2. uploadMagnet(magnetUri) → IPC → POST /v4/magnet/upload → {id, ready}
    3. If not ready: poll getTorrentStatus(id) every 5s × 120
       → IPC → POST /v4.1/magnet/status → {statusCode, status, fileName}
    4. getTorrentFiles(id) → IPC → POST /v4/magnet/files → flatten → filter video
    5. If multiple files: show picker → user selects
    6. unlockLink(file.link) → IPC → POST /v4/link/unlock → {link}
    7. startPlayback(url) → IPC → mpvService.startPlayback(url)
       → spawn mpv → connect socket → poll position every 1s
    8. Position updates → webContents.send('player-position-update')
       → renderer: updateWatchPosition every 30s → persistence
    9. Playback ended → webContents.send('player-ended')
       → renderer: reset state → navigate('/search')
```

### Auto-Update Flow
```
App.tsx + SettingsPage: subscribe to onUpdateStatus
  → IPC listener: 'auto-update:status'

Main process: electron-updater
  → 2s after window shows: checkForUpdates()
  → Every 4h: checkForUpdates()
  → Events: checking → available → downloading (progress %) → downloaded → quitAndInstall
  → Renderer shows download progress banner in bottom-right corner
```

---

## 15. Key Design Patterns & Conventions

### 15.1 HashRouter over BrowserRouter
Required for Electron `file://` protocol. BrowserRouter's History API doesn't work with local file loading. Using `/#/` hash-based routing.

### 15.2 Main-Process-Only External Calls
All nyaa.si fetches and AllDebrid API calls go through the main process. This avoids CORS issues in the renderer and keeps API keys secure (never exposed to renderer process).

### 15.3 mpv as Detached Child with Unix Socket IPC
mpv is spawned as a child process with `--input-ipc-server=<socket>` flag. Communication uses JSON messages over Unix domain sockets. Position and track data are polled every 1 second. This is more reliable than HTML5 video for MKV/HEVC content and provides native subtitle support.

### 15.4 Singleton Pattern
- `AllDebridService` — one global instance, shared across all IPC handlers
- `mpvService` — one global instance, only one mpv can play at a time
- Both are initialized at module load time

### 15.5 Dual Persistence
- AllDebrid API key: saved to `config.json`, loaded on startup
- Watch history: saved to `watch-history.json`, loaded on homepage mount
- Both use JSON file storage in `app.getPath('userData')`

### 15.6 Debug Dumping
All AllDebrid API responses are written to `/tmp/nyaa-debug.json`. Accessible via `get-debug-file` IPC handler for troubleshooting.

### 15.7 Resolution Detection
Done both on backend (nyaa.ts parses title with regex) and frontend (SearchResult component re-detects from title as fallback). Resolution badge shows "1080p", "720p", "480p", or "Unknown".

### 15.8 Form-Encoded API Calls
All AllDebrid POST requests use `Content-Type: application/x-www-form-urlencoded` with `URLSearchParams`, NOT JSON. This matches the AllDebrid v4/v4.1 API specification.

### 15.9 Polling-Based Readiness
Magnet readiness checked every 5 seconds for up to 10 minutes (120 attempts). Progress bar shown as `(attempt / 120) * 100%`. Timeout returns error after 120 attempts.

### 15.10 TypeScript Strict Mode: OFF
`"strict": false`, `"noUnusedLocals": false`, `"noUnusedParameters": false`. Many `any` types in the codebase, especially in IPC handler return types. The codebase is TypeScript-syntax but not TypeScript-strict.

### 15.11 Video Window Service (Unused)
`VideoWindowService` and its IPC handlers are implemented but currently unused. Reserved for future feature where mpv video would be embedded in the Electron window via `--window-id` instead of standalone mpv window.

---

## 16. API Reference — AllDebrid v4/v4.1

### Base URL
`https://api.alldebrid.com`

### Authentication
Bearer token in `Authorization` header: `Authorization: Bearer ${apiKey}`

Common parameter for all endpoints: `agent=nyaa-viewer`

### Endpoints Used

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| GET | `/v4/user` | Verify API key | `apikey=${key}&agent=nyaa-viewer` |
| POST | `/v4/magnet/upload` | Upload magnet link | `magnets[]=${uri}&agent=nyaa-viewer` |
| POST | `/v4.1/magnet/status` | Check torrent status | `id=${id}&agent=nyaa-viewer` |
| POST | `/v4/magnet/files` | Get torrent files | `id[]=${id}&agent=nyaa-viewer` |
| POST | `/v4/link/unlock` | Get streaming URL | `link=${link}&agent=nyaa-viewer` |

### Status Codes (magnet/status)
| Code | Meaning |
|------|---------|
| 0 | Unknown |
| 1 | Downloading |
| 2 | Downloaded |
| 3 | Error |
| 4 | **Ready** — files available for streaming |
| 5 | Uploading |
| 6 | Archived |

---

## 17. API Reference — nyaa.si RSS

### Search
`GET https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}`

### Trending
`GET https://nyaa.si/?page=rss`

### Response Format (XML)
```xml
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
  <channel>
    <title>Nyaa.si Torrents</title>
    <item>
      <title>...</title>
      <link>https://nyaa.si/view/...</link>
      <guid isPermaLink="true">https://nyaa.si/view/...</guid>
      <pubDate>...</pubDate>
      <size>...</size>
      <description>...</description>
      <nyaa:submitter>...</nyaa:submitter>
      <nyaa:category>...</nyaa:category>
      <nyaa:size>...</nyaa:size>
      <nyaa:seeders>42</nyaa:seeders>
      <nyaa:leechers>5</nyaa:leechers>
      <nyaa:downloads>123</nyaa:downloads>
      <nyaa:infoHash>abc123...</nyaa:infoHash>
    </item>
  </channel>
</rss>
```

---

## 18. Platform-Specific Behavior

### Windows
- Installer: NSIS (not one-click, per-machine, custom install dir)
- Binary: `mpv.exe`
- Icon: `assets/icon.ico`
- Download source: `https://mpv.srsfckn.biz/mpv-latest-x86_64.7z`

### macOS
- Installer: DMG + zip
- Binary: `mpv` (from laborator.stolendata.net)
- Icon: `assets/icon.icns`
- Category: `public.app-category.entertainment`

### Linux
- Installer: AppImage
- Binary: `mediainfo` (system package manager)
- Category: `Utility`
- Users must install mpv and mediainfo via package manager

---

## 19. Debugging & Troubleshooting

### Debug File
All AllDebrid API responses are dumped to `/tmp/nyaa-debug.json`. Read via:
- IPC: `get-debug-file()` (from renderer)
- Manual: `cat /tmp/nyaa-debug.json`

### Debug Mode
PlayerPage has a debug mode (`showDebug` state + `debugContent` state) that reads the debug file and displays it when errors occur.

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "No video files found" | Torrent has no .mkv/.mp4/.webm files | Check torrent contents on nyaa.si |
| "Failed to start playback" | mpv not installed or not found | Run `npm run download-binaries` or install mpv system-wide |
| "AllDebrid not configured" | No API key in settings | Go to Settings page and enter API key |
| "Download timed out after 10 minutes" | AllDebrid couldn't download torrent | Check torrent health on nyaa.si, try a different torrent |
| "No subtitle tracks" | File has no embedded subtitles or mediainfo not installed | Install mediainfo, check file with `mediainfo <file>` |

---

## 20. Known Limitations & TODOs

### Current Limitations
1. **No local torrent downloading** — Requires AllDebrid account (no direct peer-to-peer)
2. **Single mpv instance** — Only one torrent can be streamed at a time
3. **Unix socket only** — mpv IPC uses Unix sockets, no JSON-RPCC or named pipe support
4. **Video window unused** — BrowserView overlay implemented but not used
5. **No subtitle download** — Subtitle extraction from remote URLs not implemented
6. **No user authentication** — No login system, all state is local

### TypeScript
- `strict: false` — no strict null checks, no implicit any
- Many `any` types in IPC handler return types
- `unknown` types used in preload.ts interface definitions

### Future Considerations
- Subtitle embedding in video window
- Multiple concurrent streams
- Direct P2P support (libtorrent or WebTorrent)
- Remote URL subtitle extraction
- Type safety improvements (strict mode migration)
- Unit/integration test coverage
