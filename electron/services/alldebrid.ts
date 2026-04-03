import axios, { AxiosInstance } from 'axios';

const AD_BASE = 'https://api.alldebrid.com';

export class AllDebridService {
  private client: AxiosInstance;
  private apikey: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: AD_BASE,
      timeout: 30000,
    });
  }

  setApiKey(key: string): void {
    this.apikey = key;
  }

  getApiKey(): string | null {
    return this.apikey;
  }

  async verifyKey(key: string): Promise<{ success: boolean; error?: string; username?: string }> {
    try {
      const response = await this.client.get('/v4/user', {
        params: { apikey: key },
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

  async uploadMagnet(magnetUri: string): Promise<{ id?: number; ready?: boolean; statusCode?: number; status?: string; error?: string }> {
    this.ensureKey();

    try {
      const response = await this.client.post('/v4/magnet/upload', null, {
        params: {
          apikey: this.apikey,
          magnets: magnetUri,
        },
      });

      const data = response.data;
      if (data?.status === 'success' && data?.data?.magnets?.length > 0) {
        const magnet = data.data.magnets[0];
        console.log('[AllDebrid upload response]', JSON.stringify({
          id: magnet.id,
          ready: magnet.ready,
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
      const response = await this.client.get('/v4/magnet/status', {
        params: {
          apikey: this.apikey,
          id,
        },
      });

      const data = response.data;
      if (data?.status === 'success') {
        const magnet = data.data?.magnets || data.data?.magnet;
        const magnetData = Array.isArray(magnet) ? magnet[0] : magnet;
        const statusCode = magnetData?.statusCode;

        // status codes: 0=queued, 1=downloading, 2=compressing, 3=uploading, 4=ready, 5+=error
        const ready = statusCode === 4;

        return {
          ready,
          status: magnetData?.status,
          fileName: magnetData?.filename,
          fileSize: magnetData?.size,
        };
      }

      return { ready: false, error: data?.error?.message };
    } catch (e: any) {
      return { ready: false, error: e.response?.data?.error?.message || e.message };
    }
  }

  async getTorrentFiles(id: number): Promise<Array<{ path: string; size: number; id: number }>> {
    this.ensureKey();

    try {
      const response = await this.client.get('/v4/magnet/files', {
        params: {
          apikey: this.apikey,
          id,
        },
      });

      const data = response.data;
      const debugPath = require('path').join(require('os').tmpdir(), 'nyaa-debug.json');
      require('fs').writeFileSync(debugPath, JSON.stringify(data, null, 2));
      console.log('[AllDebrid] Debug written to:', debugPath);
      if (data?.status === 'success') {
        const magnetData = data.data?.magnets || data.data?.magnet;
        const magnet = Array.isArray(magnetData) ? magnetData[0] : magnetData;

        // Files could be at:
        // 1. magnet.files[] (flat array in magnet object)
        // 2. magnet.links[].files[]
        // 3. magnet.links[] where each link is a direct file
        const files = magnet?.files || [];
        const links = magnet?.links || [];
        console.log('[AllDebrid] magnet.files:', files.length, 'magnet.links:', links.length);

        let allFiles: Array<{ path: string; size: number; id: number }> = [];

        // Try magnet.files first
        if (files.length > 0) {
          allFiles = files.map((f: any) => ({
            path: f?.n || f?.filename || f?.path || '',
            size: f?.size || 0,
            id: f?.id || 0,
          }));
        }

        // Fallback: extract from links
        if (allFiles.length === 0 && links.length > 0) {
          allFiles = links.map((link: any, idx: number) => ({
            path: link?.filename || `file-${idx + 1}`,
            size: link?.size || 0,
            id: idx + 1,
          }));
        }

        console.log('[AllDebrid total files]', allFiles.length);
        return allFiles;
      }

      return [];
    } catch (e: any) {
      console.error('Get torrent files failed:', e);
      return [];
    }
  }

  async unlockFile(id: number): Promise<{ success: boolean; link?: string; error?: string }> {
    this.ensureKey();

    try {
      const response = await this.client.get('/v4/magnet/files', {
        params: {
          apikey: this.apikey,
          id,
        },
      });

      // The files endpoint returns the download links directly in most cases
      // If not, we use the unlock endpoint
      const data = response.data;
      if (data?.status === 'success') {
        const magnetData = data.data?.magnet || data.data?.magnets;
        if (magnetData?.files) {
          const targetFile = magnetData.files.find(
            (f: any) => f.id === id && (f.link || f.download_link)
          );
          if (targetFile) {
            return {
              success: true,
              link: targetFile.link || targetFile.download_link,
            };
          }
        }
      }

      // Fallback to the generic unlock approach
      // AllDebrid returns files with download links when torrent is ready
      // We need the actual link from the file entry
      return {
        success: false,
        error: 'File link not available. Make sure the torrent is fully ready.',
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.error?.message || e.message,
      };
    }
  }

  /**
   * Unlock a specific file from a ready torrent by file ID
   * Uses the /v4/link/unlock pattern where id references the file within the magnet
   */
  async unlockFileById(linkId: number): Promise<{ success: boolean; link?: string; error?: string }> {
    this.ensureKey();

    try {
      const response = await this.client.get('/v4/link/unlock', {
        params: {
          apikey: this.apikey,
          id: linkId,
          remote: 1, // Get remote URL for streaming
        },
      });

      const data = response.data;
      if (data?.status === 'success' && data?.data?.link) {
        return { success: true, link: data.data.link };
      }

      return { success: false, error: data?.error?.message || 'Unlock failed' };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.error?.message || e.message,
      };
    }
  }

  /**
   * Get files with download links for a ready torrent
   */
  async getFilesWithLinks(id: number): Promise<Array<{
    path: string;
    size: number;
    id: number;
    link?: string;
  }>> {
    this.ensureKey();

    try {
      const response = await this.client.get('/v4/magnet/files', {
        params: {
          apikey: this.apikey,
          id,
        },
      });

      const data = response.data;
      if (data?.status === 'success') {
        const magnetData = data.data?.magnets || data.data?.magnet;
        const magnet = Array.isArray(magnetData) ? magnetData[0] : magnetData;

        if (magnet?.files) {
          return magnet.files.map((f: any) => ({
            path: f.filename || f.path || '',
            size: f.size || 0,
            id: f.id,
            link: f.link || f.download_link,
          }));
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
