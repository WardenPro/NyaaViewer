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
  private messageBuffer = '';
  private pendingRequests = new Map<number, (data: any) => void>();
  private requestId = 1;

  async startPlayback(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.stop();

      const mpvPath = getMpvPath();
      console.log('[mpv] Starting:', mpvPath);

      // Verify binary exists if it's an absolute path
      if (path.isAbsolute(mpvPath) && !fs.existsSync(mpvPath)) {
        return { success: false, error: `mpv binary not found at ${mpvPath}` };
      }

      const tmpDir = path.join(os.tmpdir(), 'nyaa-viewer');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      // Use a more unique socket path to avoid collisions
      this.ipcPath = path.join(tmpDir, `mpv-ipc-${Date.now()}-${Math.floor(Math.random() * 1000)}.sock`);

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

      // Handle stdout/stderr to prevent buffer issues
      this.mpvProcess.stdout?.on('data', (data) => {
        // Just drain stdout
      });

      this.mpvProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log('[mpv stderr]', msg);
      });

      // Wait for socket to be ready with retries
      await this.connectToIpc(30000);

      this.isPlaying = true;
      this.events.onReady?.();

      // Setup process monitoring
      this.mpvProcess.on('exit', (code) => {
        console.log('[mpv] exited with code:', code);
        this.cleanup();
        this.events.onEnded?.();
      });

      this.mpvProcess.on('error', (err) => {
        console.error('[mpv] process error:', err);
        this.events.onError?.(err.message);
      });

      return { success: true };
    } catch (e: any) {
      console.error('[mpv] Start failed:', e);
      this.cleanup();
      return { success: false, error: e.message };
    }
  }

  private async connectToIpc(timeoutMs: number): Promise<void> {
    const start = Date.now();
    let attempt = 1;

    return new Promise((resolve, reject) => {
      const tryConnect = () => {
        if (Date.now() - start > timeoutMs) {
          return reject(new Error('IPC timeout: mpv failed to create socket in time'));
        }

        // Check if process is still alive
        if (this.mpvProcess?.exitCode !== null && this.mpvProcess?.exitCode !== undefined) {
          return reject(new Error(`mpv exited prematurely with code ${this.mpvProcess.exitCode}`));
        }

        const socket = net.createConnection(this.ipcPath);

        socket.on('connect', () => {
          console.log('[mpv] Connected to IPC socket after', attempt, 'attempts');
          this.ipcSocket = socket;
          this.setupSocketHandlers();
          resolve();
        });

        socket.on('error', () => {
          socket.destroy();
          attempt++;
          setTimeout(tryConnect, 200); // Retry every 200ms
        });
      };

      tryConnect();
    });
  }

  private setupSocketHandlers(): void {
    if (!this.ipcSocket) return;

    this.ipcSocket.on('data', (data) => {
      this.messageBuffer += data.toString();
      const lines = this.messageBuffer.split('\n');
      this.messageBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this.handleIpcMessage(msg);
        } catch (e) {
          console.error('[mpv] Error parsing IPC message:', e, 'Line:', line);
        }
      }
    });

    this.ipcSocket.on('close', () => {
      console.log('[mpv] IPC socket closed');
      this.cleanup();
    });

    // Start periodic status updates
    this.startStatusPolling();
  }

  private handleIpcMessage(msg: any): void {
    if (msg.event) {
      this.handleEvent(msg);
    } else if (msg.request_id !== undefined) {
      const resolve = this.pendingRequests.get(msg.request_id);
      if (resolve) {
        this.pendingRequests.delete(msg.request_id);
        resolve(msg);
      }
    }
  }

  private handleEvent(msg: any): void {
    switch (msg.event) {
      case 'end-file':
        this.isPlaying = false;
        this.events.onEnded?.();
        break;
      // Add more event handlers as needed
    }
  }

  private startStatusPolling(): void {
    const poll = async () => {
      if (!this.isPlaying || !this.ipcSocket) return;

      try {
        const [pos, dur, tracks] = await Promise.all([
          this.getProperty('time-pos'),
          this.getProperty('duration'),
          this.getProperty('track-list')
        ]);

        this.events.onPositionUpdate?.({
          position: pos || 0,
          duration: dur || 0
        });

        if (tracks && Array.isArray(tracks)) {
          const subs = tracks.filter((t: any) => t.type === 'sub');
          this.events.onTracks?.(subs);
        }
      } catch (_) {}

      if (this.isPlaying) {
        setTimeout(poll, 1000);
      }
    };
    poll();
  }

  async pause(): Promise<void> {
    await this.sendCommand(['cycle', 'pause']);
  }

  async seek(position: number): Promise<void> {
    await this.sendCommand(['seek', String(position), 'absolute']);
  }

  async stop(): Promise<void> {
    if (this.ipcSocket) {
      try { await this.sendCommand(['quit']); } catch (_) {}
    }
    this.cleanup();
  }

  async setSubtitleTrack(trackId: string | number): Promise<void> {
    const sid = (trackId === 'no' || trackId === -1 || trackId === '') ? 'no' : String(trackId);
    await this.sendCommand(['set', 'sid', sid]);
  }

  async getTracks(): Promise<any[]> {
    const tracks = await this.getProperty('track-list');
    return Array.isArray(tracks) ? tracks : [];
  }

  async getPosition(): Promise<{ position: number; duration: number }> {
    const [pos, dur] = await Promise.all([
      this.getProperty('time-pos'),
      this.getProperty('duration')
    ]);
    return { position: pos || 0, duration: dur || 0 };
  }

  private async sendCommand(cmd: string[]): Promise<any> {
    if (!this.ipcSocket) throw new Error('Not connected to mpv IPC');

    const requestId = this.requestId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Command timeout: ${cmd.join(' ')}`));
      }, 5000);

      this.pendingRequests.set(requestId, (data) => {
        clearTimeout(timeout);
        if (data.error && data.error !== 'success') {
          reject(new Error(`mpv error: ${data.error}`));
        } else {
          resolve(data.data);
        }
      });

      const msg = JSON.stringify({ command: cmd, request_id: requestId }) + '\n';
      this.ipcSocket!.write(msg);
    });
  }

  private async getProperty(name: string): Promise<any> {
    return this.sendCommand(['get_property', name]);
  }

  private cleanup(): void {
    this.isPlaying = false;
    this.pendingRequests.clear();
    
    if (this.ipcSocket) {
      this.ipcSocket.destroy();
      this.ipcSocket = null;
    }

    if (this.mpvProcess) {
      this.mpvProcess.kill('SIGKILL');
      this.mpvProcess = null;
    }

    if (this.ipcPath && fs.existsSync(this.ipcPath)) {
      try { fs.unlinkSync(this.ipcPath); } catch (_) {}
    }
  }

  setEvents(events: MpvEvents): void {
    this.events = events;
  }
}

export const mpvService = new MpvService();
