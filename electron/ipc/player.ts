import { ipcMain } from 'electron';
import { getMainWindow } from '../main';

export function registerPlayerHandlers(): void {
  ipcMain.handle('start-playback', async (_event, url: string) => {
    return { success: true };
  });

  ipcMain.handle('pause-playback', async () => {});

  ipcMain.handle('seek-playback', async (_event, _position: number) => {});

  ipcMain.handle('stop-playback', async () => {});

  ipcMain.handle('setup-video-window', async () => {
    return { success: true };
  });

  ipcMain.handle('show-video-window', async (_event, _bounds: { x: number; y: number; width: number; height: number }) => {
    return null;
  });

  ipcMain.handle('hide-video-window', async () => {});

  ipcMain.handle('get-player-position', async () => {
    return { position: 0, duration: 0 };
  });

  ipcMain.handle('set-subtitle-track', async (_event, _trackId: string | number) => {});

  ipcMain.handle('get-subtitle-tracks', async (_event, _filePath: string) => {
    return [];
  });
}
