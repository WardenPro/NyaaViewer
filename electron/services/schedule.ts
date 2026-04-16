import { load } from 'cheerio';
import type { ScheduleDay, ScheduleEntry } from '../../src/types/schedule';

const ICOTAKU_BASE = 'https://anime.icotaku.com';
const CURRENT_MONTH_URL = `${ICOTAKU_BASE}/calendrier_diffusion.html`;
const WEEK_SPAN_DAYS = 7;
const REQUEST_HEADERS = {
  'User-Agent': 'NyaaViewer/1.3.7 (https://github.com/nyaaviewer)',
};

interface ParsedScheduleEntry extends ScheduleEntry {
  date: string;
}

export async function getWeeklySchedule(referenceDate = new Date()): Promise<ScheduleDay[]> {
  const startDate = startOfDay(referenceDate);
  const endDate = addDays(startDate, WEEK_SPAN_DAYS - 1);
  const monthStarts = getMonthStartsInRange(startDate, endDate);

  const monthEntries = await Promise.all(
    monthStarts.map((monthStart) => fetchMonthSchedule(monthStart))
  );

  const entries = dedupeEntries(monthEntries.flat())
    .filter((entry) => isDateWithinRange(entry.date, startDate, endDate))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.title !== b.title) return a.title.localeCompare(b.title);
      return a.episodeLabel.localeCompare(b.episodeLabel);
    });

  const groupedEntries = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const existing = groupedEntries.get(entry.date) || [];
    existing.push({
      title: entry.title,
      episodeLabel: entry.episodeLabel,
      episodeNumber: entry.episodeNumber,
      sourceUrl: entry.sourceUrl,
    });
    groupedEntries.set(entry.date, existing);
  }

  return Array.from(groupedEntries.entries()).map(([date, dayEntries]) => ({
    date,
    label: formatScheduleDayLabel(date, startDate),
    entries: dayEntries,
  }));
}

async function fetchMonthSchedule(monthStart: Date): Promise<ParsedScheduleEntry[]> {
  const url = getMonthScheduleUrl(monthStart);
  let response: Response;

  try {
    response = await fetch(url, { headers: REQUEST_HEADERS });
  } catch (error) {
    console.error('Icotaku schedule fetch failed:', error);
    throw new Error('Impossible de contacter Icotaku pour charger le planning.');
  }

  if (!response.ok) {
    throw new Error(`Impossible de charger le planning Icotaku (${response.status}).`);
  }

  const html = await response.text();
  return parseMonthSchedule(html, monthStart);
}

function parseMonthSchedule(html: string, monthStart: Date): ParsedScheduleEntry[] {
  const $ = load(html);
  const tables = $('table.calendrier_diffusion').toArray();

  if (!tables.length) {
    throw new Error('Le format du planning Icotaku semble avoir changé.');
  }

  const entries: ParsedScheduleEntry[] = [];

  for (const table of tables) {
    const tableElement = $(table);
    const headerText = normalizeWhitespace(tableElement.find('th').first().text());
    const dayMatch = headerText.match(/\b(\d{1,2})\b/);

    if (!dayMatch) {
      continue;
    }

    const dayNumber = Number(dayMatch[1]);
    if (Number.isNaN(dayNumber)) {
      continue;
    }

    const entryDate = toIsoDate(
      new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNumber)
    );

    tableElement
      .find('tr')
      .slice(1)
      .each((_index, row) => {
        const rowElement = $(row);
        const link = rowElement.find('a[href^="/anime/"]').first();
        const href = link.attr('href');
        const title = normalizeWhitespace(link.text());
        const episodeLabel = normalizeWhitespace(
          rowElement.find('.calendrier_episode').first().text()
        );

        if (!href || !title || !episodeLabel) {
          return;
        }

        entries.push({
          date: entryDate,
          title,
          episodeLabel,
          episodeNumber: extractEpisodeNumber(episodeLabel),
          sourceUrl: new URL(href, ICOTAKU_BASE).toString(),
        });
      });
  }

  return entries;
}

function getMonthScheduleUrl(monthStart: Date): string {
  const now = new Date();
  if (isSameMonth(monthStart, now)) {
    return CURRENT_MONTH_URL;
  }

  return `${ICOTAKU_BASE}/planning/calendrierDiffusion/date_debut/${toIsoDate(monthStart)}`;
}

function getMonthStartsInRange(startDate: Date, endDate: Date): Date[] {
  const monthStarts: Date[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= lastMonth) {
    monthStarts.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }

  return monthStarts;
}

function dedupeEntries(entries: ParsedScheduleEntry[]): ParsedScheduleEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.date}|${entry.title}|${entry.episodeLabel}|${entry.sourceUrl}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isDateWithinRange(isoDate: string, startDate: Date, endDate: Date): boolean {
  const date = fromIsoDate(isoDate);
  return date >= startDate && date <= endDate;
}

function extractEpisodeNumber(episodeLabel: string): number | undefined {
  const match = episodeLabel.match(/(\d{1,4})/);
  if (!match) {
    return undefined;
  }

  const episodeNumber = Number(match[1]);
  return Number.isNaN(episodeNumber) ? undefined : episodeNumber;
}

function formatScheduleDayLabel(isoDate: string, startDate: Date): string {
  const date = fromIsoDate(isoDate);
  const diffDays = Math.round((date.getTime() - startDate.getTime()) / 86400000);

  if (diffDays === 0) {
    return 'Aujourd’hui';
  }

  if (diffDays === 1) {
    return 'Demain';
  }

  const label = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);

  return capitalizeFirstLetter(label);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function capitalizeFirstLetter(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isSameMonth(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function toIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function fromIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}
