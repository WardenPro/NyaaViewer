#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const DOWNLOADS = {
  win32: {
    mpv: 'https://mpv.srsfckn.biz/mpv-x86_64-v3.zip',
  },
  darwin: {
    mpv: 'https://laboratory.stolendata.net/~djinn/mpv_osx/mpv-latest.tar.gz',
  },
  linux: null,
};

async function main() {
  const platform = process.platform;
  const config = DOWNLOADS[platform];

  if (!config) {
    console.log('Linux: Install mpv via: sudo apt install mpv');
    return;
  }

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const filename = path.basename(config.mpv);
  const destPath = path.join(BIN_DIR, filename);

  console.log(`Downloading mpv for ${platform}...`);

  try {
    const res = await fetch(config.mpv);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`Downloaded (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

    console.log('Extracting...');
    if (config.mpv.endsWith('.zip')) {
      if (isWin) {
        execSync(`powershell -Command "Expand-Archive -Path '${destPath}' -DestinationPath '${BIN_DIR}' -Force"`, { stdio: 'inherit' });
      } else {
        execSync(`unzip -o "${destPath}" -d "${BIN_DIR}"`, { stdio: 'inherit' });
      }
    } else {
      execSync(`tar xf "${destPath}" -C "${BIN_DIR}"`, { stdio: 'inherit' });
    }

    fs.unlinkSync(destPath);
    
    if (!isWin) {
      execSync(`chmod +x "${BIN_DIR}/mpv"`, { stdio: 'ignore' });
    }
    
    console.log('Done! mpv installed to bin/');
  } catch (e) {
    console.error('Failed:', e.message);
    console.log('\nManually download mpv from: https://mpv.io/installation/');
    console.log('And place mpv.exe in the bin/ folder.');
  }
}

main().catch(console.error);
