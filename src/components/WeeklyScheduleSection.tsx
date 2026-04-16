import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/appStore';
import type { ScheduleDay, ScheduleEntry } from '../types/schedule';

export default function WeeklyScheduleSection() {
  const navigate = useNavigate();
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSchedule = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const schedule = await window.electronAPI.getWeeklySchedule();
      setDays(schedule);
    } catch (err) {
      console.error('Failed to load weekly schedule:', err);
      setDays([]);
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger les sorties de la semaine.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const totalEntries = useMemo(
    () => days.reduce((count, day) => count + day.entries.length, 0),
    [days]
  );

  const handleFindEpisode = (entry: ScheduleEntry) => {
    setSearchQuery(buildNyaaQuery(entry));
    navigate('/search');
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">Sorties des 7 prochains jours</h3>
          <p className="text-sm text-dark-textMuted">
            Planning Icotaku + recherche rapide sur Nyaa
          </p>
        </div>

        {!isLoading && !error && days.length > 0 && (
          <span className="text-sm text-dark-textMuted">
            {totalEntries} épisode{totalEntries > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="card hover:bg-dark-card">
          <p className="text-sm text-dark-textMuted">Chargement du planning…</p>
        </div>
      ) : error ? (
        <div className="card hover:bg-dark-card space-y-3">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={loadSchedule} className="btn-secondary text-sm py-1.5 px-4">
            Réessayer
          </button>
        </div>
      ) : days.length === 0 ? (
        <div className="card hover:bg-dark-card">
          <p className="text-sm text-dark-textMuted">
            Aucune sortie trouvée pour les 7 prochains jours.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.date} className="card hover:bg-dark-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold">{day.label}</h4>
                <span className="text-xs uppercase tracking-wide text-dark-textMuted">
                  {day.entries.length} sortie{day.entries.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-3">
                {day.entries.map((entry) => (
                  <div
                    key={`${day.date}-${entry.sourceUrl}-${entry.episodeLabel}`}
                    className="flex flex-col gap-3 rounded-lg border border-dark-border bg-dark-bg/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate font-medium">{entry.title}</p>
                      <p className="text-sm text-dark-textMuted">{entry.episodeLabel}</p>
                    </div>

                    <button
                      onClick={() => handleFindEpisode(entry)}
                      className="btn-primary shrink-0 text-sm py-1.5 px-4"
                    >
                      Trouver sur Nyaa
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function buildNyaaQuery(entry: ScheduleEntry): string {
  if (typeof entry.episodeNumber === 'number' && Number.isFinite(entry.episodeNumber)) {
    return `${entry.title} ${String(entry.episodeNumber).padStart(2, '0')}`;
  }

  return entry.title;
}
