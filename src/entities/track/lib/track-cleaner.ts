import type { Track } from '../model/types';

// Patterns that identify re-uploaders, fan channels, or aggregator accounts
const AGGREGATOR_PATTERNS: RegExp[] = [
  /^user-\d+/i,
  /\b(reposts?|re-?post|archive|archives|archived|leaks?|unreleased)\b/i,
  /\b(slowed|slowed\s*\+?\s*reverb|sped\s*up|speed\s*up|nightcore|daycore)\b/i,
  /\b(bassboost(ed)?|8d\s*audio|remixes?|bootlegs?)\b/i,
  /\b(type\s*beats?|free\s*beats?|prod\s*by|beats?)\b/i,
  /\b(t\.me|vk\.com|telegram|soundcloud)\b/i,
  /\b(mp3|flac|wav|audiophile|discography|fan\s*club)\b/i,
];

// Stopwords that are never real musical artists
const ARTIST_STOPWORDS = new Set([
  'unknown',
  'various artists',
  'various',
  'soundcloud',
  'user',
  'admin',
  'track',
  'tracks',
  'audio',
  'music',
  'records',
  'recordings',
  'official',
]);

// Spam promo phrases commonly found in SoundCloud titles
const PROMO_JUNK_PATTERNS: RegExp[] = [
  // Russian promo & status phrases
  /\[.*?(на всех площадках|в закрепе|ссылка|в профиле|премьера|сниппет|слив).*?\]/gi,
  /\(.*?(на всех площадках|в закрепе|ссылка|в профиле|премьера|сниппет|слив).*?\)/gi,
  /\b(на всех площадках|в закрепе|ссылка в профиле|ссылка в закрепе)\b/gi,

  // English promo & status phrases
  /\[.*?(link in bio|pinned|out now|listen now|stream now|available now).*?\]/gi,
  /\(.*?(link in bio|pinned|out now|listen now|stream now|available now).*?\)/gi,

  // Leak, snippet, unreleased tags
  /\[.*?(leak|snippet|unreleased|exclusive|demo|raw|wip).*?\]/gi,
  /\(.*?(leak|snippet|unreleased|exclusive|demo|raw|wip).*?\)/gi,

  // Speed and audio modifiers
  /\[.*?(slowed|reverb|sped\s*up|speed\s*up|nightcore|daycore|bass\s*boost(ed)?|8d\s*audio).*?\]/gi,
  /\(.*?(slowed|reverb|sped\s*up|speed\s*up|nightcore|daycore|bass\s*boost(ed)?|8d\s*audio).*?\)/gi,

  // Production and credits in brackets
  /\[.*?(prod\.?|produced by|beat by|instrumental|acapella).*?\]/gi,
  /\(.*?(prod\.?|produced by|beat by|instrumental|acapella).*?\)/gi,

  // Video and audio format tags
  /\[.*?(official\s*(music\s*)?video|official\s*audio|visualizer|lyric\s*video|lyrics|hd|hq|4k|320k(bps)?).*?\]/gi,
  /\(.*?(official\s*(music\s*)?video|official\s*audio|visualizer|lyric\s*video|lyrics|hd|hq|4k|320k(bps)?).*?\)/gi,

  // Social handles & URLs
  /@[\w_.-]+/g,
  /(https?:\/\/)?(t\.me|vk\.com|instagram\.com|linktr\.ee)\/\S+/gi,
];

/**
 * Clean track title by stripping promo phrases, brackets, and sound modifiers
 */
export function cleanTrackTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';

  let cleaned = rawTitle;

  // Strip all promo and junk patterns
  for (const pattern of PROMO_JUNK_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Strip empty bracket artifacts like "[]", "()", "{}"
  cleaned = cleaned.replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, ' ');

  // Strip surrounding quotes and double spaces
  cleaned = cleaned
    .replace(/["'«»“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing or leading dashes / slashes
  cleaned = cleaned.replace(/^[-\u2013\u2014/\\:\s]+|[-\u2013\u2014/\\:\s]+$/g, '').trim();

  return cleaned || rawTitle.trim();
}

/**
 * Determines whether an artist string looks like a spam/re-upload/aggregator channel
 */
export function isAggregatorOrSpamArtist(artistName: string): boolean {
  if (!artistName) return true;
  const lower = artistName.trim().toLowerCase();

  if (lower.length <= 1 || ARTIST_STOPWORDS.has(lower)) {
    return true;
  }

  return AGGREGATOR_PATTERNS.some((pattern) => pattern.test(lower));
}

/**
 * Extracts the true canonical artist and clean title from track metadata.
 * Many SoundCloud re-uploads have format: "Real Artist - Song Title [на всех площадках]"
 * with artist set to a random bot account.
 */
export function extractCanonicalArtist(track: Track): string {
  if (!track) return 'Unknown Artist';

  const rawArtist = (track.artist || '').trim();
  const rawTitle = (track.title || '').trim();

  // Check if title contains "Artist - Title" pattern
  const separatorMatch = rawTitle.match(/\s+[-\u2013\u2014]\s+/);

  if (separatorMatch && separatorMatch.index !== undefined) {
    const candidateArtist = rawTitle.slice(0, separatorMatch.index).trim();
    const candidateTitle = rawTitle.slice(separatorMatch.index + separatorMatch[0].length).trim();

    // Check if candidateArtist is valid (not a track number like "01", not too long, not an URL)
    const isCleanCandidate =
      candidateArtist.length >= 2 &&
      candidateArtist.length <= 40 &&
      !candidateArtist.startsWith('http') &&
      !/^\d+[\s.-]*$/.test(candidateArtist) &&
      !isAggregatorOrSpamArtist(candidateArtist);

    if (isCleanCandidate) {
      // If raw artist is a bot/re-uploader OR matches candidate case-insensitively, prefer candidate
      if (isAggregatorOrSpamArtist(rawArtist) || rawArtist.toLowerCase() === candidateArtist.toLowerCase()) {
        return candidateArtist;
      }

      // If raw artist is empty or "SoundCloud", prefer candidate
      if (!rawArtist || rawArtist.toLowerCase() === 'soundcloud') {
        return candidateArtist;
      }

      // If rawTitle actually starts with the candidate and candidateTitle is substantial
      if (candidateTitle.length >= 2 && !rawArtist.toLowerCase().includes(candidateArtist.toLowerCase())) {
        // High confidence that track title contains the real artist before the hyphen
        return candidateArtist;
      }
    }
  }

  // Fallback to raw artist if not a bot
  if (rawArtist && !isAggregatorOrSpamArtist(rawArtist)) {
    return rawArtist;
  }

  // If raw artist was a bot and no title split, clean the artist string
  return rawArtist || 'Unknown Artist';
}

/**
 * Builds a sanitized search query for recommendations without noise tags
 */
export function cleanSearchQuery(query: string): string {
  if (!query) return '';
  const cleaned = cleanTrackTitle(query);
  return cleaned
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
