import { XMLParser } from 'fast-xml-parser';
import type { NyaaResult, NyaaSearchOptions } from '../../src/types/nyaa';

const NYAA_BASE = 'https://nyaa.si';
const NYAA_RSS = `${NYAA_BASE}/?page=rss`;

export async function searchNyaa(query: string, options: NyaaSearchOptions = {}): Promise<NyaaResult[]> {
  const params = new URLSearchParams({
    page: 'rss',
    q: query + (options.resolution ? ` ${options.resolution}p` : ''),
  });

  if (options.category) params.append('c', options.category);
  if (options.filter !== undefined) params.append('f', String(options.filter));
  if (options.sort) params.append('s', options.sort);
  if (options.order) params.append('o', options.order);

  const url = `${NYAA_BASE}/?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NyaaViewer/0.1.0 (https://github.com/nyaaviewer)',
      },
    });

    if (!response.ok) {
      console.error(`Nyaa search HTTP ${response.status}: ${response.statusText}`);
      return [];
    }

    const xml = await response.text();
    return parseNyaaRSS(xml);
  } catch (e) {
    console.error('Nyaa search failed:', e);
    return [];
  }
}

export async function getTrending(): Promise<NyaaResult[]> {
  try {
    const response = await fetch(NYAA_RSS, {
      headers: {
        'User-Agent': 'NyaaViewer/0.1.0 (https://github.com/nyaaviewer)',
      },
    });

    if (!response.ok) {
      console.error(`Nyaa trending HTTP ${response.status}: ${response.statusText}`);
      return [];
    }

    const xml = await response.text();
    const results = parseNyaaRSS(xml);

    // Sort by seeders descending
    return results.sort((a, b) => b.seeders - a.seeders);
  } catch (e) {
    console.error('Nyaa trending failed:', e);
    return [];
  }
}

interface RSSItem {
  title: string;
  link: string;
  guid?: string | { _text?: string };
  category?: string | string[];
  nyaa_infoHash?: string;
  nyaa_seeders?: string | number;
  nyaa_leechers?: string | number;
  nyaa_size?: string;
  torrent?: {
    link?: string;
  };
  'nyaa:infoHash'?: string;
  'nyaa:seeders'?: string | number;
  'nyaa:leechers'?: string | number;
  'nyaa:size'?: string;
  'nyaa:categoryId'?: string;
  pubDate?: string;
  description?: string;
  guid_text?: string;
}

interface RSSChannel {
  title: string;
  item: RSSItem | RSSItem[];
}

interface RSSFeed {
  rss: {
    channel: RSSChannel;
  };
}

function parseNyaaRSS(xml: string): NyaaResult[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
  });

  try {
    const parsed: RSSFeed = parser.parse(xml);

    if (!parsed?.rss?.channel?.item) {
      return [];
    }

    const items = Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : [parsed.rss.channel.item];

    return items.map((item: RSSItem) => {
      // Extract info hash - try different XML parser output formats
      const infohash =
        item['nyaa:infoHash'] ||
        item.nyaa_infoHash ||
        (typeof item.guid === 'string' ? item.guid : item.guid?._text) ||
        item.guid_text ||
        '';

      // Extract seeders/leechers
      const seeders = parseInt(
        String(item['nyaa:seeders'] || item.nyaa_seeders || '0'),
        10
      );
      const leechers = parseInt(
        String(item['nyaa:leechers'] || item.nyaa_leechers || '0'),
        10
      );
      const size = item['nyaa:size'] || item.nyaa_size || 'Unknown';

      // Build magnet URI from infohash
      const magnetUri = `magnet:?xt=urn:btih:${infohash}&dn=${encodeURIComponent(item.title || '')}`;

      // Detect resolution from title
      const title = item.title || '';
      let resolution: string | undefined;
      if (title.includes('2160') || title.toLowerCase().includes('4k')) resolution = '2160';
      else if (title.includes('1080')) resolution = '1080';
      else if (title.includes('720')) resolution = '720';
      else if (title.includes('480')) resolution = '480';

      return {
        title,
        size,
        seeders,
        leechers,
        date: item.pubDate || item.description || '',
        infohash,
        magnetUri,
        resolution,
        categoryId: item['nyaa:categoryId'] || (item.category ? String(item.category) : undefined),
      };
    }).filter((torrent: NyaaResult) => torrent.infohash && torrent.infohash.length === 40);
  } catch (e) {
    console.error('Failed to parse Nyaa RSS:', e);
    return [];
  }
}
