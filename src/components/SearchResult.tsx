import type { NyaaResult } from '../types/nyaa';

interface SearchResultProps {
  result: NyaaResult;
  onPlay: (result: NyaaResult) => void;
}

export default function SearchResult({ result, onPlay }: SearchResultProps) {
  const seedersColor =
    result.seeders > 50
      ? 'text-green-400'
      : result.seeders > 10
        ? 'text-yellow-400'
        : 'text-red-400';

  const getResolutionBadge = () => {
    if (result.resolution) return result.resolution + 'p';
    const title = result.title.toLowerCase();
    if (title.includes('2160') || title.includes('4k')) return '4K';
    if (title.includes('1080')) return '1080p';
    if (title.includes('720')) return '720p';
    if (title.includes('480')) return '480p';
    return null;
  };

  const resolution = getResolutionBadge();

  return (
    <div className="card flex gap-4 group">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {resolution && (
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-mono">
              {resolution}
            </span>
          )}
          <h3 className="font-medium truncate group-hover:text-primary transition-colors">
            {result.title}
          </h3>
        </div>
        <div className="flex gap-4 text-sm text-dark-textMuted">
          <span className={seedersColor}>
            ↑ {result.seeders}
          </span>
          <span className="text-red-400">
            ↓ {result.leechers}
          </span>
          <span>{result.size}</span>
          <span>{result.date}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPlay(result)}
          className="btn-primary text-sm py-1.5 px-4 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ▶ Lire
        </button>
      </div>
    </div>
  );
}
