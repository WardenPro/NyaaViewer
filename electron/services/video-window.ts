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
      transparent: true,
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
   * Get the HWND of the video window for mpv --wid.
   */
  getHwnd(): number | null {
    if (!this.videoWindow || this.videoWindow.isDestroyed()) {
      return null;
    }
    const handle = this.videoWindow.getNativeWindowHandle();
    if (handle.length >= 4) {
      return handle.readInt32LE(0);
    }
    return null;
  }

  /**
   * Check if the window exists and is not destroyed.
   */
  exists(): boolean {
    return !!this.videoWindow && !this.videoWindow.isDestroyed();
  }
}

export const videoWindow = new VideoWindowService();
