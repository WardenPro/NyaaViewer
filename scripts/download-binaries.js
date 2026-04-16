#!/usr/bin/env node
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
      archiveName: 'mpv.7z',
      expectedNames: ['mpv.exe'],
      outputName: 'mpv.exe',
    },
    mediainfo: {
      url: 'https://mediaarea.net/download/binary/mediainfo/24.12/MediaInfo_CLI_24.12_Windows_x64.zip',
      archiveName: 'mediainfo.zip',
      expectedNames: ['mediainfo.exe', 'MediaInfo.exe'],
      outputName: 'mediainfo.exe',
    },
  },
  darwin: {
    mpv: {
      url: 'https://laboratory.stolendata.net/~djinn/mpv_osx/mpv-latest.tar.gz',
      archiveName: 'mpv.tar.gz',
      expectedNames: ['mpv'],
      outputName: 'mpv',
    },
    mediainfo: {
      url: 'https://mediaarea.net/download/binary/mediainfo/24.12/MediaInfo_CLI_24.12_Mac_x64.tar.bz2',
      archiveName: 'mediainfo.tar.bz2',
      expectedNames: ['mediainfo'],
      outputName: 'mediainfo',
    },
  },
  linux: null,
};

async function main() {
  const config = DOWNLOADS[process.platform];

  if (!config) {
    console.log('Linux : installez les dépendances système avec votre gestionnaire de paquets.');
    console.log('  Ubuntu / Debian : sudo apt install mpv mediainfo');
    console.log('  Fedora          : sudo dnf install mpv mediainfo');
    console.log('  Arch            : sudo pacman -S mpv mediainfo');
    return;
  }

  fs.mkdirSync(BIN_DIR, { recursive: true });

  for (const [name, asset] of Object.entries(config)) {
    const archivePath = path.join(BIN_DIR, asset.archiveName);
    const extractDir = path.join(BIN_DIR, `.tmp-${name}`);

    console.log(`\n→ Téléchargement de ${name}...`);

    try {
      await downloadFile(asset.url, archivePath);
      resetDir(extractDir);
      extractArchive(archivePath, extractDir);

      const binaryPath = findFirstMatchingFile(extractDir, asset.expectedNames);
      if (!binaryPath) {
        throw new Error(`exécutable introuvable (${asset.expectedNames.join(', ')})`);
      }

      const destinationPath = path.join(BIN_DIR, asset.outputName);
      fs.copyFileSync(binaryPath, destinationPath);
      if (!isWin) {
        fs.chmodSync(destinationPath, 0o755);
      }

      console.log(`✓ ${name} installé : ${destinationPath}`);
    } catch (error) {
      console.error(`✗ Échec pour ${name} : ${error.message}`);
      process.exitCode = 1;
    } finally {
      safeRemove(archivePath);
      safeRemove(extractDir);
    }
  }
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, buffer);
}

function extractArchive(archivePath, outputDir) {
  const lowerName = archivePath.toLowerCase();

  if (lowerName.endsWith('.7z')) {
    execSync(`7z x "${archivePath}" -o"${outputDir}" -y`, { stdio: 'inherit' });
    return;
  }

  if (lowerName.endsWith('.zip')) {
    if (isWin) {
      execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${outputDir}' -Force"`, {
        stdio: 'inherit',
      });
    } else {
      execSync(`unzip -o "${archivePath}" -d "${outputDir}"`, { stdio: 'inherit' });
    }
    return;
  }

  if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz') || lowerName.endsWith('.tar.bz2') || lowerName.endsWith('.tbz2')) {
    execSync(`tar xf "${archivePath}" -C "${outputDir}"`, { stdio: 'inherit' });
    return;
  }

  throw new Error(`format d'archive non géré : ${archivePath}`);
}

function findFirstMatchingFile(rootDir, expectedNames) {
  const queue = [rootDir];
  const expected = expectedNames.map((name) => name.toLowerCase());

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const stats = fs.statSync(currentPath);

    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(currentPath)) {
        queue.push(path.join(currentPath, entry));
      }
      continue;
    }

    const fileName = path.basename(currentPath).toLowerCase();
    if (expected.includes(fileName)) {
      return currentPath;
    }
  }

  return null;
}

function resetDir(dirPath) {
  safeRemove(dirPath);
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeRemove(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
}

main().catch((error) => {
  console.error('Échec inattendu :', error);
  process.exit(1);
});
