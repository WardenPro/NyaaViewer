import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/appStore';
import SearchBar from '../components/SearchBar';
import SearchResult from '../components/SearchResult';

export default function SearchPage() {
  const navigate = useNavigate();
  const searchQuery = useAppStore((s) => s.searchQuery);
  const searchResults = useAppStore((s) => s.searchResults);
  const isSearching = useAppStore((s) => s.isSearching);
  const setSearchResults = useAppStore((s) => s.setSearchResults);
  const setIsSearching = useAppStore((s) => s.setIsSearching);

  const [selectedResolution, setSelectedResolution] = useState('');
  const [sortBySeeders, setSortBySeeders] = useState(true);

  useEffect(() => {
    if (searchQuery) {
      performSearch(searchQuery);
    }
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const results = await window.electronAPI.searchNyaa(query, selectedResolution);
      setSearchResults(results as any);
    } catch (e) {
      console.error('Search failed:', e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (query: string, filter?: string) => {
    setSelectedResolution(filter || '');
    performSearch(query);
  };

  // Sort results
  const sortedResults = [...searchResults].sort((a: any, b: any) =>
    sortBySeeders ? b.seeders - a.seeders : a.title.localeCompare(b.title)
  );

  const playTorrent = async (torrent: any) => {
    // Navigate to player with torrent info
    useAppStore.getState().setPlayerState({
      currentTorrent: torrent,
    });
    navigate('/player', { state: { torrent } });
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Search</h2>
      <SearchBar onSearch={handleSearch} />

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <label className="text-sm text-dark-textMuted">Resolution:</label>
        <select
          value={selectedResolution}
          onChange={(e) => {
            setSelectedResolution(e.target.value);
            if (searchQuery) performSearch(searchQuery);
          }}
          className="input-field text-sm py-1 px-3"
        >
          <option value="">All</option>
          <option value="1080">1080p</option>
          <option value="720">720p</option>
          <option value="480">480p</option>
        </select>

        <label className="text-sm text-dark-textMuted ml-4">Sort:</label>
        <button
          onClick={() => setSortBySeeders(!sortBySeeders)}
          className="text-sm btn-secondary py-1 px-3"
        >
          {sortBySeeders ? 'Seeders' : 'Title'}
        </button>
      </div>

      {/* Results */}
      {isSearching ? (
        <div className="text-center py-12 text-dark-textMuted">Searching...</div>
      ) : sortedResults.length > 0 ? (
        <div className="space-y-3">
          {sortedResults.map((result: any, i: number) => (
            <SearchResult
              key={result.infohash || i}
              result={result}
              onPlay={playTorrent}
            />
          ))}
        </div>
      ) : searchQuery ? (
        <div className="text-center py-12 text-dark-textMuted">No results found</div>
      ) : (
        <div className="text-center py-12 text-dark-textMuted">
          Search for anime torrents on nyaa.si
        </div>
      )}
    </div>
  );
}
