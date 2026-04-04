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
    this.ensureKey();

    try {
      const params = new URLSearchParams();
      params.append('magnets[]', magnetUri);
      params.append('agent', AGENT);

      const response = await this.client.post('/v4/magnet/upload', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data;
      this.writeDebug({ uploadResponse: data });

      if (data?.status === 'success' && data?.data?.magnets?.length > 0) {
        const magnet = data.data.magnets[0];
        if (magnet.error) {
          return { error: magnet.error.message || 'Magnet upload failed' };
        }
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
      return { ready: false, error: e.response?.data?.error?.message || e.message };
    }
  }

  async getTorrentFiles(id: number): Promise<ADFile[]> {
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

      if (data?.status === 'success' && data?.data?.magnets) {
        const magnetEntry = data.data.magnets.find((m: any) => String(m.id) === String(id));
        if (magnetEntry?.files) {
          return this.flattenFiles(magnetEntry.files);
        }
      }

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
    this.ensureKey();

    try {
      const params = new URLSearchParams();
      params.append('link', fileLink);
      params.append('agent', AGENT);

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

      if (data?.data?.delayed) {
        return { success: false, error: 'File is being downloaded by AllDebrid, please wait.' };
      }

      return { success: false, error: data?.error?.message || 'Unlock failed' };
    } catch (e: any) {
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
