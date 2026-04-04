import { BrowserWindow, screen, Rectangle } from 'electron';

/**
 * Manages a transparent child BrowserWindow that embeds mpv via --wid=HWND.
 * The child window tracks the video area bounds within the main window.
 */
export class VideoWindowService {
  private videoWindow: BrowserWindow | null = null;
  private mainWindow: BrowserWindow | null = null;

  /**
   * Create the transparent child window for mpv rendering.
   */
  create(parent: BrowserWindow): void {
    // Destroy existing window if any
    this.destroy();

    this.mainWindow = parent;

    this.videoWindow = new BrowserWindow({
      parent,
      frame: false,
      backgroundColor: '#000000',
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Don't show in taskbar
    this.videoWindow.setSkipTaskbar(true);

    // Handle window close attempts
    this.videoWindow.on('closed', () => {
      this.videoWindow = null;
    });
  }

  /**
   * Show the video window at the given bounds (relative to the main window).
   */
  show(bounds: Rectangle): void {
    if (!this.videoWindow || !this.mainWindow) return;

    const parentBounds = this.mainWindow.getBounds();
    this.videoWindow.setBounds({
      x: parentBounds.x + bounds.x,
      y: parentBounds.y + bounds.y,
      width: bounds.width,
      height: bounds.height,
    });

    this.videoWindow.showInactive();
  }

  /**
   * Hide the video window.
   */
  hide(): void {
    if (this.videoWindow) {
      this.videoWindow.hide();
    }
  }

  /**
   * Destroy the video window entirely.
   */
  destroy(): void {
    if (this.videoWindow && !this.videoWindow.isDestroyed()) {
      this.videoWindow.close();
    }
    this.videoWindow = null;
  }

  /**
   * Get the handle for mpv --wid.
   * On Linux X11: returns the X11 Window ID as a hex string (required format for mpv).
   * On Windows: returns the HWND as an integer.
   */
  getWindowId(): string | number | null {
    if (!this.videoWindow || this.videoWindow.isDestroyed()) {
      return null;
    }
    const handle = this.videoWindow.getNativeWindowHandle();
    
    if (process.platform === 'win32') {
      return handle.readInt32LE(0);
    } else if (process.platform === 'darwin') {
      return handle.readUInt32LE(0);
    } else {
      // Linux X11: handle is a buffer with the X11 Window ID
      // mpv expects it as a hex string (e.g., "0x12345678")
      const xid = handle.readBigUInt64LE(0);
      return '0x' + xid.toString(16);
    }
  }

  /**
   * Check if the window exists and is not destroyed.
   */
  exists(): boolean {
    return !!this.videoWindow && !this.videoWindow.isDestroyed();
  }
}

export const videoWindow = new VideoWindowService();
