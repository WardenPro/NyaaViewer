import { ipcMain } from 'electron';
import { searchNyaa, getTrending, NyaaSearchOptions } from '../services/nyaa';

export function registerSearchHandlers(): void {
  ipcMain.handle('search-nyaa', async (_event, query: string, options?: NyaaSearchOptions) => {
    return searchNyaa(query, options);
  });

  ipcMain.handle('get-trending', async () => {
    return getTrending();
  });
}
