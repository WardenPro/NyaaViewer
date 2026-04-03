import { ipcMain } from 'electron';
import { mpvService } from '../services/mpv';
import { videoWindow } from '../services/video-window';
import { extractSubtitleTracks } from '../services/subtitles';
import { getMainWindow } from '../main';

export function registerPlayerHandlers(): void {
  // Set up position callback to send to renderer
  mpvService.setPositionCallback((data) => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send('player-position-update', data);
    }
  });

  ipcMain.handle('start-playback', async (_event, url: string) => {
    try {
      const hwnd = videoWindow.getHwnd();
      const result = await mpvService.startPlayback(url, hwnd || undefined);
      return result;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pause-playback', async () => {
    await mpvService.pause();
  });

  ipcMain.handle('seek-playback', async (_event, position: number) => {
    await mpvService.seek(position);
  });

  ipcMain.handle('stop-playback', async () => {
    await mpvService.stop();
    videoWindow.hide();
  });

  ipcMain.handle('setup-video-window', async () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      return { success: false, error: 'No main window' };
    }
    if (!videoWindow.exists()) {
      videoWindow.create(win);
    }
    return { success: true };
  });

  ipcMain.handle('show-video-window', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    videoWindow.show(bounds);
    return videoWindow.getHwnd();
  });

  ipcMain.handle('hide-video-window', async () => {
    videoWindow.hide();
  });

  ipcMain.handle('get-player-position', async () => {
    return mpvService.getPosition();
  });

  ipcMain.handle('set-subtitle-track', async (_event, trackId: string | number) => {
    await mpvService.setSubtitleTrack(trackId);
  });

  ipcMain.handle('get-subtitle-tracks', async (_event, filePath: string) => {
    return extractSubtitleTracks(filePath);
  });
}
