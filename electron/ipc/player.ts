import { ipcMain } from 'electron';
import { mpvService } from '../services/mpv';
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
    const win = getMainWindow();
    return mpvService.startPlayback(url, win);
  });

  ipcMain.handle('pause-playback', async () => {
    await mpvService.pause();
  });

  ipcMain.handle('seek-playback', async (_event, position: number) => {
    await mpvService.seek(position);
  });

  ipcMain.handle('stop-playback', async () => {
    await mpvService.stop();
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
