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

const MAX_STDERR_BYTES = 4096;

export class MpvService {
  private mpvProcess: ChildProcess | null = null;
  private ipcSocket: net.Socket | null = null;
  private ipcPath: string = '';
  private isPlaying = false;
  private events: MpvEvents = {};
  private messageBuffer = '';
  private pendingRequests = new Map<number, (data: any) => void>();
  private requestId = 1;
  private stderrBuffer = '';

  async startPlayback(url: string): Promise<{ success: boolean; error?: string }> {
    console.log('[mpv] === startPlayback called ===');
    console.log('[mpv] URL:', url.substring(0, 120) + '...');
    const t0 = Date.now();
    try {
      console.log('[mpv] Step 1: stopping previous playback...');
      await this.stop();
      console.log('[mpv] Step 2: resolving mpv path...');

      const mpvPath = getMpvPath();
      console.log('[mpv] Resolved mpv path:', mpvPath);

      // Verify binary exists if it's an absolute path
      if (path.isAbsolute(mpvPath) && !fs.existsSync(mpvPath)) {
        console.error('[mpv] Binary not found at:', mpvPath);
        return { success: false, error: `mpv binary not found at ${mpvPath}` };
      }
      if (path.isAbsolute(mpvPath)) {
        console.log('[mpv] Binary exists OK');
      }

      const tmpDir = path.join(os.tmpdir(), 'nyaa-viewer');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      // Use a more unique socket path to avoid collisions
      this.ipcPath = path.join(tmpDir, `mpv-ipc-${Date.now()}-${Math.floor(Math.random() * 1000)}.sock`);
      console.log('[mpv] IPC socket path:', this.ipcPath);

      const args: string[] = [
        url,
        '--no-terminal',
        '--input-ipc-server=' + this.ipcPath,
        '--keep-open=yes',
        '--subs-with-matching-audio=yes',
        '--slang=eng,en,fra,fr,und,jpn',
        '--sub-auto=fuzzy',
        '--ytdl=no',
        '--hwdec=no',
        '--force-window=yes',
      ];

      console.log('[mpv] Full spawn args:', args.join(' '));
      console.log('[mpv] Step 3: spawning child process...');

      try {
        this.mpvProcess = spawn(mpvPath, args, {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        console.log('[mpv] Child process spawned, PID:', this.mpvProcess.pid);

        // Setup process monitoring IMMEDIATELY to catch early errors
        this.mpvProcess.on('exit', (code, signal) => {
          console.log('[mpv] === exit event ===');
          console.log('[mpv] Exit code:', code, 'Signal:', signal);
          console.log('[mpv] Stderr buffer size:', this.stderrBuffer.length, 'bytes');
          this.cleanup();
          if (code !== null && code !== 0) {
            const stderr = this.stderrBuffer.trim();
            const detail = stderr ? `mpv exited with code ${code}\n${stderr}` : `mpv exited with code ${code}`;
            console.error('[mpv] Abnormal exit details:', detail);
            this.events.onError?.(detail);
          } else {
            console.log('[mpv] Normal exit, calling onEnded');
            this.events.onEnded?.();
          }
        });

        this.mpvProcess.on('error', (err) => {
          console.error('[mpv] === error event ===', err);
          this.events.onError?.(err.message);
        });
      } catch (spawnError: any) {
        console.error('[mpv] spawn error:', spawnError);
        return { success: false, error: `Failed to spawn mpv: ${spawnError.message}` };
      }

      // Handle stdout/stderr to prevent buffer issues
      this.mpvProcess.stdout?.on('data', (data) => {
        // Just drain stdout
      });

      this.mpvProcess.stderr?.on('data', (data) => {
        const msg = data.toString();
        // Buffer stderr (capped) so it's available if mpv exits abnormally
        if (this.stderrBuffer.length < MAX_STDERR_BYTES) {
          this.stderrBuffer += msg;
          if (this.stderrBuffer.length > MAX_STDERR_BYTES) {
            this.stderrBuffer = this.stderrBuffer.slice(-MAX_STDERR_BYTES);
          }
        }
        // Log every stderr chunk for debugging
        const lines = msg.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          console.log(`[mpv stderr] ${line}`);
        }
      });

      // Wait for socket to be ready with retries
      console.log('[mpv] Step 4: connecting to IPC socket...');
      await this.connectToIpc(30000);
      console.log('[mpv] IPC socket connected after', Date.now() - t0, 'ms');

      this.isPlaying = true;
      console.log('[mpv] Step 5: marking as playing, emitting onReady');
      this.events.onReady?.();

      const elapsed = Date.now() - t0;
      console.log('[mpv] === startPlayback completed OK in', elapsed, 'ms ===');
      return { success: true };
    } catch (e: any) {
      console.error('[mpv] === startPlayback FAILED in', Date.now() - t0, 'ms ===');
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
        const elapsed = Date.now() - start;
        if (elapsed > timeoutMs) {
          console.error('[mpv] IPC connect timeout after', elapsed, 'ms,', attempt, 'attempts');
          return reject(new Error('IPC timeout: mpv failed to create socket in time'));
        }

        // Check if process is still alive
        if (this.mpvProcess?.exitCode !== null && this.mpvProcess?.exitCode !== undefined) {
          console.error('[mpv] Process already exited (attempt', attempt, ') with code', this.mpvProcess.exitCode);
          return reject(new Error(`mpv exited prematurely with code ${this.mpvProcess.exitCode}`));
        }

        if (attempt <= 3 || attempt % 10 === 0) {
          console.log(`[mpv] IPC connect attempt #${attempt} after ${elapsed}ms`);
        }

        const socket = net.createConnection(this.ipcPath);

        socket.on('connect', () => {
          console.log('[mpv] IPC socket connected after', attempt, 'attempts,', Date.now() - start, 'ms');
          this.ipcSocket = socket;
          this.setupSocketHandlers();
          resolve();
        });

        socket.on('error', (err) => {
          socket.destroy();
          attempt++;
          const retryIn = 200;
          // Log every N attempts
          if (attempt <= 5 || attempt % 25 === 0) {
            console.log(`[mpv] IPC connect failed attempt ${attempt - 1}, retrying in ${retryIn}ms... (${err.message})`);
          }
          setTimeout(tryConnect, retryIn);
        });
      };

      tryConnect();
    });
  }

  private setupSocketHandlers(): void {
    if (!this.ipcSocket) return;

    console.log('[mpv] Setting up socket handlers');
    this.ipcSocket.on('data', (data) => {
      this.messageBuffer += data.toString();
      const lines = this.messageBuffer.split('\n');
      this.messageBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          console.log('[mpv] Received IPC message:', JSON.stringify(msg).substring(0, 300));
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
