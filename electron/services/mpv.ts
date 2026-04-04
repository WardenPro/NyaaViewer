import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getMpvPath } from '../utils/binaries';

export class MpvService {
  private mpvProcess: ChildProcess | null = null;
  private ipcSocket: net.Socket | null = null;
  private ipcPath: string = '';
  private isPlaying = false;
  private mpvExitError: string | null = null;
  private onPositionUpdate: ((data: { position: number; duration: number }) => void) | null = null;
  private positionInterval: NodeJS.Timeout | null = null;
  private windowsPipeName: string = '';

  /**
   * Set up a callback for position updates
   */
  setPositionCallback(callback: (data: { position: number; duration: number }) => void): void {
    this.onPositionUpdate = callback;
  }

  /**
   * Start playback of a URL via mpv, optionally embedded in a given window.
   * @param url The stream URL to play
   * @param wid Window ID: number for Windows handle, hex string (e.g., "0x12345678") for Linux X11
   */
  async startPlayback(url: string, wid?: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      // Stop any existing instance
      await this.stop();

      // Set up IPC: use named pipes on Windows, Unix sockets elsewhere
      this.windowsPipeName = '';
      if (process.platform === 'win32') {
        this.windowsPipeName = `\\\\.\\pipe\\mpv-ipc-${Date.now()}`;
        this.ipcPath = this.windowsPipeName;
        console.log(`[mpv] Using Windows named pipe: ${this.ipcPath}`);
      } else {
        const tmpDir = path.join(os.tmpdir(), 'nyaa-viewer');
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        this.ipcPath = path.join(tmpDir, `mpv-ipc-${Date.now()}.sock`);
        console.log(`[mpv] Using Unix socket: ${this.ipcPath}`);
      }

      // Build mpv arguments
      const args = [
        url,
        '--no-terminal',
        '--really-quiet',
        `--input-ipc-server=${this.ipcPath}`,
        '--keep-open=yes',
        '--subs-with-matching-audio=yes',
        '--slang=eng,en,fra,fr,und,jpn',
        '--sub-auto=fuzzy',
        '--ytdl=no',
      ];

      // Embed in the given window (HWND) on Windows
      if (wid) {
        args.push(`--wid=${wid}`);
        args.push('--no-border');
        args.push('--no-keepaspect');
        args.push('--vo=gpu');
        args.push('--force-window=immediate');
        if (process.platform === 'win32') {
          args.push('--gpu-context=d3d11');
          args.push('--gpu-api=d3d11');
        } else {
          args.push('--gpu-context=x11');
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        args.push('--hwdec=auto');
      }

      const mpvPath = getMpvPath();
      console.log(`[mpv] Spawning: ${mpvPath}`);
      console.log(`[mpv] Args: ${args.join(' ')}`);
      console.log(`[mpv] WID: ${wid || 'none (window mode)'}`);

      this.mpvProcess = spawn(mpvPath, args, {
        env: {
          ...process.env,
          MPV_HOME: process.platform === 'win32'
            ? process.env.TEMP || process.env.USERPROFILE || os.tmpdir()
            : path.join(os.tmpdir(), 'nyaa-viewer'),
        },
      });

      const stderrChunks: string[] = [];
      this.mpvProcess.stderr?.on('data', (chunk) => {
        const msg = chunk.toString();
        stderrChunks.push(msg);
        console.error('[mpv stderr]:', msg.trim());
      });

      this.mpvProcess.on('error', (err) => {
        console.error('mpv process error:', err);
        this.isPlaying = false;
      });

      this.mpvProcess.on('exit', (code, signal) => {
        const stderr = stderrChunks.join('').trim();
        console.error(`[mpv] exited with code ${code}, signal ${signal}. stderr: ${stderr}`);
        if (code !== 0 && code !== null) {
          this.mpvExitError = stderr || `mpv exited with code ${code} (no display available or invalid arguments)`;
        }
        this.isPlaying = false;
        this.cleanupPositionInterval();
      });

      // Wait for socket to be available
      await this.waitForSocket(10000);

      // Connect to the IPC socket
      await this.connectIpc();

      // Check if mpv already exited (e.g., no display)
      if (!this.isPlaying && this.mpvExitError) {
        await this.cleanup();
        return { success: false, error: this.mpvExitError };
      }

      this.isPlaying = true;
      this.startPositionPolling();

      return { success: true };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to start mpv: ${e.message}. Make sure mpv is installed.`,
      };
    }
  }

  async pause(): Promise<void> {
    if (!this.ipcSocket) return;

    try {
      await this.sendMpvCommand({
        command: ['cycle', 'pause'],
      });

      // Toggle internal state
      const status = await this.getProperty('pause');
      this.isPlaying = !status;
    } catch (e) {
      console.error('Failed to pause mpv:', e);
    }
  }

  async seek(position: number): Promise<void> {
    if (!this.ipcSocket) return;

    try {
      await this.sendMpvCommand({
        command: ['seek', String(position), 'absolute'],
      });
    } catch (e) {
      console.error('Failed to seek mpv:', e);
    }
  }

  private async cleanup(): Promise<void> {
    await this.stop();
  }

  async stop(): Promise<void> {
    this.cleanupPositionInterval();

    if (this.mpvProcess) {
      this.mpvProcess.kill('SIGTERM');
      this.mpvProcess = null;
    }

    if (this.ipcSocket) {
      this.ipcSocket.destroy();
      this.ipcSocket = null;
    }

    // Clean up socket file (not needed for Windows named pipes)
    if (process.platform !== 'win32' && this.ipcPath && fs.existsSync(this.ipcPath)) {
      try {
        fs.unlinkSync(this.ipcPath);
      } catch (_) {}
    }

    this.isPlaying = false;
  }

  async getPosition(): Promise<{ position: number; duration: number }> {
    if (!this.ipcSocket) {
      return { position: 0, duration: 0 };
    }

    try {
      const position = await this.getProperty('time-pos') as number;
      const duration = await this.getProperty('duration') as number;
      return {
        position: position || 0,
        duration: duration || 0,
      };
    } catch (e) {
      console.error('Failed to get mpv position:', e);
      return { position: 0, duration: 0 };
    }
  }

  async setSubtitleTrack(trackId: string | number): Promise<void> {
    if (!this.ipcSocket) return;

    try {
      if (trackId === '' || trackId === -1 || trackId === 'no') {
        await this.sendMpvCommand({ command: ['set', 'sid', 'no'] });
      } else {
        await this.sendMpvCommand({ command: ['set', 'sid', String(trackId)] });
      }
    } catch (e) {
      console.error('Failed to set subtitle track:', e);
    }
  }

  async setSubtitleLanguage(lang: string): Promise<void> {
    if (!this.ipcSocket) return;

    try {
      await this.sendMpvCommand({ command: ['set', 'slang', lang] });
    } catch (e) {
      console.error('Failed to set subtitle language:', e);
    }
  }

  /**
   * Cycle through subtitle tracks
   */
  async cycleSubtitles(direction: 'up' | 'down' = 'up'): Promise<void> {
    if (!this.ipcSocket) return;

    try {
      await this.sendMpvCommand({
        command: ['cycle-values', 'sid', 'auto', 'no'],
      });
    } catch (e) {
      console.error('Failed to cycle subtitles:', e);
    }
  }

  /**
   * Get the current mpv process status
   */
  isActive(): boolean {
    return this.isPlaying;
  }

  // Private helpers

  private waitForSocket(timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (process.platform === 'win32') {
        // Windows named pipes don't create a filesystem entry.
        // We poll the pipe for a brief moment to see if it's available.
        const startTime = Date.now();
        const check = () => {
          const sock = net.createConnection(this.ipcPath);
          sock.on('connect', () => { sock.destroy(); resolve(); });
          sock.on('error', () => {
            if (Date.now() - startTime > timeout) {
              reject(new Error('IPC named pipe not available within timeout'));
            } else {
              setTimeout(check, 100);
            }
          });
          sock.setTimeout(500);
        };
        check();
      } else {
        const startTime = Date.now();
        const check = () => {
          if (fs.existsSync(this.ipcPath)) {
            resolve();
          } else if (Date.now() - startTime > timeout) {
            reject(new Error('IPC socket timeout'));
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      }
    });
  }

  private connectIpc(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.ipcPath);

      socket.on('connect', () => {
        this.ipcSocket = socket;
        resolve();
      });

      socket.on('error', (err) => {
        console.error('IPC socket error:', err);
        reject(err);
      });

      socket.on('timeout', () => {
        reject(new Error('IPC socket timeout'));
      });

      socket.setTimeout(5000);
    });
  }

  private sendMpvCommand(cmd: { command: string[]; id?: number }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ipcSocket) {
        reject(new Error('IPC socket not connected'));
        return;
      }

      const data = JSON.stringify({ ...cmd, id: cmd.id || Date.now() }) + '\n';

      this.ipcSocket.write(data, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private getProperty(name: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ipcSocket) {
        reject(new Error('IPC socket not connected'));
        return;
      }

      const cmd = {
        command: ['get_property', name],
        id: Date.now(),
      };

      // Set up a one-time listener for the response
      const handler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString().trim());
          if (response.id === cmd.id) {
            this.ipcSocket!.removeListener('data', handler);
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.data);
            }
          }
        } catch (_) {}
      };

      this.ipcSocket!.on('data', handler);
      this.ipcSocket!.write(JSON.stringify(cmd) + '\n', (err) => {
        if (err) {
          this.ipcSocket!.removeListener('data', handler);
          reject(err);
        }
      });
    });
  }

  private startPositionPolling(): void {
    this.cleanupPositionInterval();

    this.positionInterval = setInterval(async () => {
      if (!this.isPlaying || !this.ipcSocket) return;

      try {
        const position = await this.getProperty('time-pos') as number;
        const duration = await this.getProperty('duration') as number;

        if (this.onPositionUpdate && typeof position === 'number') {
          this.onPositionUpdate({
            position: position || 0,
            duration: duration || 0,
          });
        }
      } catch (_) {}
    }, 10000); // Every 10 seconds
  }

  private cleanupPositionInterval(): void {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }
}

// Singleton
export const mpvService = new MpvService();
