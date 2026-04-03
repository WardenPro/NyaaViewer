#!/usr/bin/env node
/**
 * Download mpv and mediainfo binaries for the current platform
 * Run: node scripts/download-binaries.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const DOWNLOADS = {
  win32: {
    mpv: {
      url: 'https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20260403/mpv-x86_64-20260403-git-c41ee4b.7z',
      file: 'mpv.7z',
      extract: ['mpv.exe', 'mplayer.exe'],
    },
    mediainfo: {
      url: 'https://mediaarea.net/download/binary/mediainfo/24.12/MediaInfo_CLI_24.12_Windows_x64.zip',
      file: 'mediainfo.zip',
      extract: null, // extract all
    },
  },
  darwin: {
    mpv: {
      url: 'https://laboratory.stolendata.net/~djinn/mpv_osx/mpv-latest.tar.gz',
      file: 'mpv.tar.gz',
      extract: null,
    },
    mediainfo: {
      url: 'https://mediaarea.net/download/binary/mediainfo/24.12/MediaInfo_CLI_24.12_Mac_x64.tar.bz2',
      file: 'mediainfo.tar.bz2',
      extract: null,
    },
  },
  linux: null,
};

async function download(url, dest) {
  console.log(`  Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  console.log(`  Saved to ${dest} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

function extract(filename, destDir, extractFilter) {
  const ext = path.extname(filename).toLowerCase();
  const fullPath = path.join(BIN_DIR, filename);

  console.log(`  Extracting ${filename}...`);

  if (ext === '.7z') {
    const args = extractFilter ? ['x', fullPath, `-o${destDir}`, ...extractFilter] : ['x', fullPath, `-o${destDir}`];
    execSync('7z ' + args.join(' '), { cwd: BIN_DIR, stdio: 'inherit' });
  } else if (ext === '.zip') {
    execSync(`unzip -o "${fullPath}" -d "${destDir}"`, { stdio: 'inherit' });
  } else if (ext === '.gz' || ext === '.bz2') {
    execSync(`tar xf "${fullPath}" -C "${destDir}"`, { stdio: 'inherit' });
  }

  // Make executables on Unix
  if (!isWin) {
    execSync(`chmod +x "${destDir}/mpv" 2>/dev/null; chmod +x "${destDir}/mediainfo" 2>/dev/null || true`, { stdio: 'pipe' });
  }

  // Clean up archive
  fs.unlinkSync(fullPath);
  console.log(`  Cleaned up ${filename}`);
}

async function main() {
  const platform = process.platform;
  const config = DOWNLOADS[platform];

  if (!config) {
    console.log('Linux detected. Install binaries via package manager:');
    console.log('  Ubuntu/Debian: sudo apt install mpv mediainfo');
    console.log('  Fedora:        sudo dnf install mpv mediainfo');
    console.log('  Arch:          sudo pacman -S mpv mediainfo');
    return;
  }

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  console.log(`Downloading binaries for ${platform}...`);

  for (const [name, dl] of Object.entries(config)) {
    console.log(`\n[${name}]`);
    try {
      await download(dl.url, path.join(BIN_DIR, dl.file));
      if (fs.existsSync(path.join(BIN_DIR, dl.file))) {
        extract(dl.file, BIN_DIR, dl.extract);
      }
      console.log(`  [OK] ${name} installed`);
    } catch (e) {
      console.error(`  [FAIL] ${name}: ${e.message}`);
    }
  }

  console.log('\nDone. Binaries are in: bin/');
  console.log('Files will be bundled in electron-builder release/');
}

main().catch(console.error);
