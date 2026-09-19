import type { Track } from '../model/types';
import { cleanTrackTitle, extractCanonicalArtist } from '../lib/track-cleaner';

export interface LyricLine {
  id: number;
  time: number; // in seconds
  text: string;
}

export interface LyricsResult {
  isSynced: boolean;
  lines: LyricLine[];
  plainText?: string;
  source: 'lrclib' | 'none';
}

interface LrclibResponse {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}

const lyricsCache = new Map<number, LyricsResult | null>();

/**
 * Parse LRC string into structured array of LyricLine
 */
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];

  const rawLines = lrcText.split(/\r?\n/);
  const parsedLines: LyricLine[] = [];
  let lineId = 0;

  // Regex to match one or more [mm:ss.xx] timestamps followed by line content
  const timestampRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check if line contains timestamp
    timestampRegex.lastIndex = 0;
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = timestampRegex.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const msFraction = match[3] ? parseFloat(`0.${match[3]}`) : 0;
      timestamps.push(minutes * 60 + seconds + msFraction);
    }

    if (timestamps.length === 0) {
      // Not a timestamped line (could be metadata tag like [by:...])
      continue;
    }

    // Extract text content after removing all timestamp tags
    const text = trimmed.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();

    for (const time of timestamps) {
      parsedLines.push({
        id: ++lineId,
        time,
        text,
      });
    }
  }

  // Sort chronologically
  parsedLines.sort((a, b) => a.time - b.time);
  return parsedLines;
}

/**
 * Fetch lyrics from LRCLIB with fallback search
 */
export async function fetchLyrics(track: Track): Promise<LyricsResult | null> {
  if (!track || !track.id) return null;

  if (lyricsCache.has(track.id)) {
    return lyricsCache.get(track.id) ?? null;
  }

  const durationSec = Math.round((track.duration_ms || 0) / 1000);
  const searchArtist = extractCanonicalArtist(track);
  const rawTitle = (track.title || '').trim();
  let searchTitle = cleanTrackTitle(rawTitle);

  // If clean title still contains "Artist - Title", extract just the song title
  if (searchTitle.includes(' - ')) {
    const parts = searchTitle.split(' - ');
    if (parts.length >= 2) {
      searchTitle = parts.slice(1).join(' - ').trim();
    }
  }

  const headers: HeadersInit = {
    'User-Agent': 'freakcloud/0.1.0 (https://github.com/freakcloud)',
  };

  // 1. Direct match attempt (first with duration, then without duration if failed)
  const tryDirectGet = async (withDuration: boolean): Promise<LyricsResult | null> => {
    try {
      const directUrl = new URL('https://lrclib.net/api/get');
      directUrl.searchParams.set('track_name', searchTitle || rawTitle);
      if (searchArtist) directUrl.searchParams.set('artist_name', searchArtist);
      if (withDuration && durationSec > 0) directUrl.searchParams.set('duration', durationSec.toString());

      const response = await fetch(directUrl.toString(), { headers });
      if (response.ok) {
        const data: LrclibResponse = await response.json();
        return processLrclibResponse(data);
      }
    } catch (err) {
      console.debug('LRCLIB direct lookup failed:', err);
    }
    return null;
  };

  const directWithDuration = await tryDirectGet(true);
  if (directWithDuration) {
    lyricsCache.set(track.id, directWithDuration);
    return directWithDuration;
  }

  const directWithoutDuration = await tryDirectGet(false);
  if (directWithoutDuration) {
    lyricsCache.set(track.id, directWithoutDuration);
    return directWithoutDuration;
  }

  // 2. Search fallback attempt
  try {
    const searchUrl = new URL('https://lrclib.net/api/search');
    const query = [searchArtist, searchTitle || rawTitle].filter(Boolean).join(' ');
    searchUrl.searchParams.set('q', query);

    const response = await fetch(searchUrl.toString(), { headers });
    if (response.ok) {
      const list: LrclibResponse[] = await response.json();
      if (Array.isArray(list) && list.length > 0) {
        // Prioritize item with syncedLyrics and closest duration
        let bestItem = list.find((item) => item.syncedLyrics);
        if (!bestItem) {
          bestItem = list[0];
        }

        const result = processLrclibResponse(bestItem);
        if (result) {
          lyricsCache.set(track.id, result);
          return result;
        }
      }
    }
  } catch (err) {
    console.debug('LRCLIB search fallback failed:', err);
  }

  // Cache negative result
  lyricsCache.set(track.id, null);
  return null;
}

function processLrclibResponse(data: LrclibResponse | null | undefined): LyricsResult | null {
  if (!data) return null;

  if (data.syncedLyrics && data.syncedLyrics.trim().length > 0) {
    const lines = parseLrc(data.syncedLyrics);
    if (lines.length > 0) {
      return {
        isSynced: true,
        lines,
        plainText: data.plainLyrics || undefined,
        source: 'lrclib',
      };
    }
  }

  if (data.plainLyrics && data.plainLyrics.trim().length > 0) {
    // Generate pseudo-lines for plain text
    const plainLines: LyricLine[] = data.plainLyrics
      .split(/\r?\n/)
      .map((line, idx) => ({
        id: idx + 1,
        time: -1,
        text: line.trim(),
      }))
      .filter((l) => l.text.length > 0);

    return {
      isSynced: false,
      lines: plainLines,
      plainText: data.plainLyrics,
      source: 'lrclib',
    };
  }

  return null;
}
