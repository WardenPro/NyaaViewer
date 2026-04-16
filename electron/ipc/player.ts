import { ipcMain } from 'electron';
import { mpvService } from '../services/mpv';
import { videoWindow } from '../services/video-window';
import { getMainWindow } from '../main';

export function registerPlayerHandlers(): void {
  mpvService.setEvents({
    onPositionUpdate: (data) => {
      const win = getMainWindow();
      if (win) {
        win.webContents.send('player-position-update', data);
      }
    },
    onTracks: (tracks) => {
      const win = getMainWindow();
      if (win) {
        win.webContents.send('player-tracks-update', tracks);
      }
    },
    onEnded: () => {
      console.log('[IPC/player] === onEnded === forwarding to renderer');
      const win = getMainWindow();
      if (win) {
        win.webContents.send('player-ended');
      }
    },
    onError: (error) => {
      console.error('[IPC/player] === onError === forwarding to renderer:', error);
      const win = getMainWindow();
      if (win) {
        win.webContents.send('player-error', error);
      }
    },
  });

  ipcMain.handle('start-playback', async (_event, url: string) => {
    console.log('[IPC/player] === start-playback IPC === URL (first 100):', url.substring(0, 100));
    try {
      const result = await mpvService.startPlayback(url);
      console.log('[IPC/player] start-playback result:', JSON.stringify(result));
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start playback';
      console.error('[IPC/player] start-playback exception:', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('pause-playback', async () => {
    console.log('[IPC/player] pause-playback');
    await mpvService.pause();
  });

  ipcMain.handle('seek-playback', async (_event, position: number) => {
    console.log('[IPC/player] seek-playback:', position);
    await mpvService.seek(position);
  });

  ipcMain.handle('stop-playback', async () => {
    console.log('[IPC/player] stop-playback');
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
    return videoWindow.getWindowId();
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

  ipcMain.handle('get-subtitle-tracks', async () => {
    return await mpvService.getTracks();
  });
}
