export interface NyaaSearchOptions {
  category?: string;
  filter?: number;
  sort?: string;
  order?: string;
  resolution?: string;
}

export interface NyaaResult {
  title: string;
  size: string;
  seeders: number;
  leechers: number;
  date: string;
  infohash: string;
  magnetUri: string;
  resolution?: string;
  categoryId?: string;
}
