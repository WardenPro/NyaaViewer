import { ipcMain } from 'electron';
import { searchNyaa, getTrending, type NyaaSearchOptions } from '../services/nyaa';
import { getWeeklySchedule } from '../services/schedule';

export function registerSearchHandlers(): void {
  ipcMain.handle('search-nyaa', async (_event, query: string, options?: NyaaSearchOptions) => {
    return searchNyaa(query, options);
  });

  ipcMain.handle('get-trending', async () => {
    return getTrending();
  });

  ipcMain.handle('get-weekly-schedule', async () => {
    return getWeeklySchedule();
  });
}
