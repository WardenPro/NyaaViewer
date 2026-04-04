import path from 'path';
import fs from 'fs';
import os from 'os';

interface BinaryConfig {
  mpv: { downloadUrl: string; localPath: string; executableName: string };
  mediainfo: { downloadUrl: string; localPath: string; executableName: string };
}

const BIN_DIR = path.join(__dirname, '../../bin');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function getBinDir(): string {
  // In production (packed Electron app), binaries are in resources/bin
  if (process.resourcesPath) {
    const packedBin = path.join(process.resourcesPath, 'bin');
    if (fs.existsSync(packedBin)) return packedBin;
  }
  // In development, use project bin/
  return BIN_DIR;
}

/**
 * Get the path to the mpv binary
 * Checks bundled bin/ first, then falls back to system PATH
 */
export function getMpvPath(): string {
  const binDir = getBinDir();
  const binaryName = isWin ? 'mpv.exe' : 'mpv';
  const bundled = path.join(binDir, binaryName);

  if (fs.existsSync(bundled)) {
    console.log('[binaries] Using bundled mpv:', bundled);
    return bundled;
  }

  // Fallback to system PATH: try to find absolute path on Unix
  if (!isWin) {
    try {
      const { execSync } = require('child_process');
      const absolutePath = execSync('which mpv').toString().trim();
      if (absolutePath && fs.existsSync(absolutePath)) {
        console.log('[binaries] Found system mpv at:', absolutePath);
        return absolutePath;
      }
    } catch (_) {}
  }

  console.log('[binaries] Bundled mpv not found, falling back to "mpv" command');
  return binaryName;
}

/**
 * Get the path to the mediainfo binary
 * Checks bundled bin/ first, then falls back to system PATH
 */
export function getMediainfoPath(): string {
  const binDir = getBinDir();
  const binaryName = isWin ? 'mediainfo.exe' : 'mediainfo';
  const bundled = path.join(binDir, binaryName);

  if (fs.existsSync(bundled)) {
    console.log('[binaries] Using bundled mediainfo:', bundled);
    return bundled;
  }

  // Try to find absolute path on Unix
  if (!isWin) {
    try {
      const { execSync } = require('child_process');
      const absolutePath = execSync('which mediainfo').toString().trim();
      if (absolutePath && fs.existsSync(absolutePath)) {
        console.log('[binaries] Found system mediainfo at:', absolutePath);
        return absolutePath;
      }
    } catch (_) {}
  }

  return binaryName;
}

/**
 * Check if binaries are downloaded
 */
export function areBinariesAvailable(): { mpv: boolean; mediainfo: boolean } {
  return {
    mpv: fs.existsSync(getMpvPath()),
    mediainfo: fs.existsSync(getMediainfoPath()),
  };
}

/**
 * Platform-specific download URLs for mpv and mediainfo
 */
function getUrls(): BinaryConfig {
  if (isWin) {
    return {
      mpv: {
        downloadUrl: 'https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20260403/mpv-x86_64-20260403-git-c41ee4b.7z',
        localPath: path.join(BIN_DIR, 'mpv.7z'),
        executableName: 'mpv.exe',
      },
      mediainfo: {
        downloadUrl: 'https://mediaarea.net/download/binary/mediainfo/24.12/MediaInfo_CLI_24.12_Windows_x64.zip',
        localPath: path.join(BIN_DIR, 'mediainfo.zip'),
        executableName: 'mediainfo.exe',
      },
    };
  }

  if (isMac) {
    return {
      mpv: {
        downloadUrl: 'https://laboratory.stolendata.net/~djinn/mpv_osx/mpv-latest.tar.gz',
        localPath: path.join(BIN_DIR, 'mpv.tar.gz'),
        executableName: 'mpv',
      },
      mediainfo: {
        downloadUrl: 'https://mediaarea.net/download/binary/mediainfo/24.12/MediaInfo_CLI_24.12_Mac_x64.tar.bz2',
        localPath: path.join(BIN_DIR, 'mediainfo.tar.bz2'),
        executableName: 'mediainfo',
      },
    };
  }

  // Linux (default)
  return {
    mpv: {
      downloadUrl: '', // Linux users should install via package manager
      localPath: '',
      executableName: 'mpv',
    },
    mediainfo: {
      downloadUrl: '',
      localPath: '',
      executableName: 'mediainfo',
    },
  };
}

/**
 * Download platform-specific binaries to bin/ directory
 * Returns info about what was downloaded
 */
export async function downloadBinaries(): Promise<{ mpv: boolean; mediainfo: boolean; message: string }> {
  if (isWin || isMac) {
    const urls = getUrls();
    const results = { mpv: false, mediainfo: false, message: '' };
    const messages: string[] = [];

    // Ensure bin directory exists
    if (!fs.existsSync(BIN_DIR)) {
      fs.mkdirSync(BIN_DIR, { recursive: true });
    }

    // Download each binary
    for (const [name, config] of Object.entries(urls) as Array<[string, BinaryConfig[keyof BinaryConfig]]>) {
      if (!config.downloadUrl) {
        messages.push(`${name}: no download URL for this platform`);
        continue;
      }

      try {
        messages.push(`Downloading ${name} from ${config.downloadUrl}...`);
        const response = await fetch(config.downloadUrl);
        if (!response.ok) {
          messages.push(`${name}: download failed (HTTP ${response.status})`);
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(config.localPath, buffer);
        messages.push(`${name}: downloaded to ${config.localPath}`);

        // Extract the archive
        await extractArchive(name, config.localPath, BIN_DIR, config.executableName);

        if (name === 'mpv') results.mpv = true;
        if (name === 'mediainfo') results.mediainfo = true;
      } catch (e) {
        messages.push(`${name}: failed - ${(e as Error).message}`);
      }
    }

    results.message = messages.join('\n');
    return results;
  }

  // Linux: recommend package manager
  return {
    mpv: false,
    mediainfo: false,
    message: 'On Linux, install via package manager:\n  Ubuntu/Debian: sudo apt install mpv mediainfo\n  Fedora: sudo dnf install mpv mediainfo\n  Arch: sudo pacman -S mpv mediainfo',
  };
}

/**
 * Extract a downloaded archive based on file extension
 */
async function extractArchive(name: string, archivePath: string, destDir: string, expectedName: string): Promise<void> {
  // For compressed archives, we need to extract
  // Since we can't use external deps easily, we'll rely on system tools
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  const ext = path.extname(archivePath).toLowerCase();

  if (ext === '.7z') {
    await execFileAsync('7z', ['x', archivePath, `-o${destDir}`, 'mpv.exe', 'mplayer.exe'], { timeout: 60000 });
  } else if (ext === '.zip') {
    await execFileAsync('unzip', ['-o', archivePath, '-d', destDir], { timeout: 60000 });
  } else if (ext === '.gz' || ext === '.bz2') {
    // tar.gz or tar.bz2
    await execFileAsync('tar', ['xf', archivePath, '-C', destDir], { timeout: 60000 });
  }

  // Make executable on Unix
  if (!isWin && !archivePath.endsWith('.exe')) {
    const extractedPath = path.join(destDir, expectedName);
    if (fs.existsSync(extractedPath)) {
      await fs.promises.chmod(extractedPath, 0o755);
    }
  }
}
