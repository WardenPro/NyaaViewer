export interface ScheduleEntry {
  title: string;
  episodeLabel: string;
  episodeNumber?: number;
  sourceUrl: string;
}

export interface ScheduleDay {
  date: string;
  label: string;
  entries: ScheduleEntry[];
}
