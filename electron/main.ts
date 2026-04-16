import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

// Keep a global reference to prevent GC
let mainWindow: BrowserWindow | null = null;

// Import IPC handlers
import { registerSearchHandlers } from './ipc/search';
import { registerAllDebridHandlers } from './ipc/alldebrid';
import { registerPlayerHandlers } from './ipc/player';
import { registerStorageHandlers } from './utils/storage';

// Auto-updater (only available in production builds)
let autoUpdater: import('electron-updater').AppUpdater | null = null;

function setupAutoUpdater() {
  if (app.isPackaged) {
    try {
      const { autoUpdater: updater } = require('electron-updater');
      autoUpdater = updater;
      autoUpdater.logger = console;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowPrerelease = false;

      autoUpdater.on('checking-for-update', () => {
        mainWindow?.webContents.send('auto-update:status', { type: 'checking' });
      });

      autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send('auto-update:status', {
          type: 'available',
          version: info.version,
        });
      });

      autoUpdater.on('update-not-available', () => {
        mainWindow?.webContents.send('auto-update:status', { type: 'not-available' });
      });

      autoUpdater.on('download-progress', (progressObj) => {
        mainWindow?.webContents.send('auto-update:status', {
          type: 'downloading',
          percent: progressObj.percent,
        });
      });

      autoUpdater.on('update-downloaded', () => {
        mainWindow?.webContents.send('auto-update:status', { type: 'downloaded' });
        // Auto-install and restart after short delay
        setTimeout(() => {
          autoUpdater?.quitAndInstall(false, true);
        }, 2000);
      });

      autoUpdater.on('error', (err) => {
        mainWindow?.webContents.send('auto-update:status', {
          type: 'error',
          message: err.message,
        });
      });
    } catch (e) {
      console.warn('electron-updater not available, skipping auto-update setup', e);
    }
  }

  // IPC handler for manual check
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
      return { error: 'Update checks only work in production builds' };
    }
    if (autoUpdater) {
      try {
        await autoUpdater.checkForUpdates();
        return { checking: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start update check';
        return { error: message };
      }
    }
    return { error: 'Auto-updater not initialized' };
  });

  // Expose app version
  ipcMain.handle('get-app-version', () => app.getVersion());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f14',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the dev server in development, built files in production
  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  // Register all IPC handlers
  registerSearchHandlers();
  registerAllDebridHandlers();
  registerPlayerHandlers();
  registerStorageHandlers();
  setupAutoUpdater();

  createWindow();

  // Auto-check for updates on startup (production only)
  if (autoUpdater && app.isPackaged) {
    setTimeout(() => autoUpdater!.checkForUpdates(), 2000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper to get the main window
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
