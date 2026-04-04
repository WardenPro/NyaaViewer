import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAppStore from '../store/appStore';
import SubtitleSelector from '../components/SubtitleSelector';

const VIDEO_EXTS = ['.mkv', '.mp4', '.webm', '.avi', '.mov', '.wmv'];

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
  link?: string;
}

export default function PlayerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const player = useAppStore((s) => s.player);

  const torrentFromState = location.state?.torrent as Partial<{ title: string; infohash: string; magnetUri: string }> | undefined;
  const torrent = torrentFromState || player.currentTorrent;

  const setPlayerState = useAppStore((s) => s.setPlayerState);
  const resetPlayerState = useAppStore((s) => s.resetPlayerState);

  const [isLoading, setIsLoading] = useState(false);
  const [torrentStatus, setTorrentStatus] = useState('');
  const [torrentFiles, setTorrentFiles] = useState<TorrentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>('');
  const [error, setError] = useState('');
  const [pollProgress, setPollProgress] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [debugContent, setDebugContent] = useState('');

  const videoAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.stopPlayback();
  }, []);

  useEffect(() => {
    if (torrent && !isLoading && torrentFiles.length === 0 && !player.isPlaying) {
      startTorrentFlow(torrent);
    }
  }, [torrent?.infohash]);

  useEffect(() => {
    const posHandler = (data: { position: number; duration: number }) => {
      setPlayerState({
        currentPosition: data.position,
        duration: data.duration,
      });

      if (player.currentTorrent) {
        window.electronAPI.updateWatchPosition(player.currentTorrent.infohash, data.position, data.duration);
      }
    };

    const tracksHandler = (tracks: any[]) => {
      setSubtitleTracks(tracks.map((t) => ({
        id: t.id,
        language: t.lang || 'unknown',
        codec: t.codec || 'unknown',
        name: t.title || t.lang || `Track ${t.id}`,
        forced: t.forced || false,
        default: t.default || false,
      })));
    };

    const endedHandler = () => {
      resetPlayerState();
      navigate('/search');
    };

    const errorHandler = (err: string) => {
      setError('Playback error: ' + err);
    };

    window.electronAPI.onPlayerPositionUpdate(posHandler);
    window.electronAPI.onPlayerTracksUpdate(tracksHandler);
    window.electronAPI.onPlayerEnded(endedHandler);
    window.electronAPI.onPlayerError(errorHandler);

    return () => {};
  }, [player.currentTorrent, setPlayerState, resetPlayerState, navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (player.isPlaying && player.currentTorrent) {
        window.electronAPI.updateWatchPosition(
          player.currentTorrent.infohash,
          player.currentPosition,
          player.duration,
        );
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [player.isPlaying, player.currentTorrent, player.currentPosition, player.duration]);

  const startTorrentFlow = useCallback(async (torrentData: typeof torrent) => {
    if (!torrentData) return;

    setIsLoading(true);
    setError('');
    setTorrentStatus('Checking AllDebrid connection...');

    try {
      const apiKey = useAppStore.getState().allDebridApiKey;
      if (!apiKey) {
        setError('AllDebrid API key not configured. Go to Settings first.');
        setIsLoading(false);
        return;
      }

      setTorrentStatus('Uploading magnet to AllDebrid...');
      const uploadResult = await window.electronAPI.uploadMagnet(torrentData.magnetUri);
      const magnetData = uploadResult as { id?: number; ready?: boolean; status?: string; error?: string };

      if (!magnetData.id) {
        setError('Failed to upload magnet: ' + (magnetData.error || 'Unknown error'));
        setIsLoading(false);
        return;
      }

      const torrentId = magnetData.id;

      if (magnetData.ready) {
        setTorrentStatus('Fetching file list...');
      } else {
        setTorrentStatus('Waiting for AllDebrid to download torrent...');

        let attempts = 1;
        while (attempts <= 120) {
          await new Promise((r) => setTimeout(r, 5000));
          const status = await window.electronAPI.getTorrentStatus(torrentId) as { ready?: boolean; status?: string };

          if (status?.ready) {
            setTorrentStatus('Fetching file list...');
            break;
          }

          setTorrentStatus('AllDebrid status: ' + (status?.status || 'processing...') + ' (' + (attempts * 5) + 's)');
          setPollProgress((attempts / 120) * 100);
          attempts++;
        }
      }

      setTorrentStatus('Fetching file list...');
      const filesResult = await window.electronAPI.getTorrentFiles(torrentId);
      const fileList = Array.isArray(filesResult) ? (filesResult as TorrentFile[]) : [];

      setTorrentFiles(fileList);

      const videoFiles = fileList
        .filter((f) => {
          const ext = '.' + (f.path?.split('.').pop() || '').toLowerCase();
          return VIDEO_EXTS.includes(ext);
        })
        .sort((a, b) => (b.size || 0) - (a.size || 0));

      if (videoFiles.length > 1) {
        setTorrentStatus('Select a file to watch');
        setIsLoading(false);
        return;
      }

      if (videoFiles.length === 0) {
        const fileSummary = fileList.length > 0
          ? JSON.stringify(fileList.slice(0, 5), null, 2)
          : 'EMPTY - AllDebrid returned no files at all';
        setError('No video files found in this torrent.\n\nFiles: ' + fileSummary);
        setIsLoading(false);
        return;
      }

      await playFile(videoFiles[0]);
    } catch (e: unknown) {
      setError('Error: ' + ((e as Error)?.message || 'Unknown error'));
      setIsLoading(false);
    }
  }, []);

  const playFile = async (file: TorrentFile) => {
    setSelectedFile(file);
    setIsLoading(true);
    setTorrentStatus('Unlocking "' + file.path + '" for streaming...');

    try {
      if (!file.link) {
        setError('No download link available for "' + file.path + '"');
        setIsLoading(false);
        return;
      }

      const unlockResult = await window.electronAPI.unlockLink(file.link);
      const unlockData = unlockResult as { success: boolean; link?: string; error?: string };

      if (!unlockData.success || !unlockData.link) {
        setError('Failed to get streaming link: ' + (unlockData.error || 'No link returned'));
        setIsLoading(false);
        return;
      }

      setTorrentStatus('Starting playback...');

      const result = await window.electronAPI.startPlayback(unlockData.link);
      if (!result?.success) {
        setError('Failed to start playback: ' + (result?.error || 'Unknown error'));
        setIsLoading(false);
        return;
      }

      setPlayerState({
        isPlaying: true,
        currentTorrent: torrent as any,
      });

      setError('');
      setIsLoading(false);
      setTorrentStatus('');
    } catch (e: unknown) {
      setError('Playback error: ' + ((e as Error)?.message || 'Unknown'));
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

  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center space-y-4">
        <h2 className="text-xl font-bold">{torrent?.title || 'Loading...'}</h2>

        <div className="w-80 text-center space-y-3">
          <p className="text-dark-textMuted">{torrentStatus}</p>

          {pollProgress > 0 && pollProgress < 100 && (
            <div className="space-y-1">
              <div className="w-full bg-dark-border rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: pollProgress + '%' }}
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

  if (error) {
    const handleShowDebug = async () => {
      setShowDebug(!showDebug);
      if (!debugContent) {
        const content = await window.electronAPI.getDebugFile();
        setDebugContent(content || 'No debug data available');
      }
    };
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center space-y-4">
        <div className="card border-red-800 bg-red-900/20 max-w-lg text-center space-y-4">
          <p className="text-red-400 text-lg font-semibold">Playback Error</p>
          <p className="text-dark-textMuted whitespace-pre-wrap">{error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={handleShowDebug} className="btn-secondary text-xs">
              {showDebug ? 'Hide Debug' : 'Debug Info'}
            </button>
            <button onClick={() => navigate('/search')} className="btn-primary">
              Back to Search
            </button>
            <button onClick={() => navigate('/settings')} className="btn-secondary">
              Check Settings
            </button>
          </div>
          {showDebug && (
            <pre className="text-left text-xs bg-black/30 p-3 rounded max-h-96 overflow-auto text-green-400 whitespace-pre-wrap">
              {debugContent || 'Loading...'}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (torrentFiles.length > 0 && !player.isPlaying) {
    const videoFiles = torrentFiles
      .filter((f) => {
        const ext = '.' + (f.path?.split('.').pop() || '').toLowerCase();
        return VIDEO_EXTS.includes(ext);
      })
      .sort((a, b) => (b.size || 0) - (a.size || 0));

    return (
      <div className="p-6 h-full flex flex-col">
        <button
          onClick={() => navigate('/search')}
          className="text-sm text-dark-textMuted hover:text-white mb-4"
        >
          Back to search
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
                Play
              </span>
            </button>
          ))}

          {torrentFiles.filter((f) => {
            const ext = '.' + (f.path?.split('.').pop() || '').toLowerCase();
            return !VIDEO_EXTS.includes(ext);
          }).length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-dark-textMuted mb-2">Other files in torrent:</p>
              {torrentFiles
                .filter((f) => {
                  const ext = '.' + (f.path?.split('.').pop() || '').toLowerCase();
                  return !VIDEO_EXTS.includes(ext);
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

  if (player.isPlaying) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-primary/20 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          
          <div>
            <h2 className="text-xl font-semibold">{player.currentTorrent?.title || torrent?.title}</h2>
            {selectedFile && (
              <p className="text-dark-textMuted mt-1">{selectedFile.path}</p>
            )}
          </div>

          <p className="text-dark-textMuted max-w-md">
            Video is playing in mpv window. Use mpv controls for playback.
          </p>

          <div className="flex gap-4 justify-center">
            <button onClick={handlePause} className="btn-primary">
              {player.isPlaying ? 'Pause' : 'Play'}
            </button>
            <button onClick={handleStop} className="btn-secondary">
              Stop
            </button>
          </div>

          {player.duration > 0 && (
            <div className="w-96 mx-auto">
              <input
                type="range"
                min={0}
                max={player.duration}
                step={0.1}
                value={player.currentPosition}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full accent-primary h-2 cursor-pointer"
              />
              <div className="flex justify-between text-sm text-dark-textMuted mt-1">
                <span>{formatTime(player.currentPosition)}</span>
                <span>{formatTime(player.duration)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + ':' + m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
  return m + ':' + s.toString().padStart(2, '0');
}
