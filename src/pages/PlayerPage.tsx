import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAppStore from '../store/appStore';
import SubtitleSelector from '../components/SubtitleSelector';

const VIDEO_EXTS = ['.mkv', '.mp4', '.webm', '.avi', '.mov', '.wmv'];

interface SubtitleTrack {
  id: string;
  language: string;
  codec: string;
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
  const setPlayerState = useAppStore((s) => s.setPlayerState);
  const resetPlayerState = useAppStore((s) => s.resetPlayerState);

  const torrentFromState = location.state?.torrent as any;
  const torrent = torrentFromState || player.currentTorrent;

  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [torrentFiles, setTorrentFiles] = useState<TorrentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
  const [error, setError] = useState('');
  const [pollProgress, setPollProgress] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [debugContent, setDebugContent] = useState('');
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>('');

  const isFlowStarted = useRef(false);

  // Initialize: stop any previous playback
  useEffect(() => {
    window.electronAPI.stopPlayback();
    return () => {
      // Cleanup on unmount
      if (location.pathname !== '/player') {
        window.electronAPI.stopPlayback();
      }
    };
  }, []);

  // IPC Event Listeners
  useEffect(() => {
    const posHandler = (data: { position: number; duration: number }) => {
      setPlayerState({
        currentPosition: data.position,
        duration: data.duration,
      });
    };

    const tracksHandler = (tracks: any[]) => {
      setSubtitleTracks(tracks.map((t: any) => ({
        id: String(t.id),
        language: t.lang || t.language || 'und',
        codec: t.codec || 'unknown',
      })));
    };

    const endedHandler = () => {
      handleStop();
    };

    const errorHandler = (err: string) => {
      setError('Playback error: ' + err);
      setIsLoading(false);
    };

    window.electronAPI.onPlayerPositionUpdate(posHandler);
    window.electronAPI.onPlayerTracksUpdate(tracksHandler);
    window.electronAPI.onPlayerEnded(endedHandler);
    window.electronAPI.onPlayerError(errorHandler);

    return () => {
      // Clean listeners would be better here if API allowed
    };
  }, [setPlayerState]);

  // Periodic Watch History Update
  useEffect(() => {
    const interval = setInterval(() => {
      if (player.isPlaying && player.currentTorrent) {
        window.electronAPI.updateWatchPosition(
          player.currentTorrent.infohash,
          player.currentPosition,
          player.duration,
        );
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [player.isPlaying, player.currentTorrent, player.currentPosition, player.duration]);

  const log = useCallback((...args: unknown[]) => {
    const ts = new Date().toISOString();
    console.log(`[PlayerPage] [${ts}]`, ...args);
  }, []);

  const startTorrentFlow = useCallback(async (torrentData: any) => {
    log('=== startTorrentFlow ===');
    log('Torrent data: title=' + (torrentData?.title || 'N/A'));
    if (!torrentData || isFlowStarted.current) {
      log('Aborted: no torrent or already started');
      return;
    }
    isFlowStarted.current = true;
    const flowStart = Date.now();

    setIsLoading(true);
    setError('');
    setStatusText('Checking AllDebrid...');

    try {
      const apiKey = useAppStore.getState().allDebridApiKey;
      log('API key present: ' + !!apiKey);
      if (!apiKey) {
        throw new Error('AllDebrid API key not configured. Please go to Settings.');
      }

      log('Step 1: Uploading magnet to AllDebrid...');
      setStatusText('Uploading magnet...');
      const uploadResult = await window.electronAPI.uploadMagnet(torrentData.magnetUri) as any;
      log('Upload result: ' + JSON.stringify(uploadResult));
      if (uploadResult.error) throw new Error(uploadResult.error);

      const torrentId = uploadResult.id;
      log(`Torrent ID: ${torrentId}, Ready: ${uploadResult.ready}`);

      if (!uploadResult.ready) {
        log('Torrent not yet ready, starting poll...');
        setStatusText('Waiting for AllDebrid to download...');
        let ready = false;
        let attempts = 0;
        const maxAttempts = 240; // 20 minutes

        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 5000));
          const status = await window.electronAPI.getTorrentStatus(torrentId) as any;
          log(`Poll #${attempts + 1}: ${JSON.stringify(status)}`);

          if (status.error) throw new Error(status.error);
          if (status.ready) {
            ready = true;
            log(`Torrent is READY after ${Date.now() - flowStart} ms`);
            break;
          }

          setStatusText(`Downloading: ${status.status || 'processing'} (${Math.round((attempts / maxAttempts) * 100)}%)`);
          setPollProgress((attempts / maxAttempts) * 100);
          attempts++;
        }

        if (!ready) throw new Error('Download timed out on AllDebrid side.');
      } else {
        log(`Torrent was already ready/cached, elapsed: ${Date.now() - flowStart} ms`);
      }

      log('Step 2: Fetching file list...');
      setStatusText('Fetching file list...');
      const files = await window.electronAPI.getTorrentFiles(torrentId) as TorrentFile[];
      log(`Files received: ${files.length} — ` + files.map(f => f.path).join(', '));
      setTorrentFiles(files);

      const videoFiles = files
        .filter(f => VIDEO_EXTS.some(ext => f.path.toLowerCase().endsWith(ext)))
        .sort((a, b) => b.size - a.size);

      log(`Video files after filtering: ${videoFiles.length} — ` + videoFiles.map(f => f.path).join(', '));

      if (videoFiles.length === 0) {
        throw new Error('No video files found in this torrent.');
      }

      if (videoFiles.length === 1) {
        log('Single video file, auto-playing...');
        await playFile(videoFiles[0], torrentData);
      } else {
        log('Multiple video files, showing selection list');
        setStatusText('Multiple video files found. Please select one.');
        setIsLoading(false);
      }
    } catch (e: any) {
      log('ERROR in startTorrentFlow: ' + e.message);
      setError(e.message);
      setIsLoading(false);
      isFlowStarted.current = false;
    }
  }, [log]);

  useEffect(() => {
    if (torrent && !isLoading && torrentFiles.length === 0 && !player.isPlaying) {
      startTorrentFlow(torrent);
    }
  }, [torrent, startTorrentFlow, isLoading, torrentFiles.length, player.isPlaying]);

  const playFile = async (file: TorrentFile, torrentData: any) => {
    setSelectedFile(file);
    setIsLoading(true);
    setError('');
    const fileName = file.path.split('/').pop() || file.path;
    log(`=== playFile === file: ${fileName} link present: ${!!file.link}`);
    setStatusText(`Unlocking: ${fileName}`);

    try {
      if (!file.link) throw new Error('No link available for this file.');

      log('Step 3: Unlocking link...');
      const unlock = await window.electronAPI.unlockLink(file.link) as any;
      log('Unlock result: ' + JSON.stringify(unlock));
      if (!unlock.success) throw new Error(unlock.error || 'Failed to unlock link');
      log('Unlocked URL (first 100): ' + (unlock.link || '').substring(0, 100));

      log('Step 4: Starting playback...');
      setStatusText('Starting mpv...');
      const playback = await window.electronAPI.startPlayback(unlock.link) as any;
      log('Start playback result:', JSON.stringify(playback));
      if (!playback.success) throw new Error(playback.error || 'Failed to start mpv');

      log('Step 5: Setting player state to playing');
      setPlayerState({
        isPlaying: true,
        currentTorrent: torrentData,
      });

      // Save initial watch entry
      window.electronAPI.addWatchEntry({
        infohash: torrentData.infohash,
        title: torrentData.title,
        magnetUri: torrentData.magnetUri,
        lastPosition: 0,
        duration: 0,
        lastWatched: new Date().toISOString()
      });

      log('=== playFile completed OK ===');
      setIsLoading(false);
      setStatusText('');
    } catch (e: any) {
      log('ERROR in playFile:', e.message);
      setError(e.message);
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

  const handleSeek = (position: number) => {
    window.electronAPI.seekPlayback(position);
    setPlayerState({ currentPosition: position });
  };

  const handleSubtitleChange = (trackId: string) => {
    setSelectedSubtitle(trackId);
    window.electronAPI.setSubtitleTrack(trackId === '' ? 'no' : trackId);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white">{torrent?.title || 'Loading...'}</h2>
          <p className="text-dark-textMuted animate-pulse">{statusText}</p>
        </div>
        {pollProgress > 0 && (
          <div className="w-full max-w-md bg-dark-border h-2 rounded-full overflow-hidden">
            <div 
              className="bg-primary h-full transition-all duration-500" 
              style={{ width: `${pollProgress}%` }}
            ></div>
          </div>
        )}
        <button 
          onClick={() => navigate('/search')}
          className="btn-secondary mt-4"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="card border-red-900/50 bg-red-950/20 max-w-2xl w-full p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-red-400">Streaming Error</h2>
            <p className="text-dark-textMuted break-words">{error}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => { isFlowStarted.current = false; startTorrentFlow(torrent); }} className="btn-primary">
              Try Again
            </button>
            <button onClick={() => navigate('/search')} className="btn-secondary">
              Back to Search
            </button>
            <button 
              onClick={async () => {
                setShowDebug(!showDebug);
                if (!debugContent) setDebugContent(await window.electronAPI.getDebugFile() || 'No debug data');
              }} 
              className="btn-secondary"
            >
              {showDebug ? 'Hide Debug' : 'Debug Info'}
            </button>
          </div>
          {showDebug && (
            <pre className="mt-4 p-4 bg-black/50 rounded text-left text-xs text-green-400 overflow-auto max-h-64 whitespace-pre-wrap font-mono">
              {debugContent}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (torrentFiles.length > 0 && !player.isPlaying) {
    const videoFiles = torrentFiles
      .filter(f => VIDEO_EXTS.some(ext => f.path.toLowerCase().endsWith(ext)))
      .sort((a, b) => b.size - a.size);

    return (
      <div className="p-8 h-full flex flex-col max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold truncate pr-4">{torrent?.title}</h2>
          <button onClick={() => navigate('/search')} className="text-dark-textMuted hover:text-white transition-colors">
            Cancel
          </button>
        </div>
        
        <p className="text-dark-textMuted">This torrent contains multiple video files. Select the one you want to play:</p>
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {videoFiles.map((file) => (
            <button
              key={file.id}
              onClick={() => playFile(file, torrent)}
              className="w-full text-left p-4 card flex justify-between items-center hover:border-primary/50 group transition-all"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate group-hover:text-primary transition-colors">{file.path}</p>
                <p className="text-sm text-dark-textMuted mt-1">
                  {(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB
                </p>
              </div>
              <svg className="w-6 h-6 text-primary opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (player.isPlaying) {
    return (
      <div className="flex h-full gap-6 p-8 overflow-hidden">
        {/* Main Controls */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-8 min-w-0">
          <div className="text-center space-y-4 max-w-full">
            <div className="relative inline-block">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-12 h-12 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-dark-bg flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full"></div>
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white truncate">{player.currentTorrent?.title}</h2>
              {selectedFile && (
                <p className="text-dark-textMuted italic truncate">
                  Playing: {selectedFile.path.split('/').pop()}
                </p>
              )}
            </div>
          </div>

          <div className="card p-8 w-full max-w-2xl space-y-8 shadow-2xl">
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-primary">{formatTime(player.currentPosition)}</span>
                <span className="text-dark-textMuted">{formatTime(player.duration)}</span>
              </div>
              <div className="relative group">
                <input
                  type="range"
                  min={0}
                  max={player.duration || 100}
                  step={0.1}
                  value={player.currentPosition}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="w-full h-1.5 bg-dark-border rounded-full appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-center gap-8">
              <button 
                onClick={handlePause}
                className="w-16 h-16 rounded-full bg-white text-black hover:bg-primary hover:text-white transition-all flex items-center justify-center shadow-lg transform hover:scale-110 active:scale-95"
              >
                {player.isPlaying ? (
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>
              <button 
                onClick={handleStop}
                className="w-12 h-12 rounded-full bg-dark-border text-white hover:bg-red-500 transition-all flex items-center justify-center transform hover:scale-110 active:scale-95"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z"/>
                </svg>
              </button>
            </div>

            <p className="text-center text-sm text-dark-textMuted">
              Use the separate mpv window for full-screen and advanced controls.
            </p>
          </div>
        </div>

        {/* Sidebar for Subtitles */}
        {subtitleTracks.length > 0 && (
          <div className="w-64 flex flex-col">
            <SubtitleSelector 
              tracks={subtitleTracks} 
              selectedTrack={selectedSubtitle} 
              onSelect={handleSubtitleChange} 
            />
          </div>
        )}
      </div>
    );
  }

  return null;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + ':' + m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
  return m + ':' + s.toString().padStart(2, '0');
}
