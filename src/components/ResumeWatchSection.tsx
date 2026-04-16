import useAppStore from '../store/appStore';
import type { WatchEntry } from '../types/storage';
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

interface ResumeWatchSectionProps {
  entries: WatchEntry[];
}

export default function ResumeWatchSection({ entries }: ResumeWatchSectionProps) {
  const navigate = useNavigate();
  const removeWatchEntryFromStore = useAppStore((state) => state.removeWatchEntry);

  const handleResume = (entry: WatchEntry) => {
    // Navigate to player with the torrent data
    navigate('/player', {
      state: {
        torrent: {
          title: entry.title,
          infohash: entry.infohash,
          magnetUri: entry.magnetUri,
        },
      },
    });
  };

  const handleRemove = async (infohash: string, e: MouseEvent) => {
    e.stopPropagation();
    removeWatchEntryFromStore(infohash);
    try {
      await window.electronAPI.removeWatchEntry(infohash);
    } catch (error) {
      console.error('Impossible de supprimer l’entrée de l’historique :', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Reprendre le visionnage</h3>
        <span className="text-sm text-dark-textMuted">{entries.length} titre{entries.length > 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {entries.map((entry) => {
          const progress =
            entry.duration > 0
              ? (entry.lastPosition / entry.duration) * 100
              : 0;

          return (
            <article
              key={entry.infohash}
              className="card text-left group relative"
            >
              <button
                type="button"
                onClick={(e) => handleRemove(entry.infohash, e)}
                className="absolute top-2 right-2 text-dark-textMuted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Supprimer ${entry.title} de l'historique`}
              >
                ×
              </button>

              <button
                type="button"
                onClick={() => handleResume(entry)}
                className="block w-full text-left"
              >
                <h4 className="truncate font-medium mb-2 pr-6">{entry.title}</h4>

                {entry.duration > 0 ? (
                  <div className="space-y-1">
                    <div className="w-full bg-dark-border rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-dark-textMuted">
                      {formatTime(entry.lastPosition)} / {formatTime(entry.duration)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-dark-textMuted">Pas encore commencé</p>
                )}

                <p className="text-xs text-dark-textMuted mt-2">
                  Dernier visionnage : {new Date(entry.lastWatched).toLocaleDateString('fr-FR')}
                </p>
              </button>
            </article>
          );
        })}
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
