import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAppStore from '../store/appStore';
import SubtitleSelector from '../components/SubtitleSelector';

interface SubtitleTrack {
  id: number;
  language: string;
  codec: string;
  name: string;
  forced: boolean;
  default: boolean;
}

interface TorrentFile {
  path: string;
  size: number;
  id: number;
}

export default function PlayerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const torrent = location.state?.torrent as Partial<{ title: string; infohash: string; magnetUri: string }>;

  const player = useAppStore((s) => s.player);
  const setPlayerState = useAppStore((s) => s.setPlayerState);
  const resetPlayerState = useAppStore((s) => s.resetPlayerState);
  const preferredLang = useAppStore((s) => s.preferredSubtitleLang);

  const [isLoading, setIsLoading] = useState(false);
  const [torrentStatus, setTorrentStatus] = useState('');
  const [torrentFiles, setTorrentFiles] = useState<TorrentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>('');
  const [error, setError] = useState('');
  const [pollProgress, setPollProgress] = useState(0);

  // Auto-start the torrent-to-playback flow
  useEffect(() => {
    if (torrent) {
      startTorrentFlow(torrent);
    }
  }, []);

  // Position update listener from main process
  useEffect(() => {
    const handler = (data: { position: number; duration: number }) => {
      setPlayerState({
        currentPosition: data.position,
        duration: data.duration,
      });

      if (player.currentTorrent) {
        window.electronAPI.updateWatchPosition(player.currentTorrent.infohash, data.position);
      }
    };

    window.electronAPI.onPlayerPositionUpdate(handler);
    return () => {};
  }, [player.currentTorrent, setPlayerState]);

  // Periodic position save
  useEffect(() => {
    const interval = setInterval(() => {
      if (player.isPlaying && player.currentTorrent) {
        window.electronAPI.updateWatchPosition(
          player.currentTorrent.infohash,
          player.currentPosition,
        );
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [player.isPlaying, player.currentTorrent, player.currentPosition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.electronAPI.stopPlayback();
    };
  }, []);

  const startTorrentFlow = useCallback(async (torrentData: typeof torrent) => {
    if (!torrentData) return;

    setIsLoading(true);
    setError('');
    setTorrentStatus('Checking AllDebrid connection...');

    try {
      // Check AD key
      const apiKey = useAppStore.getState().allDebridApiKey;
      if (!apiKey) {
        setError('AllDebrid API key not configured. Go to Settings first.');
        setIsLoading(false);
        return;
      }

      // Upload magnet
      setTorrentStatus('Uploading magnet to AllDebrid...');
      const uploadResult = await window.electronAPI.uploadMagnet(torrentData.magnetUri);
      const magnetData = uploadResult as { id?: number; ready?: boolean; status?: string; error?: string };

      if (!magnetData.id) {
        setError(`Failed to upload magnet: ${magnetData.error || 'Unknown error'}`);
        setIsLoading(false);
        return;
      }

      const torrentId = magnetData.id;

      // Check if already ready from upload response (cached torrents)
      if (magnetData.ready) {
        setTorrentStatus('Fetching file list...');
      } else {
        setTorrentStatus('Waiting for AllDebrid to download torrent...');

        let attempts = 0;
        const maxAttempts = 120; // 10 min at 5s intervals

        while (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 5000));
          const status = await window.electronAPI.getTorrentStatus(torrentId) as { ready?: boolean; status?: string };

          if (status?.ready) {
            setTorrentStatus('Fetching file list...');
            break;
          }

          setTorrentStatus(`AllDebrid status: ${status?.status || 'processing...'} (${(attempts + 1) * 5}s)`);
          setPollProgress(((attempts + 1) / maxAttempts) * 100);
          attempts++;
        }
      }

      setTorrentStatus('Fetching file list...');
      const files = await window.electronAPI.getTorrentFiles(torrentId);
      const fileList = (files as TorrentFile[]) || [];
      setTorrentFiles(fileList);

      // Filter video files (mkv, mp4, webm, avi)
      const videoExtensions = ['.mkv', '.mp4', '.webm', '.avi', '.mov', '.wmv'];
      const videoFiles = fileList
        .filter((f) => {
          const ext = '.' + (f.path?.split('.').pop() || '').toLowerCase();
          return videoExtensions.includes(ext);
        })
        .sort((a, b) => (b.size || 0) - (a.size || 0));

      if (videoFiles.length > 1) {
        // Multiple video files - let user choose
        setTorrentStatus('Select a file to watch');
        setIsLoading(false);
        return;
      }

      if (videoFiles.length === 0) {
        setError('No video files found in this torrent');
        setIsLoading(false);
        return;
      }

      // Single video file - auto play
      await playFile(videoFiles[0]);
    } catch (e: unknown) {
      setError(`Error: ${(e as Error)?.message || 'Unknown error'}`);
      setIsLoading(false);
    }
  }, []);

  const playFile = async (file: TorrentFile) => {
    setSelectedFile(file);
    setIsLoading(true);
    setTorrentStatus(`Unlocking "${file.path}" for streaming...`);

    try {
      const unlockResult = await window.electronAPI.unlockLink(file.id);
      const unlockData = unlockResult as { success: boolean; link?: string; error?: string };

      if (!unlockData.success || !unlockData.link) {
        setError(`Failed to get streaming link: ${unlockData.error || 'No link returned'}`);
        setIsLoading(false);
        return;
      }

      setTorrentStatus('Starting playback...');

      await window.electronAPI.startPlayback(unlockData.link);
      setPlayerState({
        isPlaying: true,
        currentTorrent: torrent as any,
      });

      // Try to extract subtitle tracks
      // For remote URLs, mpv handles subtitle detection via --slang
      // We set the preferred language
      await window.electronAPI.setSubtitleTrack('auto');

      setError('');
      setIsLoading(false);
      setTorrentStatus('');
    } catch (e: unknown) {
      setError(`Playback error: ${(e as Error)?.message || 'Unknown'}`);
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    await window.electronAPI.stopPlayback();
    resetPlayerState();
    navigate('/search');
  };

  const handlePause = async () => {
    await window.electronAPI.pausePlayback();
    setPlayerState({ isPlaying: !player.isPlaying });
  };

  const handleSeek = async (position: number) => {
    await window.electronAPI.seekPlayback(position);
    setPlayerState({ currentPosition: position });
  };

  const handleSubtitleChange = async (trackId: string) => {
    setSelectedSubtitle(trackId);
    if (trackId === '') {
      await window.electronAPI.setSubtitleTrack('no');
    } else {
      await window.electronAPI.setSubtitleTrack(parseInt(trackId, 10));
    }
  };

  // ===== RENDER =====

  // Loading / waiting state
  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center space-y-4">
        <h2 className="text-xl font-bold">{torrent?.title || 'Loading...'}</h2>

        <div className="w-80 text-center space-y-3">
          <p className="text-dark-textMuted">{torrentStatus}</p>

          {/* Progress bar for polling */}
          {pollProgress > 0 && pollProgress < 100 && (
            <div className="space-y-1">
              <div className="w-full bg-dark-border rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${pollProgress}%` }}
                />
              </div>
              <p className="text-xs text-dark-textMuted">
                {Math.round(pollProgress)}% - Waiting for AllDebrid...
              </p>
            </div>
          )}

          <div className="flex justify-center mt-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center space-y-4">
        <div className="card border-red-800 bg-red-900/20 max-w-lg text-center space-y-4">
          <p className="text-red-400 text-lg font-semibold">Playback Error</p>
          <p className="text-dark-textMuted">{error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/search')} className="btn-primary">
              Back to Search
            </button>
            <button onClick={() => navigate('/settings')} className="btn-secondary">
              Check Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // File selection (multiple video files)
  if (torrentFiles.length > 0 && !player.isPlaying) {
    const videoExtensions = ['.mkv', '.mp4', '.webm', '.avi', '.mov', '.wmv'];
    const videoFiles = torrentFiles
      .filter((f) => {
        const ext = '.' + (f.path?.split('.').pop() || '').toLowerCase();
        return videoExtensions.includes(ext);
      })
      .sort((a, b) => (b.size || 0) - (a.size || 0));

    return (
      <div className="p-6 h-full flex flex-col">
        <button
          onClick={() => navigate('/search')}
          className="text-sm text-dark-textMuted hover:text-white mb-4"
        >
          ← Back to search
        </button>
        <h2 className="text-2xl font-bold mb-2">{torrent?.title}</h2>
        <p className="text-dark-textMuted mb-6">Select a file to watch:</p>

        <div className="space-y-2 max-w-2xl">
          {videoFiles.map((file) => (
            <button
              key={file.id}
              onClick={() => playFile(file)}
              className="w-full text-left p-4 card flex justify-between items-center group hover:border-primary/50"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{file.path}</p>
                <p className="text-sm text-dark-textMuted mt-1">
                  {(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB
                </p>
              </div>
              <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                ▶ Play
              </span>
            </button>
          ))}

          {/* Show non-video files as info */}
          {torrentFiles.filter((f) => {
            const ext = '.' + (f.path?.split('.').pop() || '').toLowerCase();
            return !videoExtensions.includes(ext);
          }).length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-dark-textMuted mb-2">Other files in torrent:</p>
              {torrentFiles
                .filter((f) => {
                  const ext = '.' + (f.path?.split('.').pop() || '').toLowerCase();
                  return !videoExtensions.includes(ext);
                })
                .slice(0, 5)
                .map((f) => (
                  <p key={f.id} className="text-xs text-dark-textMuted px-3 py-1 truncate">
                    {f.path} ({(f.size / (1024 * 1024)).toFixed(0)} MB)
                  </p>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active playback
  if (player.isPlaying) {
    return (
      <div className="h-full flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-dark-border bg-dark-card">
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{player.currentTorrent?.title || torrent?.title}</p>
            {selectedFile && (
              <p className="text-xs text-dark-textMuted truncate">{selectedFile.path}</p>
            )}
          </div>
          <div className="flex gap-2 ml-4">
            <button onClick={handlePause} className="btn-secondary text-sm py-1 px-3">
              {player.isPlaying ? 'Pause' : 'Play'}
            </button>
            <button onClick={handleStop} className="btn-secondary text-sm py-1 px-3">
              Stop
            </button>
          </div>
        </div>

        {/* Main area: video placeholder + side panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Video area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 bg-black flex items-center justify-center relative">
              <div className="text-center text-dark-textMuted">
                <p className="text-lg">mpv is handling video playback in a separate window</p>
                <p className="text-sm mt-1">
                  Controls above | Progress below
                </p>
              </div>
            </div>

            {/* Seek bar */}
            {player.duration > 0 && (
              <div className="px-6 py-3 bg-dark-card border-t border-dark-border">
                <input
                  type="range"
                  min={0}
                  max={player.duration}
                  value={player.currentPosition}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="w-full accent-primary h-2 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-dark-textMuted mt-1">
                  <span>{formatTime(player.currentPosition)}</span>
                  <span>{formatTime(player.duration)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Side panel */}
          <div className="w-72 bg-dark-card border-l border-dark-border p-4 space-y-6 overflow-y-auto">
            {/* Subtitle selector */}
            <div>
              <SubtitleSelector
                tracks={subtitleTracks.map((t) => ({
                  id: String(t.id),
                  language: t.language,
                  codec: t.codec,
                }))}
                selectedTrack={selectedSubtitle}
                onSelect={handleSubtitleChange}
              />
              <p className="text-xs text-dark-textMuted mt-2">
                Subtitle detection requires mediainfo CLI installed on your system.
              </p>
            </div>

            {/* Quick language toggle for mpv --slang */}
            <div className="card space-y-2">
              <p className="text-sm font-semibold">Quick Subtitle Language</p>
              {['en', 'fr', 'ja', 'und'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => window.electronAPI.setSubtitleTrack('auto')}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    preferredLang === lang
                      ? 'bg-primary/20 text-primary'
                      : 'text-dark-textMuted hover:text-white'
                  }`}
                >
                  {lang === 'en' ? 'English' : lang === 'fr' ? 'French' : lang === 'ja' ? 'Japanese' : 'Auto'}
                </button>
              ))}
            </div>

            {/* Torrent info */}
            {selectedFile && (
              <div className="card space-y-1">
                <p className="text-sm font-semibold">File Info</p>
                <p className="text-xs text-dark-textMuted truncate">{selectedFile.path}</p>
                <p className="text-xs text-dark-textMuted">
                  {(selectedFile.size / (1024 * 1024 * 1024)).toFixed(2)} GB
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: no torrent passed
  return (
    <div className="p-6 h-full flex items-center justify-center">
      <div className="text-center text-dark-textMuted">
        <p className="text-lg">No torrent selected</p>
        <button onClick={() => navigate('/search')} className="btn-primary mt-4">
          Search for anime
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
