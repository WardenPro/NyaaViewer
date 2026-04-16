import { useState, type FormEvent, type KeyboardEvent } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  value?: string;
  onValueChange?: (query: string) => void;
}

export default function SearchBar({
  onSearch,
  placeholder = 'Rechercher un anime sur nyaa.si...',
  value,
  onValueChange,
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(value ?? '');
  const query = value ?? internalQuery;

  const updateQuery = (nextQuery: string) => {
    if (value === undefined) {
      setInternalQuery(nextQuery);
    }
    onValueChange?.(nextQuery);
  };

  const submitSearch = () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      onSearch(trimmedQuery);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitSearch();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitSearch();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-xl mx-auto">
      <div className="flex-1 relative">
        <input
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="input-field w-full pr-4"
        />
      </div>

      <button type="submit" className="btn-primary px-6">
        Rechercher
      </button>
    </form>
  );
}
