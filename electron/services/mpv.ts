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
  private onPositionUpdate: ((data: { position: number; duration: number }) => void) | null = null;
  private positionInterval: NodeJS.Timeout | null = null;

  /**
   * Set up a callback for position updates
   */
  setPositionCallback(callback: (data: { position: number; duration: number }) => void): void {
    this.onPositionUpdate = callback;
  }

  /**
   * Start playback of a URL via mpv, optionally embedded in a given window (HWND).
   */
  async startPlayback(url: string, hwnd?: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Stop any existing instance
      await this.stop();

      // Set up IPC socket path for mpv communication
      const tmpDir = process.platform === 'win32'
        ? path.join(process.env.TEMP || process.env.USERPROFILE || os.tmpdir(), 'nyaa-viewer')
        : path.join(os.tmpdir(), 'nyaa-viewer');

      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      this.ipcPath = path.join(tmpDir, `mpv-ipc-${Date.now()}.sock`);

      // Build mpv arguments
      const args = [
        url,
        '--no-terminal',
        '--really-quiet',
        `--input-ipc-server=${this.ipcPath}`,
        '--keep-open=yes',
        '--hwdec=auto',
        '--subs-with-matching-audio=yes',
        '--slang=eng,en,fra,fr,und,jpn',
        '--sub-auto=fuzzy',
        '--ytdl=no',
      ];

      // Embed in the given window (HWND) on Windows
      if (hwnd && hwnd > 0) {
        args.push(`--wid=${hwnd}`);
        args.push('--no-border');
        // Ensure the video content stays within the window
        args.push('--no-keepaspect');
      }

      this.mpvProcess = spawn(getMpvPath(), args, {
        env: {
          ...process.env,
          MPV_HOME: tmpDir,
        },
      });

      this.mpvProcess.on('error', (err) => {
        console.error('mpv process error:', err);
        this.isPlaying = false;
      });

      this.mpvProcess.on('exit', (code, signal) => {
        console.log(`[mpv] exited with code ${code}, signal ${signal}`);
        this.isPlaying = false;
        this.cleanupPositionInterval();
      });

      // Wait for socket to be available
      await this.waitForSocket(5000);

      // Connect to the IPC socket
      await this.connectIpc();

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

    // Clean up socket file
    if (this.ipcPath && fs.existsSync(this.ipcPath)) {
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

  private waitForSocket(timeout = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
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
