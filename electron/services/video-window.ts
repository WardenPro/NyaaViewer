import { BrowserView, screen, Rectangle, app } from 'electron';
import path from 'path';

export class VideoWindowService {
  private videoView: BrowserView | null = null;
  private mainWindow: Electron.BrowserWindow | null = null;
  private isVisible = false;

  create(parent: Electron.BrowserWindow): void {
    this.destroy();
    this.mainWindow = parent;

    this.videoView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    parent.addBrowserView(this.videoView);
  }

  show(bounds: Rectangle): void {
    if (!this.videoView || !this.mainWindow) return;

    this.videoView.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });

    if (!this.isVisible) {
      this.mainWindow.addBrowserView(this.videoView);
      this.isVisible = true;
    }
  }

  hide(): void {
    if (this.videoView && this.mainWindow && this.isVisible) {
      this.mainWindow.removeBrowserView(this.videoView);
      this.isVisible = false;
    }
  }

  destroy(): void {
    if (this.videoView && this.mainWindow) {
      try {
        if (this.isVisible) {
          this.mainWindow.removeBrowserView(this.videoView);
        }
      } catch (_) {}
      this.videoView = null;
      this.isVisible = false;
    }
  }

  getWebContents(): Electron.WebContents | null {
    return this.videoView?.webContents || null;
  }

  exists(): boolean {
    return !!this.videoView && this.isVisible;
  }

  getWindowId(): string | number | null {
    if (!this.videoView || !this.mainWindow) return null;
    
    const handle = this.mainWindow.getNativeWindowHandle();
    
    if (process.platform === 'win32') {
      // On Windows 64-bit, HWND is a pointer (8 bytes)
      // Convert to Number for mpv (HWND fits in 64-bit)
      if (handle.length >= 8) {
        return Number(handle.readBigInt64LE(0));
      } else if (handle.length >= 4) {
        return handle.readInt32LE(0);
      }
      return null;
    } else if (process.platform === 'darwin') {
      return handle.readUInt32LE(0);
    } else {
      const xid = handle.readBigUInt64LE(0);
      return '0x' + xid.toString(16);
    }
  }
}

export const videoWindow = new VideoWindowService();
