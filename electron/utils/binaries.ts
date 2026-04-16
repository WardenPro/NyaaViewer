import fs from 'fs';
import path from 'path';

const isWin = process.platform === 'win32';
const PROJECT_BIN_DIR = path.join(__dirname, '../../bin');

function getBundledBinDir(): string {
  if (process.resourcesPath) {
    const resourcesBinDir = path.join(process.resourcesPath, 'bin');
    if (fs.existsSync(resourcesBinDir)) {
      return resourcesBinDir;
    }
  }

  return PROJECT_BIN_DIR;
}

function resolveBundledBinary(name: string): string | null {
  const bundledPath = path.join(getBundledBinDir(), name);
  return fs.existsSync(bundledPath) ? bundledPath : null;
}

function resolveBinaryFromPath(command: string): string | null {
  if (isWin) {
    return null;
  }

  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const binaryPath = execSync(`which ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();

    return binaryPath && fs.existsSync(binaryPath) ? binaryPath : null;
  } catch {
    return null;
  }
}

function resolveBinary(binaryName: string): string {
  return resolveBundledBinary(binaryName) || resolveBinaryFromPath(binaryName) || binaryName;
}

export function getMpvPath(): string {
  return resolveBinary(isWin ? 'mpv.exe' : 'mpv');
}

export function getMediainfoPath(): string {
  return resolveBinary(isWin ? 'mediainfo.exe' : 'mediainfo');
}
