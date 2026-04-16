export interface SelectedSubtitlePreference {
  id: string;
  language: string;
}

export interface WatchEntry {
  infohash: string;
  title: string;
  lastPosition: number;
  duration: number;
  lastWatched: string;
  magnetUri: string;
  selectedSubtitle?: SelectedSubtitlePreference;
}
