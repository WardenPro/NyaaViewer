import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

const AD_BASE = 'https://api.alldebrid.com';
const DEBUG_FILE = path.join(tmpdir(), 'nyaa-debug.json');
const AGENT = 'nyaa-viewer';

export interface ADUser {
  username: string;
  isPremium: boolean;
}

export interface ADMagnet {
  id: number;
  filename: string;
  size: number;
  hash: string;
  status: string;
  statusCode: number;
  ready: boolean;
}

export interface ADFile {
  path: string;
  size: number;
  id: number;
  link?: string;
}

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
      const response = await this.client.get(`/v4/user?agent=${AGENT}&apikey=${key}`);

      if (response.data?.status === 'success' && response.data?.data?.user) {
        const user = response.data.data.user;
        return {
          success: true,
          username: user.username || 'Unknown',
        };
      }

      return {
        success: false,
        error: response.data?.error?.message || 'Invalid response from AllDebrid',
      };
    } catch (e: any) {
      const message = e.response?.data?.error?.message || e.message;
      return {
        success: false,
        error: `Connection failed: ${message}`,
      };
    }
  }

  async uploadMagnet(magnetUri: string): Promise<{ id?: number; ready?: boolean; error?: string }> {
    console.log('[AD] === uploadMagnet called ===');
    this.ensureKey();

    try {
      console.log('[AD] Uploading magnet to', AD_BASE, '/v4/magnet/upload');
      const params = new URLSearchParams();
      params.append('magnets[]', magnetUri);
      params.append('agent', AGENT);

      const response = await this.client.post('/v4/magnet/upload', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      this.writeDebug({ uploadResponse: data });
      console.log('[AD] uploadMagnet response status:', data?.status);

      if (data?.status === 'success' && data?.data?.magnets?.length > 0) {
        const magnet = data.data.magnets[0];
        console.log('[AD] Magnet info: id=', magnet.id, 'ready=', magnet.ready, 'hash=', magnet.hash, 'filename=', magnet.filename);
        if (magnet.error) {
          console.log('[AD] Magnet has error:', magnet.error);
          return { error: magnet.error.message || 'Magnet upload failed' };
        }
        return {
          id: magnet.id,
          ready: magnet.ready === true,
        };
      }

      console.log('[AD] uploadMagnet: no magnets in response');
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
      const body = new URLSearchParams();
      body.append('id', String(id));
      body.append('agent', AGENT);

      const response = await this.client.post('/v4.1/magnet/status', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      this.writeDebug({ statusResponse: data });

      if (data?.status === 'success') {
        const magnet = data.data?.magnet || (data.data?.magnets && data.data.magnets[0]);
        if (magnet) {
          console.log('[AD] torrentStatus: id=', magnet.id, 'statusCode=', magnet.statusCode, 'status=', magnet.status, 'pct=', magnet.downloaded, '/', magnet.size);
          return {
            ready: magnet.statusCode === 4,
            status: magnet.status,
            fileName: magnet.filename,
            fileSize: magnet.size,
          };
        }
      }

      return { ready: false, error: data?.error?.message || 'Status check failed' };
    } catch (e: any) {
      console.log('[AD] getTorrentStatus error:', e.message);
      return { ready: false, error: e.response?.data?.error?.message || e.message };
    }
  }

  async getTorrentFiles(id: number): Promise<ADFile[]> {
    console.log('[AD] === getTorrentFiles called, id=', id, '===');
    this.ensureKey();

    try {
      const body = new URLSearchParams();
      body.append('id[]', String(id));
      body.append('agent', AGENT);

      const response = await this.client.post('/v4/magnet/files', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      this.writeDebug({ filesResponse: data });
      console.log('[AD] getTorrentFiles response status:', data?.status);

      if (data?.status === 'success' && data?.data?.magnets) {
        const magnetEntry = data.data.magnets.find((m: any) => String(m.id) === String(id));
        if (magnetEntry?.files) {
          const files = this.flattenFiles(magnetEntry.files);
          console.log(`[AD] Flattened ${files.length} files, video candidates:`, files.map(f => f.path.split('/').pop() || f.path));
          return files;
        }
      }

      console.log('[AD] No files found for torrent', id);
      return [];
    } catch (e: any) {
      console.error('[AD] Get files failed:', e.message);
      return [];
    }
  }

  private flattenFiles(nodes: any[], prefix = ''): ADFile[] {
    const files: ADFile[] = [];
    
    const recurse = (currentNodes: any[], currentPrefix: string) => {
      for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];
        const name = node.n || '';
        const fullPath = currentPrefix ? `${currentPrefix}/${name}` : name;
        
        if (node.e && Array.isArray(node.e)) {
          // Folder
          recurse(node.e, fullPath);
        } else if (node.l || node.id) {
          // File
          files.push({
            path: fullPath,
            size: node.s || 0,
            id: node.id || i + 1,
            link: node.l,
          });
        }
      }
    };

    recurse(nodes, prefix);
    return files;
  }

  async unlockFile(fileLink: string): Promise<{ success: boolean; link?: string; error?: string }> {
    console.log('[AD] === unlockFile called, link=', fileLink.substring(0, 80), '... ===');
    this.ensureKey();
    const t0 = Date.now();

    try {
      const params = new URLSearchParams();
      params.append('link', fileLink);
      params.append('agent', AGENT);

      console.log('[AD] POST /v4/link/unlock');
      const response = await this.client.post('/v4/link/unlock', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      console.log('[AD] unlockFile response status:', data?.status, 'in', Date.now() - t0, 'ms');
      if (data?.status === 'success' && data?.data?.link) {
        const directLink = data.data.link as string;
        console.log('[AD] Direct link obtained (first 100 chars):', directLink.substring(0, 100));

        // Verify the CDN URL is actually reachable before handing it to the player
        console.log('[AD] Step: verifying CDN link reachability via HEAD...');
        try {
          const head = await this.client.head(directLink, { timeout: 10000, validateStatus: () => true });
          const s = head.status;
          console.log('[AD] CDN HEAD response status:', s);
          if (s >= 500 || s === 403 || s === 404) {
            console.log('[AD] CDN link unavailable:', s);
            return { success: false, error: `AllDebrid CDN link is unavailable (HTTP ${s}). Try again or pick a different file.` };
          }
          console.log('[AD] CDN link verified OK');
        } catch (headErr: any) {
          console.log('[AD] CDN HEAD check failed (non-critical):', headErr.message);
          // Non-critical — let the player try anyway
        }

        return {
          success: true,
          link: directLink,
        };
      }

      if (data?.data?.delayed) {
        console.log('[AD] Link is delayed (downloading)');
        return { success: false, error: 'File is being downloaded by AllDebrid, please wait.' };
      }

      console.log('[AD] Unlock failed:', data?.error?.message);
      return { success: false, error: data?.error?.message || 'Unlock failed' };
    } catch (e: any) {
      console.log('[AD] unlockFile exception:', e.message);
      return { success: false, error: e.response?.data?.error?.message || e.message };
    }
  }

  private ensureKey(): void {
    if (!this.apikey) {
      throw new Error('AllDebrid API key not configured');
    }
  }

  private writeDebug(content: any): void {
    try {
      let existing: any = {};
      if (fs.existsSync(DEBUG_FILE)) {
        try {
          existing = JSON.parse(fs.readFileSync(DEBUG_FILE, 'utf-8'));
        } catch (_) {}
      }
      const updated = { ...existing, ...content, timestamp: new Date().toISOString() };
      fs.writeFileSync(DEBUG_FILE, JSON.stringify(updated, null, 2));
    } catch (_) {}
  }
}
