import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getMpvPath } from '../utils/binaries';

export interface MpvEvents {
  onPositionUpdate?: (data: { position: number; duration: number }) => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  onReady?: () => void;
  onTracks?: (tracks: any[]) => void;
}

export class MpvService {
  private mpvProcess: ChildProcess | null = null;
  private ipcSocket: net.Socket | null = null;
  private ipcPath: string = '';
  private isPlaying = false;
  private events: MpvEvents = {};

  async startPlayback(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.stop();

      const mpvPath = getMpvPath();
      console.log('[mpv] Starting:', mpvPath);

      const tmpDir = path.join(os.tmpdir(), 'nyaa-viewer');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      this.ipcPath = path.join(tmpDir, 'mpv-ipc-' + Date.now() + '.sock');

      const args: string[] = [
        url,
        '--no-terminal',
        '--input-ipc-server=' + this.ipcPath,
        '--keep-open=yes',
        '--subs-with-matching-audio=yes',
        '--slang=eng,en,fra,fr,und,jpn',
        '--sub-auto=fuzzy',
        '--ytdl=no',
        '--hwdec=auto',
        '--force-window=yes',
      ];

      console.log('[mpv] Args:', args.join(' '));

      this.mpvProcess = spawn(mpvPath, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.mpvProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
          console.log('[mpv stderr]', msg);
        }
      });

      this.mpvProcess.on('error', (err) => {
        console.error('[mpv] error:', err);
        this.events.onError?.(err.message);
      });

      this.mpvProcess.on('exit', (code) => {
        console.log('[mpv] exited:', code);
        this.isPlaying = false;
        if (code !== 0) {
          this.events.onError?.('mpv exited with code ' + code);
        }
        this.events.onEnded?.();
      });

      await this.waitForSocket(30000);
      await this.connectIpc();

      this.isPlaying = true;
      this.events.onReady?.();
      this.startPolling();

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  setEvents(events: MpvEvents): void {
    this.events = events;
  }

  async pause(): Promise<void> {
    await this.sendCommand(['cycle', 'pause']);
  }

  async seek(position: number): Promise<void> {
    await this.sendCommand(['seek', String(position), 'absolute']);
  }

  async stop(): Promise<void> {
    if (this.ipcSocket) {
      try {
        await this.sendCommand(['quit']);
      } catch (_) {}
      this.ipcSocket.destroy();
      this.ipcSocket = null;
    }

    if (this.mpvProcess) {
      this.mpvProcess.kill('SIGTERM');
      this.mpvProcess = null;
    }

    if (this.ipcPath && fs.existsSync(this.ipcPath)) {
      try { fs.unlinkSync(this.ipcPath); } catch (_) {}
    }

    this.isPlaying = false;
  }

  async setSubtitleTrack(trackId: string | number): Promise<void> {
    if (trackId === '' || trackId === -1 || trackId === 'no') {
      await this.sendCommand(['set', 'sid', 'no']);
    } else {
      await this.sendCommand(['set', 'sid', String(trackId)]);
    }
  }

  async getTracks(): Promise<any[]> {
    try {
      const tracks = await this.getProperty('track-list');
      return tracks || [];
    } catch (_) {
      return [];
    }
  }

  async getPosition(): Promise<{ position: number; duration: number }> {
    try {
      const pos = await this.getProperty('time-pos');
      const dur = await this.getProperty('duration');
      return { position: pos || 0, duration: dur || 0 };
    } catch (_) {
      return { position: 0, duration: 0 };
    }
  }

  private async sendCommand(cmd: string[]): Promise<void> {
    if (!this.ipcSocket) return;

    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ command: cmd, id: Date.now() }) + '\n';
      this.ipcSocket!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async getProperty(name: string): Promise<any> {
    if (!this.ipcSocket) return null;

    return new Promise((resolve, reject) => {
      const id = Date.now();
      const handler = (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString().trim());
          if (msg.id === id) {
            this.ipcSocket?.removeListener('data', handler);
            resolve(msg.data);
          }
        } catch (_) {}
      };

      this.ipcSocket?.on('data', handler);
      this.ipcSocket?.write(JSON.stringify({ command: ['get_property', name], id }) + '\n');

      setTimeout(() => {
        this.ipcSocket?.removeListener('data', handler);
        reject(new Error('timeout'));
      }, 5000);
    });
  }

  private waitForSocket(timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (fs.existsSync(this.ipcPath)) resolve();
        else if (Date.now() - start > timeout) reject(new Error('IPC timeout'));
        else setTimeout(check, 100);
      };
      check();
    });
  }

  private async connectIpc(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.ipcPath);
      socket.on('connect', () => {
        this.ipcSocket = socket;
        resolve();
      });
      socket.on('error', reject);
      socket.setTimeout(5000);
    });
  }

  private startPolling(): void {
    const poll = async () => {
      if (!this.isPlaying || !this.ipcSocket) return;

      try {
        const pos = await this.getProperty('time-pos');
        const dur = await this.getProperty('duration');
        const tracks = await this.getProperty('track-list');

        this.events.onPositionUpdate?.({
          position: pos || 0,
          duration: dur || 0
        });

        if (tracks && tracks.length > 0) {
          const subs = tracks.filter((t: any) => t.type === 'sub');
          if (subs.length > 0) {
            this.events.onTracks?.(subs);
          }
        }
      } catch (_) {}

      setTimeout(poll, 1000);
    };
    poll();
  }
}

export const mpvService = new MpvService();
