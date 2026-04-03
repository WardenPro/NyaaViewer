import { useNavigate } from 'react-router-dom';

interface TrendingSectionProps {
  results: Array<{
    title: string;
    size: string;
    seeders: number;
    leechers: number;
    date: string;
    infohash: string;
    magnetUri: string;
  }>;
}

export default function TrendingSection({ results }: TrendingSectionProps) {
  const navigate = useNavigate();

  const handleClick = (result: any) => {
    navigate('/search', { state: { initialResult: result } });
    // Also set search results in store
    const store = (window as any).electronAPI?.searchNyaa ? null : null;
    // Navigate with the result so PlayerPage can use it if user chooses to watch
    useAppStore.getState().setSearchResults([result]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Trending on Nyaa</h3>
        <span className="text-sm text-dark-textMuted">Most seeded right now</span>
      </div>

      <div className="grid gap-3">
        {results.slice(0, 10).map((result, i) => (
          <button
            key={result.infohash || i}
            onClick={() => handleClick(result)}
            className="card text-left flex items-center gap-4 hover:border-primary/50 transition-colors"
          >
            <span className="text-2xl text-dark-textMuted font-mono w-8 text-center">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{result.title}</p>
              <div className="flex gap-3 text-sm text-dark-textMuted mt-1">
                <span className="text-green-400">↑ {result.seeders}</span>
                <span>{result.size}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Import at top level to avoid hoisting issues
import useAppStore from '../store/appStore';
