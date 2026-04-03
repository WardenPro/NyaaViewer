import { ipcMain } from 'electron';
import { searchNyaa, getTrending } from '../services/nyaa';

export function registerSearchHandlers(): void {
  ipcMain.handle('search-nyaa', async (_event, query: string, filter?: string) => {
    return searchNyaa(query, filter);
  });

  ipcMain.handle('get-trending', async () => {
    return getTrending();
  });
}
