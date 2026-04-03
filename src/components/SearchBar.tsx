import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string, filter?: string) => void;
  placeholder?: string;
}

export default function SearchBar({ onSearch, placeholder = 'Search anime on nyaa.si...' }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [resolution, setResolution] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), resolution);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-xl mx-auto">
      <div className="flex-1 relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="input-field w-full pr-12"
        />
        {resolution && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
            {resolution}p
          </span>
        )}
      </div>

      <select
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        className="input-field text-sm py-2"
      >
        <option value="">All</option>
        <option value="1080">1080p</option>
        <option value="720">720p</option>
        <option value="480">480p</option>
      </select>

      <button type="submit" className="btn-primary px-6">
        Search
      </button>
    </form>
  );
}
