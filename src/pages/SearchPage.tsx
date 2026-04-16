import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/appStore';
import SearchBar from '../components/SearchBar';
import SearchResult from '../components/SearchResult';
import type { NyaaResult } from '../types/nyaa';

export default function SearchPage() {
  const navigate = useNavigate();
  const searchQuery = useAppStore((s) => s.searchQuery);
  const searchResults = useAppStore((s) => s.searchResults);
  const isSearching = useAppStore((s) => s.isSearching);
  const setSearchResults = useAppStore((s) => s.setSearchResults);
  const setIsSearching = useAppStore((s) => s.setIsSearching);

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [selectedResolution, setSelectedResolution] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('1_0');
  const [selectedFilter, setSelectedFilter] = useState(0);
  const [useTsundereRaws, setUseTsundereRaws] = useState(false);
  const [sortBySeeders, setSortBySeeders] = useState(true);

  useEffect(() => {
    if (searchQuery) {
      performSearch(searchQuery);
    }
  }, [searchQuery, selectedResolution, selectedCategory, selectedFilter, useTsundereRaws]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const finalQuery = useTsundereRaws ? `${query} "-Tsundere-Raws (CR)"` : query;
      const results = await window.electronAPI.searchNyaa(finalQuery, {
        resolution: selectedResolution,
        category: selectedCategory,
        filter: selectedFilter,
      });
      setSearchResults(results);
    } catch (e) {
      console.error('La recherche a échoué :', e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  const handleSearch = (query: string) => {
    setSearchInput(query);
    setSearchQuery(query);
    if (query === searchQuery) {
      void performSearch(query);
    }
  };

  // Sort results
  const sortedResults = [...searchResults].sort((a: NyaaResult, b: NyaaResult) =>
    sortBySeeders ? b.seeders - a.seeders : a.title.localeCompare(b.title)
  );

  const playTorrent = async (torrent: NyaaResult) => {
    // Navigate to player with torrent info
    useAppStore.getState().setPlayerState({
      currentTorrent: torrent,
    });
    navigate('/player', { state: { torrent } });
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Recherche</h2>
      <SearchBar
        onSearch={handleSearch}
        value={searchInput}
        onValueChange={setSearchInput}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-dark-card border border-dark-border p-4 rounded-lg">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-dark-textMuted uppercase font-semibold">Résolution</label>
          <select
            value={selectedResolution}
            onChange={(e) => setSelectedResolution(e.target.value)}
            className="input-field text-sm py-1 px-3 min-w-[100px]"
          >
            <option value="">Toutes</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
            <option value="480">480p</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-dark-textMuted uppercase font-semibold">Catégorie</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="input-field text-sm py-1 px-3 min-w-[140px]"
          >
            <option value="1_0">Tous les anime</option>
            <option value="1_2">Anime - anglais</option>
            <option value="1_3">Anime - non anglais</option>
            <option value="1_4">Anime - raw</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-dark-textMuted uppercase font-semibold">Filtre</label>
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(Number(e.target.value))}
            className="input-field text-sm py-1 px-3 min-w-[120px]"
          >
            <option value={0}>Aucun filtre</option>
            <option value={1}>Sans remake</option>
            <option value={2}>Fiables uniquement</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-dark-textMuted uppercase font-semibold">Spécial</label>
          <button
            onClick={() => setUseTsundereRaws(!useTsundereRaws)}
            className={`text-sm py-1 px-4 rounded transition-colors ${
              useTsundereRaws
                ? 'bg-primary/20 text-primary border border-primary/50'
                : 'bg-dark-bg text-dark-textMuted border border-white/10 hover:border-white/20'
            }`}
          >
            Tsundere-Raws
          </button>
        </div>

        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-xs text-dark-textMuted uppercase font-semibold">Tri</label>
          <button
            onClick={() => setSortBySeeders(!sortBySeeders)}
            className="text-sm btn-secondary py-1 px-4 min-w-[100px]"
          >
            {sortBySeeders ? 'Seeders' : 'Titre'}
          </button>
        </div>
      </div>

      {/* Results */}
      {isSearching ? (
        <div className="text-center py-12 text-dark-textMuted">Recherche en cours…</div>
      ) : sortedResults.length > 0 ? (
        <div className="space-y-3">
          {sortedResults.map((result, i) => (
            <SearchResult
              key={result.infohash || i}
              result={result}
              onPlay={playTorrent}
            />
          ))}
        </div>
      ) : searchQuery ? (
        <div className="text-center py-12 text-dark-textMuted">Aucun résultat trouvé</div>
      ) : (
        <div className="text-center py-12 text-dark-textMuted">
          Recherchez des torrents d’anime sur nyaa.si
        </div>
      )}
    </div>
  );
}
