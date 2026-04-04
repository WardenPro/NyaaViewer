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
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
      setCurrentVideoUrl('');
    };
  }, []);

  useEffect(() => {
    if (torrent && !isLoading && torrentFiles.length === 0 && !player.isPlaying) {
      startTorrentFlow(torrent);
    }
  }, [torrent?.infohash]);

  useEffect(() => {
    if (player.isPlaying && videoRef.current && currentVideoUrl) {
      videoRef.current.src = currentVideoUrl;
      videoRef.current.play().catch(console.error);
      
      if (player.currentPosition > 0) {
        videoRef.current.currentTime = player.currentPosition;
      }
    }
  }, [player.isPlaying, currentVideoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setPlayerState({
        currentPosition: video.currentTime,
      });
    };

    const handleDurationChange = () => {
      setPlayerState({
        duration: video.duration || 0,
      });
    };

    const handleEnded = () => {
      resetPlayerState();
      navigate('/search');
    };

    const handleError = (e: Event) => {
      console.error('Video error:', e);
      setError(`Video playback error: ${(e as ErrorEvent).message || 'Unknown error'}`);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [setPlayerState, resetPlayerState, navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (player.isPlaying && player.currentTorrent && videoRef.current) {
        window.electronAPI.updateWatchPosition(
          player.currentTorrent.infohash,
          videoRef.current.currentTime,
          videoRef.current.duration || player.duration,
        );
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [player.isPlaying, player.currentTorrent]);

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
        setError(`Failed to upload magnet: ${magnetData.error || 'Unknown error'}`);
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

          setTorrentStatus(`AllDebrid status: ${status?.status || 'processing...'} (${attempts * 5}s)`);
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
        setError(`No video files found in this torrent.\n\nFiles: ${fileSummary}`);
        setIsLoading(false);
        return;
      }

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
      if (!file.link) {
        setError(`No download link available for "${file.path}"`);
        setIsLoading(false);
        return;
      }

      const unlockResult = await window.electronAPI.unlockLink(file.link);
      const unlockData = unlockResult as { success: boolean; link?: string; error?: string };

      if (!unlockData.success || !unlockData.link) {
        setError(`Failed to get streaming link: ${unlockData.error || 'No link returned'}`);
        setIsLoading(false);
        return;
      }

      setCurrentVideoUrl(unlockData.link);
      setPlayerState({
        isPlaying: true,
        currentTorrent: torrent as any,
        currentPosition: 0,
        duration: 0,
      });

      setError('');
      setIsLoading(false);
      setTorrentStatus('');
    } catch (e: unknown) {
      setError(`Playback error: ${(e as Error)?.message || 'Unknown'}`);
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    setCurrentVideoUrl('');
    resetPlayerState();
    navigate('/search');
  };

  const handlePause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(console.error);
        setPlayerState({ isPlaying: true });
      } else {
        videoRef.current.pause();
        setPlayerState({ isPlaying: false });
      }
    }
  };

  const handleSeek = (position: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = position;
      setPlayerState({ currentPosition: position });
    }
  };

  const handleSubtitleChange = (trackId: string) => {
    setSelectedSubtitle(trackId);
    if (videoRef.current && trackId === '') {
      videoRef.current.textTracks[0] && (videoRef.current.textTracks[0].mode = 'hidden');
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
      <div className="h-full flex flex-col">
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

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col bg-black">
            <video
              ref={videoRef}
              className="w-full h-full"
              controls
              autoPlay
              playsInline
            />
          </div>

          <div className="w-72 bg-dark-card border-l border-dark-border p-4 space-y-6 overflow-y-auto">
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
                Subtitles are embedded in the video stream when available.
              </p>
            </div>

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
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
