import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

// Keep a global reference to prevent GC
let mainWindow: BrowserWindow | null = null;

// Import IPC handlers
import { registerSearchHandlers } from './ipc/search';
import { registerAllDebridHandlers } from './ipc/alldebrid';
import { registerPlayerHandlers } from './ipc/player';
import { registerStorageHandlers } from './utils/storage';

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

  // Load the dev server in development, built files in production
  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Register all IPC handlers
  registerSearchHandlers();
  registerAllDebridHandlers();
  registerPlayerHandlers();
  registerStorageHandlers();

  createWindow();

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
