import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/appStore';
import SearchBar from '../components/SearchBar';
import TrendingSection from '../components/TrendingSection';
import ResumeWatchSection from '../components/ResumeWatchSection';
import WeeklyScheduleSection from '../components/WeeklyScheduleSection';

export default function HomePage() {
  const navigate = useNavigate();
  const trendingResults = useAppStore((s) => s.trendingResults);
  const watchHistory = useAppStore((s) => s.watchHistory);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setTrendingResults = useAppStore((s) => s.setTrendingResults);
  const setWatchHistory = useAppStore((s) => s.setWatchHistory);

  useEffect(() => {
    // Load trending and watch history on mount
    void loadTrending();
    void loadHistory();
  }, []);

  const loadTrending = async () => {
    try {
      const results = await window.electronAPI.getTrending();
      setTrendingResults(results);
    } catch (e) {
      console.error('Impossible de charger les tendances :', e);
    }
  };

  const loadHistory = async () => {
    try {
      const history = await window.electronAPI.getWatchHistory();
      setWatchHistory(history);
    } catch (e) {
      console.error('Impossible de charger l’historique :', e);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    navigate('/search');
  };

  return (
    <div className="p-6 space-y-8">
      {/* Search hero */}
      <div className="text-center py-8">
        <h2 className="text-3xl font-bold mb-2">NyaaViewer</h2>
        <p className="text-dark-textMuted mb-6">Recherche d’anime sur Nyaa • Streaming via AllDebrid • Sous-titres MKV</p>
        <SearchBar onSearch={handleSearch} />
      </div>

      {/* Resume watching */}
      {watchHistory.length > 0 && (
        <ResumeWatchSection entries={watchHistory} />
      )}

      <WeeklyScheduleSection />

      {/* Trending */}
      {trendingResults.length > 0 && (
        <TrendingSection results={trendingResults} />
      )}
    </div>
  );
}
