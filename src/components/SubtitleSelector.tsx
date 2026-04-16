interface SubtitleTrack {
  id: string;
  language: string;
  codec: string;
}

interface SubtitleSelectorProps {
  tracks: SubtitleTrack[];
  selectedTrack: string;
  onSelect: (trackId: string) => void;
}

const languageNames: Record<string, string> = {
  en: 'Anglais',
  fr: 'Français',
  es: 'Espagnol',
  ja: 'Japonais',
  de: 'Allemand',
  pt: 'Portugais',
  it: 'Italien',
  zh: 'Chinois',
  ko: 'Coréen',
  ru: 'Russe',
  ar: 'Arabe',
};

export default function SubtitleSelector({
  tracks,
  selectedTrack,
  onSelect,
}: SubtitleSelectorProps) {
  return (
    <div className="card space-y-3">
      <h4 className="text-sm font-semibold">Sous-titres</h4>

      {/* Off option */}
      <button
        onClick={() => onSelect('')}
        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
          selectedTrack === ''
            ? 'bg-primary/20 text-primary'
            : 'text-dark-textMuted hover:text-white'
        }`}
      >
        Désactivés
      </button>

      {/* Track list */}
      {tracks.map((track) => (
        <button
          key={track.id}
          onClick={() => onSelect(track.id)}
          className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
            selectedTrack === track.id
              ? 'bg-primary/20 text-primary'
              : 'text-dark-textMuted hover:text-white'
          }`}
        >
          <div className="flex justify-between items-center">
            <span>
              {languageNames[track.language] || track.language}
            </span>
            <span className="text-xs text-dark-textMuted">{track.codec}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
