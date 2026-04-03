import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/appStore';
import SearchBar from '../components/SearchBar';
import TrendingSection from '../components/TrendingSection';
import ResumeWatchSection from '../components/ResumeWatchSection';

export default function HomePage() {
  const navigate = useNavigate();
  const trendingResults = useAppStore((s) => s.trendingResults);
  const watchHistory = useAppStore((s) => s.watchHistory);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  useEffect(() => {
    // Load trending and watch history on mount
    loadTrending();
    loadHistory();
  }, []);

  const loadTrending = async () => {
    try {
      const results = await window.electronAPI.getTrending();
      useAppStore.getState().setTrendingResults(results as any);
    } catch (e) {
      console.error('Failed to load trending:', e);
    }
  };

  const loadHistory = async () => {
    try {
      const history = await window.electronAPI.getWatchHistory();
      useAppStore.getState().setWatchHistory(history as any);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  };

  const handleSearch = (query: string, _filter?: string) => {
    setSearchQuery(query);
    navigate('/search');
  };

  return (
    <div className="p-6 space-y-8">
      {/* Search hero */}
      <div className="text-center py-8">
        <h2 className="text-3xl font-bold mb-2">NyaaViewer</h2>
        <p className="text-dark-textMuted mb-6">Search anime torrents • Stream via AllDebrid • MKV subtitles</p>
        <SearchBar onSearch={handleSearch} />
      </div>

      {/* Resume watching */}
      {watchHistory.length > 0 && (
        <ResumeWatchSection entries={watchHistory} />
      )}

      {/* Trending */}
      {trendingResults.length > 0 && (
        <TrendingSection results={trendingResults} />
      )}

      {/* Empty state */}
      {!trendingResults.length && !watchHistory.length && (
        <div className="text-center py-12 text-dark-textMuted">
          <p className="text-lg">Search for anime to get started</p>
        </div>
      )}
    </div>
  );
}
