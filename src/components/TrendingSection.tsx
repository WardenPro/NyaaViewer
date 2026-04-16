import useAppStore from '../store/appStore';
import type { NyaaResult } from '../types/nyaa';
import { useNavigate } from 'react-router-dom';

interface TrendingSectionProps {
  results: NyaaResult[];
}

export default function TrendingSection({ results }: TrendingSectionProps) {
  const navigate = useNavigate();
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const setSearchResults = useAppStore((state) => state.setSearchResults);

  const handleClick = (result: NyaaResult) => {
    setSearchQuery(result.title);
    setSearchResults([result]);
    navigate('/search');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Tendances sur Nyaa</h3>
        <span className="text-sm text-dark-textMuted">Les torrents les plus seedés du moment</span>
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
