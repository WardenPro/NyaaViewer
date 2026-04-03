import { execFile } from 'child_process';
import { getMediainfoPath } from '../utils/binaries';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface SubtitleTrack {
  id: number;
  language: string;
  codec: string;
  name: string;
  forced: boolean;
  default: boolean;
}

/**
 * Extract subtitle tracks from a MKV file using mediainfo CLI
 */
export async function extractSubtitleTracks(filePath: string): Promise<SubtitleTrack[]> {
  let mediainfoPath: string;
  try {
    mediainfoPath = getMediainfoPath();
  } catch {
    console.warn('mediainfo binary not found. Subtitle detection will be unavailable.');
    return [];
  }

  try {
    const { stdout } = await execFileAsync(mediainfoPath, [
      '--Output=JSON',
      filePath,
    ], {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const data = JSON.parse(stdout);
    if (!data?.media?.track) return [];

    // mediainfo JSON structure: media.track is an array with General, Video, Audio, Text sections
    const tracks: unknown[] = data.media.track;
    const subtitleTracks: SubtitleTrack[] = [];
    let trackCounter = 0;

    for (const track of tracks) {
      const t = track as Record<string, unknown>;
      if (t['@type'] === 'Text') {
        const lang = (t['Language'] as string) || 'und';
        const format = (t['Format'] as string) || 'Unknown';
        const title = (t['Title'] as string) || '';
        const forced = (t['Forced'] as string) === 'Yes';
        const isDefault = (t['Default'] as string) === 'Yes';

        // Map mediainfo format names to common codec names
        const codec = normalizeCodecFormat(format);

        // MPV uses 1-based subtitle IDs for --sid
        // mediainfo doesn't always give a stable numeric ID, so we use order
        trackCounter++;

        subtitleTracks.push({
          id: trackCounter,
          language: lang.toLowerCase().slice(0, 2),
          codec,
          name: title || `${lang} ${codec}${forced ? ' (Forced)' : ''}`,
          forced,
          default: isDefault,
        });
      }
    }

    return subtitleTracks;
  } catch (e: unknown) {
    const error = e as { code?: string; message?: string };
    if (error.code === 'ENOENT') {
      console.warn('mediainfo not found at path:', mediainfoPath);
    } else if (error.code === 'ETIMEDOUT') {
      console.error('mediainfo timed out for file:', filePath);
    } else {
      console.error('Failed to extract subtitles:', error.message);
    }
    return [];
  }
}

/**
 * Normalize mediainfo format strings to common codec names
 */
function normalizeCodecFormat(format: string): string {
  const f = format.toLowerCase();
  if (f.includes('subrip') || f.includes('srt')) return 'SRT';
  if (f.includes('ass') || f.includes('ssa')) return 'ASS';
  if (f.includes('pgs') || f.includes('hdmv')) return 'PGS';
  if (f.includes('vobsub')) return 'VOBSUB';
  if (f.includes('tx3g') || f.includes('mov')) return 'TX3G';
  if (f.includes('webvtt') || f.includes('vtt')) return 'VTT';
  if (f.includes('dvb') || f.includes('dvbsub')) return 'DVB';
  if (f.includes('eia')) return 'CEA-608';
  return format;
}

/**
 * Extract subtitles from a remote URL by downloading to a temp file first
 */
export async function extractSubtitleTracksFromUrl(url: string, tmpDir: string): Promise<SubtitleTrack[]> {
  // For remote URLs, mediainfo can sometimes read directly
  // but it's more reliable to use mpv's built-in subtitle listing
  // We'll let mpv handle this via its IPC
  console.log('Remote subtitle detection not yet implemented for direct URL:', url);
  return [];
}
