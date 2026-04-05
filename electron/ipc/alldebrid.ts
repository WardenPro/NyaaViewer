import { ipcMain } from 'electron';
import { allDebridService } from '../services/alldebrid-singleton';
import { setConfig, getConfig } from '../utils/storage';

export function registerAllDebridHandlers(): void {
  // Load saved API key on startup
  const config = getConfig();
  if (config.allDebridApiKey) {
    allDebridService.setApiKey(config.allDebridApiKey);
    console.log('[AD] Loaded API key from config on startup');
  }

  ipcMain.handle('verify-alldebrid-key', async (_event, apiKey: string) => {
    console.log('[AD/IPC] verify-alldebrid-key');
    return allDebridService.verifyKey(apiKey);
  });

  ipcMain.handle('upload-magnet', async (_event, magnetUri: string) => {
    console.log('[AD/IPC] upload-magnet: magnetUri length', magnetUri.length);
    const result = await allDebridService.uploadMagnet(magnetUri);
    console.log('[AD/IPC] upload-magnet result:', JSON.stringify(result));
    return result;
  });

  ipcMain.handle('get-torrent-status', async (_event, torrentId: number) => {
    const result = await allDebridService.getTorrentStatus(torrentId);
    if (result.ready) {
      console.log('[AD/IPC] get-torrent-status:', torrentId, 'READY');
    }
    return result;
  });

  ipcMain.handle('get-torrent-files', async (_event, torrentId: number) => {
    console.log('[AD/IPC] get-torrent-files:', torrentId);
    const result = await allDebridService.getTorrentFiles(torrentId);
    console.log('[AD/IPC] get-torrent-files result count:', result.length);
    return result;
  });

  ipcMain.handle('unlock-link', async (_event, fileLink: string) => {
    console.log('[AD/IPC] unlock-link:', fileLink.substring(0, 80), '...');
    const result = await allDebridService.unlockFile(fileLink);
    console.log('[AD/IPC] unlock-link result:', JSON.stringify(result));
    return result;
  });

  ipcMain.handle('set-alldebrid-key', async (_event, apiKey: string) => {
    allDebridService.setApiKey(apiKey);
    setConfig({ allDebridApiKey: apiKey });
  });

  ipcMain.handle('get-alldebrid-key', async (): Promise<string | null> => {
    return allDebridService.getApiKey();
  });

  ipcMain.handle('get-debug-file', async (): Promise<string | null> => {
    try {
      return require('fs').readFileSync(require('path').join(require('os').tmpdir(), 'nyaa-debug.json'), 'utf-8');
    } catch {
      return null;
    }
  });
}
