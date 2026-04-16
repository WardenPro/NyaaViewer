import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SubtitleSelector from '../components/SubtitleSelector';
import useAppStore from '../store/appStore';
import type { NyaaResult } from '../types/nyaa';
import type {
  PlayerPositionUpdateData,
  SubtitleTrack,
  TorrentFile,
} from '../types/player';
import type { WatchEntry } from '../types/storage';

const VIDEO_EXTS = ['.mkv', '.mp4', '.webm', '.avi', '.mov', '.wmv'];

interface PlayerLocationState {
  torrent?: NyaaResult;
}

export default function PlayerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const player = useAppStore((state) => state.player);
  const allDebridApiKey = useAppStore((state) => state.allDebridApiKey);
  const preferredSubtitleLang = useAppStore((state) => state.preferredSubtitleLang);
  const setAllDebridApiKey = useAppStore((state) => state.setAllDebridApiKey);
  const setPlayerState = useAppStore((state) => state.setPlayerState);
  const resetPlayerState = useAppStore((state) => state.resetPlayerState);

  const routeState = location.state as PlayerLocationState | null;
  const torrent = routeState?.torrent || player.currentTorrent;

  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [torrentFiles, setTorrentFiles] = useState<TorrentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
  const [error, setError] = useState('');
  const [pollProgress, setPollProgress] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [debugContent, setDebugContent] = useState('');
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState('');

  const isFlowStarted = useRef(false);
  const preferredSubtitleLangRef = useRef(preferredSubtitleLang);
  const selectedSubtitleRef = useRef(selectedSubtitle);
  const subtitleAutoAppliedRef = useRef(false);

  useEffect(() => {
    preferredSubtitleLangRef.current = preferredSubtitleLang;
  }, [preferredSubtitleLang]);

  useEffect(() => {
    selectedSubtitleRef.current = selectedSubtitle;
  }, [selectedSubtitle]);

  const videoFiles = useMemo(
    () =>
      [...torrentFiles]
        .filter((file) => VIDEO_EXTS.some((ext) => file.path.toLowerCase().endsWith(ext)))
        .sort((left, right) => right.size - left.size),
    [torrentFiles],
  );

  const resetLocalState = useCallback(() => {
    setIsLoading(false);
    setStatusText('');
    setTorrentFiles([]);
    setSelectedFile(null);
    setError('');
    setPollProgress(0);
    setShowDebug(false);
    setDebugContent('');
    setSubtitleTracks([]);
    setSelectedSubtitle('');
    isFlowStarted.current = false;
    subtitleAutoAppliedRef.current = false;
    selectedSubtitleRef.current = '';
  }, []);

  const handleSubtitleChange = useCallback((trackId: string) => {
    subtitleAutoAppliedRef.current = true;
    selectedSubtitleRef.current = trackId;
    setSelectedSubtitle(trackId);
    void window.electronAPI.setSubtitleTrack(trackId === '' ? 'no' : trackId);
  }, []);

  const maybeApplyPreferredSubtitle = useCallback(
    (tracks: SubtitleTrack[]) => {
      if (subtitleAutoAppliedRef.current || selectedSubtitleRef.current || !tracks.length) {
        return;
      }

      const preferredLang = preferredSubtitleLangRef.current;
      const preferredTrack = tracks.find((track) => track.language === preferredLang);
      if (!preferredTrack) {
        return;
      }

      handleSubtitleChange(preferredTrack.id);
    },
    [handleSubtitleChange],
  );

  const handleStop = useCallback(
    async (navigateToSearch = true) => {
      await window.electronAPI.stopPlayback();
      resetPlayerState();
      resetLocalState();

      if (navigateToSearch) {
        navigate('/search');
      }
    },
    [navigate, resetLocalState, resetPlayerState],
  );

  useEffect(() => {
    void window.electronAPI.stopPlayback();
    resetPlayerState();
    resetLocalState();

    return () => {
      void window.electronAPI.stopPlayback();
      resetPlayerState();
    };
  }, [resetLocalState, resetPlayerState]);

  useEffect(() => {
    const unsubscribePosition = window.electronAPI.onPlayerPositionUpdate((data: PlayerPositionUpdateData) => {
      setPlayerState({
        currentPosition: data.position,
        duration: data.duration,
      });
    });

    const unsubscribeTracks = window.electronAPI.onPlayerTracksUpdate((tracks: SubtitleTrack[]) => {
      setSubtitleTracks(tracks);
      maybeApplyPreferredSubtitle(tracks);
    });

    const unsubscribeEnded = window.electronAPI.onPlayerEnded(() => {
      void handleStop();
    });

    const unsubscribeError = window.electronAPI.onPlayerError((playerError: string) => {
      setPlayerState({ status: 'idle' });
      setError(`Erreur de lecture : ${playerError}`);
      setIsLoading(false);
    });

    return () => {
      unsubscribePosition();
      unsubscribeTracks();
      unsubscribeEnded();
      unsubscribeError();
    };
  }, [handleStop, maybeApplyPreferredSubtitle, setPlayerState]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (player.status !== 'idle' && player.currentTorrent) {
        void window.electronAPI.updateWatchPosition(
          player.currentTorrent.infohash,
          player.currentPosition,
          player.duration,
        );
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [player.status, player.currentTorrent, player.currentPosition, player.duration]);

  const playFile = useCallback(
    async (file: TorrentFile, torrentData: NyaaResult) => {
      setSelectedFile(file);
      setIsLoading(true);
      setError('');
      subtitleAutoAppliedRef.current = false;
      setSubtitleTracks([]);
      setSelectedSubtitle('');

      const fileName = file.path.split('/').pop() || file.path;
      setStatusText(`Débridage de ${fileName}…`);

      try {
        if (!file.link) {
          throw new Error('Aucun lien n’est disponible pour ce fichier.');
        }

        const unlock = await window.electronAPI.unlockLink(file.link);
        if (!unlock.success || !unlock.link) {
          throw new Error(unlock.error || 'Impossible de débrider le lien.');
        }

        setStatusText('Démarrage du lecteur…');
        const playback = await window.electronAPI.startPlayback(unlock.link);
        if (!playback.success) {
          throw new Error(playback.error || 'Impossible de démarrer mpv.');
        }

        const watchEntry: WatchEntry = {
          infohash: torrentData.infohash,
          title: torrentData.title,
          magnetUri: torrentData.magnetUri,
          lastPosition: 0,
          duration: 0,
          lastWatched: new Date().toISOString(),
        };

        setPlayerState({
          status: 'playing',
          currentTorrent: torrentData,
          currentPosition: 0,
          duration: 0,
        });

        await window.electronAPI.addWatchEntry(watchEntry);
        setStatusText('');
        setIsLoading(false);
      } catch (playbackError) {
        const message = playbackError instanceof Error ? playbackError.message : 'Impossible de lancer la lecture.';
        setPlayerState({ status: 'idle' });
        setError(message);
        setIsLoading(false);
      }
    },
    [setPlayerState],
  );

  const startTorrentFlow = useCallback(
    async (torrentData: NyaaResult) => {
      if (!torrentData || isFlowStarted.current) {
        return;
      }

      isFlowStarted.current = true;
      subtitleAutoAppliedRef.current = false;
      setIsLoading(true);
      setError('');
      setStatusText('Vérification d’AllDebrid…');
      setPollProgress(0);
      setTorrentFiles([]);
      setSelectedFile(null);
      setSubtitleTracks([]);
      setSelectedSubtitle('');

      try {
        let apiKey = allDebridApiKey;
        if (!apiKey) {
          apiKey = (await window.electronAPI.getAllDebridKey()) || '';
          if (apiKey) {
            setAllDebridApiKey(apiKey);
          }
        }

        if (!apiKey) {
          throw new Error('Aucune clé API AllDebrid n’est configurée. Ouvrez les réglages pour en enregistrer une.');
        }

        setStatusText('Envoi du magnet à AllDebrid…');
        const uploadResult = await window.electronAPI.uploadMagnet(torrentData.magnetUri);
        if (uploadResult.error || !uploadResult.id) {
          throw new Error(uploadResult.error || 'Impossible d’envoyer le magnet à AllDebrid.');
        }

        const torrentId = uploadResult.id;

        if (!uploadResult.ready) {
          setStatusText('Téléchargement sur AllDebrid…');
          let ready = false;
          let attempts = 0;
          const maxAttempts = 240;

          while (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            const status = await window.electronAPI.getTorrentStatus(torrentId);

            if (status.error) {
              throw new Error(status.error);
            }

            if (status.ready) {
              ready = true;
              break;
            }

            attempts += 1;
            setPollProgress((attempts / maxAttempts) * 100);
            setStatusText(
              `Téléchargement sur AllDebrid : ${status.status || 'en cours'} (${Math.round((attempts / maxAttempts) * 100)}%)`,
            );
          }

          if (!ready) {
            throw new Error('Le téléchargement a expiré côté AllDebrid.');
          }
        }

        setStatusText('Récupération de la liste des fichiers…');
        const files = await window.electronAPI.getTorrentFiles(torrentId);
        setTorrentFiles(files);

        const playableFiles = files
          .filter((file) => VIDEO_EXTS.some((ext) => file.path.toLowerCase().endsWith(ext)))
          .sort((left, right) => right.size - left.size);

        if (!playableFiles.length) {
          throw new Error('Aucun fichier vidéo n’a été trouvé dans ce torrent.');
        }

        if (playableFiles.length === 1) {
          await playFile(playableFiles[0], torrentData);
          return;
        }

        isFlowStarted.current = false;
        setStatusText('');
        setPollProgress(0);
        setIsLoading(false);
      } catch (flowError) {
        const message = flowError instanceof Error ? flowError.message : 'Une erreur est survenue pendant la préparation du torrent.';
        isFlowStarted.current = false;
        setError(message);
        setIsLoading(false);
      }
    },
    [allDebridApiKey, playFile, setAllDebridApiKey],
  );

  useEffect(() => {
    if (torrent && !isLoading && player.status === 'idle' && !torrentFiles.length && !isFlowStarted.current) {
      void startTorrentFlow(torrent);
    }
  }, [torrent, isLoading, player.status, startTorrentFlow, torrentFiles.length]);

  const handlePause = async () => {
    await window.electronAPI.pausePlayback();
    setPlayerState({ status: player.status === 'playing' ? 'paused' : 'playing' });
  };

  const handleSeek = (position: number) => {
    void window.electronAPI.seekPlayback(position);
    setPlayerState({ currentPosition: position });
  };

  const handleRetry = async () => {
    setError('');

    if (selectedFile && torrent) {
      await playFile(selectedFile, torrent);
      return;
    }

    if (torrent) {
      await startTorrentFlow(torrent);
    }
  };

  const handleDebugToggle = async () => {
    const nextValue = !showDebug;
    setShowDebug(nextValue);

    if (nextValue && !debugContent) {
      setDebugContent((await window.electronAPI.getDebugFile()) || 'Aucune information de débogage disponible.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white">{torrent?.title || 'Chargement…'}</h2>
          <p className="text-dark-textMuted animate-pulse">{statusText}</p>
        </div>
        {pollProgress > 0 && (
          <div className="w-full max-w-md bg-dark-border h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full transition-all duration-500" style={{ width: `${pollProgress}%` }} />
          </div>
        )}
        <button onClick={() => void handleStop()} className="btn-secondary mt-4">
          Annuler
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
            <h2 className="text-2xl font-bold text-red-400">Erreur de lecture</h2>
            <p className="text-dark-textMuted break-words">{error}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => void handleRetry()} className="btn-primary">
              Réessayer
            </button>
            <button onClick={() => void handleStop()} className="btn-secondary">
              Retour à la recherche
            </button>
            <button onClick={() => void handleDebugToggle()} className="btn-secondary">
              {showDebug ? 'Masquer le debug' : 'Informations de debug'}
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

  if (videoFiles.length > 1 && !selectedFile && player.status === 'idle') {
    return (
      <div className="p-8 h-full flex flex-col max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold truncate pr-4">{torrent?.title}</h2>
          <button onClick={() => void handleStop()} className="text-dark-textMuted hover:text-white transition-colors">
            Annuler
          </button>
        </div>

        <p className="text-dark-textMuted">Ce torrent contient plusieurs fichiers vidéo. Choisissez celui que vous voulez lire :</p>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {videoFiles.map((file) => (
            <button
              key={file.id}
              onClick={() => torrent && void playFile(file, torrent)}
              className="w-full text-left p-4 card flex justify-between items-center hover:border-primary/50 group transition-all"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate group-hover:text-primary transition-colors">{file.path}</p>
                <p className="text-sm text-dark-textMuted mt-1">{formatFileSize(file.size)}</p>
              </div>
              <svg className="w-6 h-6 text-primary opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (torrent && player.status !== 'idle') {
    return (
      <div className="flex h-full gap-6 p-8 overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center space-y-8 min-w-0">
          <div className="text-center space-y-4 max-w-full">
            <div className="relative inline-block">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-12 h-12 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-dark-bg flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white truncate">{player.currentTorrent?.title}</h2>
              {selectedFile && (
                <p className="text-dark-textMuted italic truncate">
                  Lecture : {selectedFile.path.split('/').pop()}
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
                  onChange={(event) => handleSeek(Number(event.target.value))}
                  className="w-full h-1.5 bg-dark-border rounded-full appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => void handlePause()}
                className="w-16 h-16 rounded-full bg-white text-black hover:bg-primary hover:text-white transition-all flex items-center justify-center shadow-lg transform hover:scale-110 active:scale-95"
              >
                {player.status === 'playing' ? (
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => void handleStop()}
                className="w-12 h-12 rounded-full bg-dark-border text-white hover:bg-red-500 transition-all flex items-center justify-center transform hover:scale-110 active:scale-95"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
              </button>
            </div>

            <p className="text-center text-sm text-dark-textMuted">
              Utilisez la fenêtre mpv séparée pour le plein écran et les contrôles avancés.
            </p>
          </div>
        </div>

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

function formatFileSize(size: number): string {
  if (size <= 0) {
    return 'Taille inconnue';
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function formatTime(seconds: number): string {
  if (!seconds || Number.isNaN(seconds) || !Number.isFinite(seconds)) {
    return '0:00';
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  return `${m}:${s.toString().padStart(2, '0')}`;
}
