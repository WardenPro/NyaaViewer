import axios, { AxiosInstance } from 'axios';

const AD_BASE = 'https://api.alldebrid.com';

export class AllDebridService {
  private client: AxiosInstance;
  private apikey: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: AD_BASE,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  setApiKey(key: string): void {
    this.apikey = key;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${key}`;
  }

  getApiKey(): string | null {
    return this.apikey;
  }

  async verifyKey(key: string): Promise<{ success: boolean; error?: string; username?: string }> {
    try {
      const response = await this.client.get('/v4/user', {
        headers: { Authorization: `Bearer ${key}` },
      });

      if (response.data?.status === 'success' && response.data?.data?.user) {
        const user = response.data.data.user;
        return {
          success: true,
          username: user.username || 'Unknown',
        };
      }

      return {
        success: false,
        error: response.data?.error?.message || 'Invalid response',
      };
    } catch (e: any) {
      const status = e.response?.status;
      const message = e.response?.data?.error?.message || e.message;
      return {
        success: false,
        error: status === 401 ? 'Invalid API key' : `Connection failed: ${message}`,
      };
    }
  }

  async uploadMagnet(magnetUri: string): Promise<{ id?: number; ready?: boolean; error?: string }> {
    this.ensureKey();

    try {
      const params = new URLSearchParams();
      params.append('magnets', magnetUri);

      const response = await this.client.post('/v4/magnet/upload', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;

      // Write debug file
      const debugPath = require('path').join(require('os').tmpdir(), 'nyaa-debug.json');
      require('fs').writeFileSync(debugPath, JSON.stringify({ uploadResponse: data, rawData: JSON.stringify(data, null, 2) }, null, 2));

      if (data?.status === 'success' && data?.data?.magnets?.length > 0) {
        const magnet = data.data.magnets[0];
        console.log('[AllDebrid upload]', JSON.stringify({
          id: magnet.id,
          ready: magnet.ready,
          hash: magnet.hash,
          keys: Object.keys(magnet),
        }, null, 2));
        return {
          id: magnet.id,
          ready: magnet.ready === true,
        };
      }

      return { error: data?.error?.message || 'Failed to upload magnet' };
    } catch (e: any) {
      return { error: e.response?.data?.error?.message || e.message };
    }
  }

  async getTorrentStatus(id: number): Promise<{
    ready: boolean;
    status?: string;
    fileName?: string;
    fileSize?: number;
    error?: string;
  }> {
    this.ensureKey();

    try {
      const params = new URLSearchParams();
      params.append('id', String(id));

      const response = await this.client.post('/v4.1/magnet/status', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      if (data?.status === 'success') {
        const magnet = data.data?.magnet;
        if (magnet) {
          const statusCode = magnet.statusCode;
          const ready = statusCode === 4;
          return {
            ready,
            status: magnet.status,
            fileName: magnet.filename,
            fileSize: magnet.size,
          };
        }
        if (data.data?.magnets?.length > 0) {
          const magnet = data.data.magnets[0];
          const statusCode = magnet.statusCode;
          const ready = statusCode === 4;
          return {
            ready,
            status: magnet.status,
            fileName: magnet.filename,
            fileSize: magnet.size,
          };
        }
      }

      return { ready: false, error: data?.error?.message };
    } catch (e: any) {
      return { ready: false, error: e.response?.data?.error?.message || e.message };
    }
  }

  async getTorrentFiles(id: number): Promise<Array<{ path: string; size: number; id: number }>> {
    this.ensureKey();

    try {
      const params = new URLSearchParams();
      params.append('id', String(id));

      const response = await this.client.post('/v4/magnet/files', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      const debugPath = require('path').join(require('os').tmpdir(), 'nyaa-debug.json');
      require('fs').writeFileSync(debugPath, JSON.stringify(data, null, 2));
      console.log('[AllDebrid] files debug written to:', debugPath);

      if (data?.status === 'success' && data?.data?.magnets) {
        const magnetEntry = data.data.magnets.find((m: any) => m.id === id);
        if (magnetEntry?.files) {
          const files: Array<{ path: string; size: number; id: number }> = [];
          const flattenFiles = (nodes: any[], prefix = ''): Array<{ path: string; size: number; id: number }> => {
            return nodes.reduce<Array<{ path: string; size: number; id: number }>>((acc, node, idx) => {
              const name = node.n || '';
              const fullPath = prefix ? `${prefix}/${name}` : name;
              if (node.e && Array.isArray(node.e)) {
                // It's a folder, recurse
                acc.push(...flattenFiles(node.e, fullPath));
              } else if (node.l) {
                // It's a file with a link
                files.push({
                  path: fullPath,
                  size: node.s || 0,
                  id: idx + 1,
                  link: node.l,
                } as any);
              }
              return acc;
            }, []);
          };
          flattenFiles(magnetEntry.files);
          return files;
        }
      }

      return [];
    } catch (e: any) {
      console.error('Get torrent files failed:', e);
      return [];
    }
  }

  async unlockFile(fileLink: string): Promise<{ success: boolean; link?: string; error?: string }> {
    this.ensureKey();

    try {
      const params = new URLSearchParams();
      params.append('link', fileLink);

      const response = await this.client.post('/v4/link/unlock', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      if (data?.status === 'success' && data?.data?.link) {
        return {
          success: true,
          link: data.data.link,
        };
      }

      if (data?.status === 'success' && data?.data?.delayed) {
        return { success: false, error: 'File is still processing, please try again shortly' };
      }

      return { success: false, error: data?.error?.message || 'Unlock failed' };
    } catch (e: any) {
      return { success: false, error: e.response?.data?.error?.message || e.message };
    }
  }

  async getFilesWithLinks(id: number): Promise<Array<{
    path: string;
    size: number;
    id: number;
    link?: string;
  }>> {
    this.ensureKey();

    try {
      const params = new URLSearchParams();
      params.append('id', String(id));

      const response = await this.client.post('/v4/magnet/files', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      if (data?.status === 'success' && data?.data?.magnets) {
        const magnetEntry = data.data.magnets.find((m: any) => m.id === id);
        if (magnetEntry?.files) {
          const files: Array<{ path: string; size: number; id: number; link?: string }> = [];
          const flattenFiles = (nodes: any[], prefix = '') => {
            nodes.forEach((node, idx) => {
              const name = node.n || '';
              const fullPath = prefix ? `${prefix}/${name}` : name;
              if (node.e && Array.isArray(node.e)) {
                flattenFiles(node.e, fullPath);
              } else if (node.l) {
                files.push({ path: fullPath, size: node.s || 0, id: idx + 1, link: node.l });
              }
            });
          };
          flattenFiles(magnetEntry.files);
          return files;
        }
      }

      return [];
    } catch (e: any) {
      console.error('Get files with links failed:', e);
      return [];
    }
  }

  private ensureKey(): void {
    if (!this.apikey) {
      throw new Error('AllDebrid API key not configured');
    }
  }
}
