# NyaaViewer

A desktop Electron application for searching and streaming anime torrents from [nyaa.si](https://nyaa.si), powered by [AllDebrid](https://alldebrid.com) for server-side torrent downloading and [mpv](https://mpv.io/) for playback.

## Features

- **Search** nyaa.si via RSS with resolution filtering (1080p / 720p / 480p)
- **Trending** — browse the top 10 most-seeded torrents on nyaa.si
- **AllDebrid Integration** — upload magnet links, poll for server-side download progress, unlock streaming links
- **mpv Streaming** — hardware-accelerated playback with subtitle track selection
- **Resume Watching** — watch history with progress tracking, pick up where you left off
- **Auto-Updates** — shipped via GitHub Releases with `electron-updater`
- **Cross-Platform** — Windows (NSIS), macOS (DMG + zip), Linux (AppImage)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 33 |
| UI | React 18 + TypeScript |
| Routing | React Router 6 (HashRouter) |
| State | Zustand 5 |
| Styling | TailwindCSS 3.4 (dark theme) |
| Build | Vite 6 + electron-builder 25 |
| HTTP | Axios (AllDebrid API) |
| XML | fast-xml-parser (nyaa RSS) |
| Player | mpv (spawned child process, Unix socket IPC) |
| Subtitles | MediaInfo CLI (MKV track extraction) |
| Updates | electron-updater (GitHub Releases) |

## Quick Start

```bash
# Install dependencies
npm install

# Download platform binaries (mpv, mediainfo)
npm run download-binaries

# Start dev server
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server + Electron |
| `npm run build` | Full production build (all platforms) |
| `npm run build:win` | Windows NSIS installer |
| `npm run build:mac` | macOS DMG + zip |
| `npm run build:linux` | Linux AppImage |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Vite production preview |
| `npm run download-binaries` | Download mpv and mediainfo for the current platform |

## Architecture

```
┌───────────────────────────────────────────────────┐
│               Renderer Process (React)             │
│  Pages: Home / Search / Player / Settings          │
│  Components: Layout, SearchBar, SearchResult, etc. │
│  Zustand Store ──────────────────────────────────┐ │
│                                   contextBridge   │ │
└───────────────────────────────────┼───────────────┘
                                    │ IPC
┌───────────────────────────────────┼───────────────┐
│               Main Process (Electron)              │
│  ┌──────────┐ ┌────────────┐ ┌────────────────┐  │
│  │ search.ts│ │alldebrid.ts│ │ player.ts      │  │
│  │  └─ nyaa │ │  └─ AD API │ │  └─ mpv.ts     │  │
│  │          │ │            │ │                │  │
│  │storage.ts│ │subtitles.ts│ │ video-window.ts│  │
│  │binaries.ts             │ │                │  │
│  └────────────────────────┘ └────────────────┘  │
└──────────────────────────────────────────────────┘
```

## AllDebrid Streaming Flow

1. User clicks "Stream" on a torrent
2. Magnet URI uploaded to AllDebrid (`POST /v4/magnet/upload`)
3. Poll torrent status every 5s until `ready` (`POST /v4.1/magnet/status`)
4. Fetch file list, filter to video files (`POST /v4/magnet/files`)
5. User selects file (or largest is auto-picked)
6. Unlock streaming link (`POST /v4/link/unlock`)
7. Spawn mpv with the streaming URL
8. Poll mpv position via Unix socket IPC every 1s
9. Save watch position to disk every 30s

## Project Structure

```
NyaaViewer/
├── electron/                  # Main process code
│   ├── main.ts                # Entry point, window creation, auto-updater
│   ├── preload.ts             # contextBridge exposing electronAPI
│   ├── ipc/                   # IPC handler registration
│   │   ├── alldebrid.ts       # AllDebrid API IPC handlers
│   │   ├── player.ts          # mpv player IPC handlers
│   │   └── search.ts          # Nyaa search IPC handlers
│   ├── services/              # Business logic
│   │   ├── alldebrid.ts       # AllDebrid API client (axios)
│   │   ├── alldebrid-singleton.ts # Global singleton instance
│   │   ├── mpv.ts             # mpv process manager + socket IPC
│   │   ├── nyaa.ts            # nyaa.si RSS fetch + XML parsing
│   │   ├── subtitles.ts       # Mediainfo-based subtitle extraction
│   │   └── video-window.ts    # BrowserView overlay (unused, reserved)
│   └── utils/                 # Utilities
│       ├── binaries.ts        # Binary path resolution + downloader
│       └── storage.ts         # JSON file persistence (history + config)
├── src/                       # Renderer process (React)
│   ├── main.tsx               # React entry point (HashRouter)
│   ├── App.tsx                # Routes + auto-update banner
│   ├── components/            # Reusable UI components
│   │   ├── Layout.tsx         # Collapsible sidebar navigation
│   │   ├── ResumeWatchSection.tsx # Continue-watching grid
│   │   ├── SearchBar.tsx      # Search input + resolution filter
│   │   ├── SearchResult.tsx   # Torrent result card
│   │   ├── SubtitleSelector.tsx   # Subtitle track picker
│   │   └── TrendingSection.tsx    # Top-10 trending grid
│   ├── pages/                 # Route-level pages
│   │   ├── HomePage.tsx       # Landing page with hero search
│   │   ├── SearchPage.tsx     # Search results with filters
│   │   ├── PlayerPage.tsx     # Full streaming flow + controls
│   │   └── SettingsPage.tsx   # AD key, subtitle prefs, updates
│   ├── store/                 # Global state
│   │   └── appStore.ts        # Zustand store (search, player, settings)
│   └── styles/
│       └── globals.css        # Tailwind + custom dark theme utilities
├── scripts/
│   └── download-binaries.js   # Platform-specific mpv/mediainfo download
├── bin/                       # Bundled binaries (mpv, mediainfo)
├── release/                   # electron-builder output
├── vite.config.ts             # Vite + electron plugin config
├── tsconfig.json              # TypeScript configuration
├── tailwind.config.js         # Dark theme color palette
├── postcss.config.js          # Tailwind + autoprefixer
├── index.html                 # HTML shell with CSP
└── package.json               # Dependencies, scripts, and electron-builder config
```

## Requirements

- **AllDebrid account** with a valid API key (settings page)
- **mpv** — downloaded automatically on build, or install via system package manager (Linux)
- **MediaInfo** — downloaded automatically on build, or install via system package manager (Linux)

## License

MIT
