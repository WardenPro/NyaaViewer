import { ipcMain } from 'electron';
import { allDebridService } from '../services/alldebrid-singleton';
import { setConfig, getConfig } from '../utils/storage';

export function registerAllDebridHandlers(): void {
  // Load saved API key on startup
  const config = getConfig();
  if (config.allDebridApiKey) {
    allDebridService.setApiKey(config.allDebridApiKey);
  }

  ipcMain.handle('verify-alldebrid-key', async (_event, apiKey: string) => {
    return allDebridService.verifyKey(apiKey);
  });

  ipcMain.handle('upload-magnet', async (_event, magnetUri: string) => {
    return allDebridService.uploadMagnet(magnetUri);
  });

  ipcMain.handle('get-torrent-status', async (_event, torrentId: number) => {
    return allDebridService.getTorrentStatus(torrentId);
  });

  ipcMain.handle('get-torrent-files', async (_event, torrentId: number) => {
    return allDebridService.getTorrentFiles(torrentId);
  });

  ipcMain.handle('unlock-link', async (_event, fileId: number) => {
    return allDebridService.unlockFileById(fileId);
  });

  ipcMain.handle('set-alldebrid-key', async (_event, apiKey: string) => {
    allDebridService.setApiKey(apiKey);
    setConfig({ allDebridApiKey: apiKey });
  });

  ipcMain.handle('get-alldebrid-key', async (): Promise<string | null> => {
    return allDebridService.getApiKey();
  });
}
