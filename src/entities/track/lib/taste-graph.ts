import type { Track } from '../model/types';

export interface TasteNode {
  weight: number;
  listenCount: number;
  skipCount: number;
  likeCount: number;
  lastInteractedAt: number;
}

export interface TasteGraphData {
  version: number;
  artists: Record<string, TasteNode>;
  genres: Record<string, TasteNode>;
  recentPlayedIds: number[];
}

const STORAGE_KEY = 'freackcloud_taste_graph';
const CURRENT_VERSION = 1;
const MAX_RECENT_TRACKS = 200;
const MAX_ARTIST_NODES = 120;
const MAX_GENRE_NODES = 60;

// Half-life for taste node decay: 14 days in ms
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_MS;

const MICRO_GENRE_KEYWORDS = [
  'phonk',
  'drift',
  'wave',
  'synthwave',
  'retrowave',
  'ambient',
  'lofi',
  'chill',
  'downtempo',
  'dnb',
  'drum and bass',
  'breakcore',
  'breakbeat',
  'witch house',
  'techno',
  'deep house',
  'house',
  'hyperpop',
  'trap',
  'rap',
  'hip hop',
  'experimental',
  'electro',
  'future bass',
  'cyberpunk',
  'indie',
  'rock',
  'metal',
  'garage',
  'uk garage',
];

function createDefaultGraph(): TasteGraphData {
  return {
    version: CURRENT_VERSION,
    artists: {},
    genres: {},
    recentPlayedIds: [],
  };
}

export function loadTasteGraph(): TasteGraphData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultGraph();
    const parsed = JSON.parse(raw) as TasteGraphData;
    if (parsed.version !== CURRENT_VERSION || !parsed.artists || !parsed.genres) {
      return createDefaultGraph();
    }
    return parsed;
  } catch (err) {
    console.error('[TasteGraph] Failed to load taste graph, resetting:', err);
    return createDefaultGraph();
  }
}

function saveTasteGraph(graph: TasteGraphData): void {
  try {
    // Prune excessive nodes to preserve memory & storage
    pruneGraph(graph);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
  } catch (err) {
    console.warn('[TasteGraph] Failed to save taste graph:', err);
  }
}

function pruneGraph(graph: TasteGraphData): void {
  // Prune recent tracks
  if (graph.recentPlayedIds.length > MAX_RECENT_TRACKS) {
    graph.recentPlayedIds = graph.recentPlayedIds.slice(-MAX_RECENT_TRACKS);
  }

  // Prune artists keeping top nodes
  const artistEntries = Object.entries(graph.artists);
  if (artistEntries.length > MAX_ARTIST_NODES) {
    artistEntries.sort((a, b) => getEffectiveWeight(b[1]) - getEffectiveWeight(a[1]));
    graph.artists = Object.fromEntries(artistEntries.slice(0, MAX_ARTIST_NODES));
  }

  // Prune genres keeping top nodes
  const genreEntries = Object.entries(graph.genres);
  if (genreEntries.length > MAX_GENRE_NODES) {
    genreEntries.sort((a, b) => getEffectiveWeight(b[1]) - getEffectiveWeight(a[1]));
    graph.genres = Object.fromEntries(genreEntries.slice(0, MAX_GENRE_NODES));
  }
}

/**
 * Calculates current effective weight using exponential recency decay
 */
export function getEffectiveWeight(node: TasteNode): number {
  const ageMs = Math.max(0, Date.now() - node.lastInteractedAt);
  const decayFactor = Math.exp(-DECAY_LAMBDA * ageMs);
  return node.weight * decayFactor;
}

export function extractGenresFromTrack(track: Track): string[] {
  const found = new Set<string>();
  if (track.genre && track.genre.trim()) {
    found.add(track.genre.toLowerCase().trim());
  }

  const fullText = `${track.title} ${track.genre || ''}`.toLowerCase();
  MICRO_GENRE_KEYWORDS.forEach((kw) => {
    if (fullText.includes(kw)) {
      found.add(kw);
    }
  });

  return Array.from(found);
}

function updateNode(
  map: Record<string, TasteNode>,
  key: string,
  weightDelta: number,
  isListen: boolean,
  isSkip: boolean,
  isLike: boolean
): void {
  const cleanKey = key.trim().toLowerCase();
  if (!cleanKey) return;

  const now = Date.now();
  const existing = map[cleanKey] || {
    weight: 1.0,
    listenCount: 0,
    skipCount: 0,
    likeCount: 0,
    lastInteractedAt: now,
  };

  // Dampen extreme negative drops below 0.1 to avoid permanent burial
  const newWeight = Math.max(0.1, existing.weight + weightDelta);

  map[cleanKey] = {
    weight: newWeight,
    listenCount: existing.listenCount + (isListen ? 1 : 0),
    skipCount: existing.skipCount + (isSkip ? 1 : 0),
    likeCount: existing.likeCount + (isLike ? 1 : 0),
    lastInteractedAt: now,
  };
}

/**
 * Records a successful listen (> 30s or > 50% of track)
 */
export function recordTrackListen(track: Track, secondsListened: number, duration: number): void {
  if (!track || !track.id) return;
  const graph = loadTasteGraph();

  // Track ID memory
  if (!graph.recentPlayedIds.includes(track.id)) {
    graph.recentPlayedIds.push(track.id);
  }

  // Completeness score between 0.6 and 1.5
  const durationSec = duration > 0 ? duration : (track.duration_ms || 180000) / 1000;
  const completionRatio = Math.min(1.0, secondsListened / Math.max(1, durationSec));
  const multiplier = completionRatio > 0.8 ? 1.4 : 1.0;

  // Boost artist (+1.0 * multiplier)
  if (track.artist) {
    updateNode(graph.artists, track.artist, 1.0 * multiplier, true, false, false);
  }

  // Boost genres (+0.75 * multiplier)
  const genres = extractGenresFromTrack(track);
  genres.forEach((genre) => {
    updateNode(graph.genres, genre, 0.75 * multiplier, true, false, false);
  });

  saveTasteGraph(graph);
}

/**
 * Records a fast skip (< 15s)
 */
export function recordTrackSkip(track: Track, _secondsListened: number): void {
  if (!track || !track.id) return;
  const graph = loadTasteGraph();

  // Track ID memory
  if (!graph.recentPlayedIds.includes(track.id)) {
    graph.recentPlayedIds.push(track.id);
  }

  // Penalize artist node (-1.0)
  if (track.artist) {
    updateNode(graph.artists, track.artist, -1.0, false, true, false);
  }

  // Penalize genres node (-0.5)
  const genres = extractGenresFromTrack(track);
  genres.forEach((genre) => {
    updateNode(graph.genres, genre, -0.5, false, true, false);
  });

  saveTasteGraph(graph);
}

/**
 * Records a like (Super-boost: +3.0 for artist, +2.0 for genres)
 */
export function recordTrackLike(track: Track): void {
  if (!track || !track.id) return;
  const graph = loadTasteGraph();

  if (track.artist) {
    updateNode(graph.artists, track.artist, 3.0, false, false, true);
  }

  const genres = extractGenresFromTrack(track);
  genres.forEach((genre) => {
    updateNode(graph.genres, genre, 2.0, false, false, true);
  });

  saveTasteGraph(graph);
}

/**
 * Records an unlike (-2.0 for artist, -1.5 for genres)
 */
export function recordTrackUnlike(track: Track): void {
  if (!track || !track.id) return;
  const graph = loadTasteGraph();

  if (track.artist) {
    updateNode(graph.artists, track.artist, -2.0, false, false, false);
  }

  const genres = extractGenresFromTrack(track);
  genres.forEach((genre) => {
    updateNode(graph.genres, genre, -1.5, false, false, false);
  });

  saveTasteGraph(graph);
}

/**
 * Retrieves top ranking artists and genres from the graph
 */
export function getTopTasteSeeds(
  artistLimit = 6,
  genreLimit = 6
): { artists: string[]; genres: string[] } {
  const graph = loadTasteGraph();

  const artists = Object.entries(graph.artists)
    .map(([name, node]) => ({ name, score: getEffectiveWeight(node) }))
    .filter((item) => item.score > 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, artistLimit)
    .map((item) => item.name);

  const genres = Object.entries(graph.genres)
    .map(([name, node]) => ({ name, score: getEffectiveWeight(node) }))
    .filter((item) => item.score > 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, genreLimit)
    .map((item) => item.name);

  return { artists, genres };
}

/**
 * Returns recent track IDs to exclude from duplicate recommendations
 */
export function getRecentPlayedIds(): number[] {
  const graph = loadTasteGraph();
  return graph.recentPlayedIds;
}

/**
 * Calculates a personalized affinity score for a candidate track
 * based on the user's taste graph (artists, genres, listen completion).
 */
export function scoreTrackAffinity(track: Track): number {
  if (!track) return 1.0;
  const graph = loadTasteGraph();
  let score = 1.0;

  if (track.artist) {
    const cleanArtist = track.artist.trim().toLowerCase();
    const artistNode = graph.artists[cleanArtist];
    if (artistNode) {
      score += getEffectiveWeight(artistNode) * 1.5;
    }
  }

  const genres = extractGenresFromTrack(track);
  genres.forEach((g) => {
    const genreNode = graph.genres[g];
    if (genreNode) {
      score += getEffectiveWeight(genreNode) * 0.8;
    }
  });

  return score;
}
