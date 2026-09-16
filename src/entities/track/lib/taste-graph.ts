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
  blacklist?: {
    artists: string[];
    genres: string[];
  };
  pinned?: {
    artists: string[];
    genres: string[];
  };
}

const STORAGE_KEY = 'freakcloud_taste_graph';
const CURRENT_VERSION = 1;
const MAX_RECENT_TRACKS = 200;
const MAX_ARTIST_NODES = 120;
const MAX_GENRE_NODES = 60;

// Half-life for taste node decay: 14 days in ms
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_MS;

export const GENRE_STOPWORDS = new Set([
  'all',
  'all-music',
  'audio',
  'music',
  'other',
  'soundtrack',
  'electronic',
  'dance & edm',
  'dance and edm',
  'dance',
  'edm',
  'pop',
  'alternative',
  'alternative rock',
  'hip-hop & rap',
  'hip-hop and rap',
  'hip hop & rap',
  'hip hop and rap',
  'podcast',
  'track',
  'tracks',
  'song',
  'songs',
  'unknown',
  'various',
]);

export interface MicroGenreDef {
  pattern: RegExp;
  canonical: string;
}

export const SOUNDCLOUD_MICRO_GENRES: MicroGenreDef[] = [
  // Witch House & Darkwave
  { pattern: /\b(witch\s*house|witchhouse)\b/i, canonical: 'witch house' },
  { pattern: /\b(darkwave|coldwave)\b/i, canonical: 'darkwave' },
  { pattern: /\b(post-punk|post\s+punk)\b/i, canonical: 'post-punk' },

  // UK Garage & Bass
  { pattern: /\b(uk\s*garage|ukg|2-step|2step|future\s*garage)\b/i, canonical: 'uk garage' },
  { pattern: /\b(breakcore|glitchcore)\b/i, canonical: 'breakcore' },
  { pattern: /\b(liquid\s*dnb|liquid\s+drum\s+and\s+bass)\b/i, canonical: 'liquid dnb' },
  { pattern: /\b(drum\s*and\s*bass|dnb|jungle|drum\s*&\s*bass)\b/i, canonical: 'dnb' },
  { pattern: /\b(breakbeat|breaks)\b/i, canonical: 'breakbeat' },

  // Wave & Phonk
  { pattern: /\b(drift\s*phonk|memphis\s*phonk)\b/i, canonical: 'drift phonk' },
  { pattern: /\b(phonk)\b/i, canonical: 'phonk' },
  { pattern: /\b(hardwave|wave\s*music|wavemob)\b/i, canonical: 'hardwave' },
  { pattern: /\b(synthwave|retrowave|darksynth)\b/i, canonical: 'synthwave' },

  // Trap, Plugg, Underground Rap
  { pattern: /\b(pluggnb|plugg\s*nb|plugg)\b/i, canonical: 'pluggnb' },
  { pattern: /\b(rage\s*beat|rage\s*type|opium\s*type|rage)\b/i, canonical: 'rage' },
  { pattern: /\b(cloud\s*rap)\b/i, canonical: 'cloud rap' },
  { pattern: /\b(uk\s*drill|ny\s*drill|drill)\b/i, canonical: 'drill' },
  { pattern: /\b(trap\s*metal|screamo\s*rap)\b/i, canonical: 'trap metal' },
  { pattern: /\b(memphis\s*rap)\b/i, canonical: 'memphis rap' },
  { pattern: /\b(emo\s*rap)\b/i, canonical: 'emo rap' },
  { pattern: /\b(boom\s*bap|boombap)\b/i, canonical: 'boom bap' },

  // Electronic & Club
  { pattern: /\b(jersey\s*club|jersey)\b/i, canonical: 'jersey club' },
  { pattern: /\b(hyperpop|digicore)\b/i, canonical: 'hyperpop' },
  { pattern: /\b(color\s*bass|colour\s*bass|future\s*bass)\b/i, canonical: 'future bass' },
  { pattern: /\b(midtempo|cyberpunk)\b/i, canonical: 'cyberpunk' },
  { pattern: /\b(melodic\s*techno|peak\s*time\s*techno|minimal\s*techno)\b/i, canonical: 'melodic techno' },
  { pattern: /\b(deep\s*house|lofi\s*house)\b/i, canonical: 'deep house' },
  { pattern: /\b(techno)\b/i, canonical: 'techno' },
  { pattern: /\b(hardstyle|rawstyle|gabber)\b/i, canonical: 'hardstyle' },
  { pattern: /\b(riddim|melodic\s*dubstep|tearout)\b/i, canonical: 'riddim' },

  // Chill, Ambient & Indie
  { pattern: /\b(dark\s*ambient|dungeon\s*synth|drone)\b/i, canonical: 'dark ambient' },
  { pattern: /\b(ambient)\b/i, canonical: 'ambient' },
  { pattern: /\b(shoegaze|dreampop|dream\s*pop|slowcore)\b/i, canonical: 'shoegaze' },
  { pattern: /\b(midwest\s*emo)\b/i, canonical: 'midwest emo' },
  { pattern: /\b(lofi|lo-fi|chillhop)\b/i, canonical: 'lo-fi' },
  { pattern: /\b(vaporwave|mallsoft|slushwave)\b/i, canonical: 'vaporwave' },
  { pattern: /\b(downtempo|trip\s*hop|trip-hop)\b/i, canonical: 'downtempo' },
  { pattern: /\b(chillstep)\b/i, canonical: 'chillstep' },
  { pattern: /\b(math\s*rock)\b/i, canonical: 'math rock' },
  { pattern: /\b(nu-metal|nu\s*metal)\b/i, canonical: 'nu-metal' },
  { pattern: /\b(post-rock|post\s*rock)\b/i, canonical: 'post-rock' },
];

function createDefaultGraph(): TasteGraphData {
  return {
    version: CURRENT_VERSION,
    artists: {},
    genres: {},
    recentPlayedIds: [],
    blacklist: {
      artists: [],
      genres: [],
    },
    pinned: {
      artists: [],
      genres: [],
    },
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
    if (!parsed.blacklist) parsed.blacklist = { artists: [], genres: [] };
    if (!parsed.pinned) parsed.pinned = { artists: [], genres: [] };
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

export function clearTasteBlacklist(): void {
  const graph = loadTasteGraph();
  graph.blacklist = { artists: [], genres: [] };
  saveTasteGraph(graph);
  window.dispatchEvent(new Event('freakcloud_taste_updated'));
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
  const fullText = `${track.title} ${track.genre || ''} ${track.permalink_url || ''}`.toLowerCase();

  // 1. Match specific SoundCloud micro-genres first
  for (const { pattern, canonical } of SOUNDCLOUD_MICRO_GENRES) {
    if (pattern.test(fullText)) {
      found.add(canonical.toLowerCase());
    }
  }

  // 2. If no micro-genre was matched, check track.genre if it's not a generic stop-word
  if (found.size === 0 && track.genre && track.genre.trim()) {
    const rawGenre = track.genre.toLowerCase().trim();
    if (!GENRE_STOPWORDS.has(rawGenre) && rawGenre.length >= 3 && rawGenre.length <= 25) {
      found.add(rawGenre);
    }
  }

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

const RECENT_TRACKS_KEY = 'freakcloud_recent_tracks';

export function getRecentPlayedTracks(): Track[] {
  try {
    const raw = localStorage.getItem(RECENT_TRACKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentPlayedTrack(track: Track): void {
  if (!track || !track.id) return;
  try {
    const list = getRecentPlayedTracks().filter((t) => t.id !== track.id);
    list.unshift(track);
    localStorage.setItem(RECENT_TRACKS_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}

/**
 * Records a successful listen (> 30s or > 50% of track)
 */
export function recordTrackListen(track: Track, secondsListened: number, duration: number): void {
  if (!track || !track.id) return;
  saveRecentPlayedTrack(track);
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
 * Records a Freakcloud internal like (Super-boost: +3.5 for artist, +2.5 for genres)
 */
export function recordTrackLike(track: Track): void {
  if (!track || !track.id) return;
  saveRecentPlayedTrack(track);
  const graph = loadTasteGraph();

  if (track.artist) {
    updateNode(graph.artists, track.artist, 3.5, false, false, true);
  }

  const genres = extractGenresFromTrack(track);
  genres.forEach((genre) => {
    updateNode(graph.genres, genre, 2.5, false, false, true);
  });

  saveTasteGraph(graph);
}

/**
 * Records an unlike (-2.5 for artist, -2.0 for genres)
 */
export function recordTrackUnlike(track: Track): void {
  if (!track || !track.id) return;
  const graph = loadTasteGraph();

  if (track.artist) {
    updateNode(graph.artists, track.artist, -2.5, false, false, false);
  }

  const genres = extractGenresFromTrack(track);
  genres.forEach((genre) => {
    updateNode(graph.genres, genre, -2.0, false, false, false);
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

/**
 * Manually boosts a taste node (+2.5 weight) and marks it as pinned
 */
export function boostNode(type: 'artist' | 'genre', name: string): void {
  const clean = name.trim().toLowerCase();
  if (!clean) return;
  const graph = loadTasteGraph();
  const map = type === 'artist' ? graph.artists : graph.genres;
  const now = Date.now();
  const existing = map[clean] || {
    weight: 1.0,
    listenCount: 0,
    skipCount: 0,
    likeCount: 1,
    lastInteractedAt: now,
  };
  existing.weight = Math.max(1.5, existing.weight) + 2.5;
  existing.lastInteractedAt = now;
  map[clean] = existing;

  const pinnedList = type === 'artist' ? graph.pinned!.artists : graph.pinned!.genres;
  if (!pinnedList.includes(clean)) {
    pinnedList.push(clean);
  }

  saveTasteGraph(graph);
}

/**
 * Manually dampens a taste node (-1.5 weight)
 */
export function dampenNode(type: 'artist' | 'genre', name: string): void {
  const clean = name.trim().toLowerCase();
  if (!clean) return;
  const graph = loadTasteGraph();
  const map = type === 'artist' ? graph.artists : graph.genres;
  if (map[clean]) {
    map[clean].weight = Math.max(0.1, map[clean].weight - 1.5);
    map[clean].lastInteractedAt = Date.now();
    saveTasteGraph(graph);
  }
}

/**
 * Adds an artist or genre to the blacklist (excluded from wave/recommendations)
 */
export function blacklistNode(type: 'artist' | 'genre', name: string): void {
  const clean = name.trim().toLowerCase();
  if (!clean) return;
  const graph = loadTasteGraph();
  const list = type === 'artist' ? graph.blacklist!.artists : graph.blacklist!.genres;
  if (!list.includes(clean)) {
    list.push(clean);
  }
  const map = type === 'artist' ? graph.artists : graph.genres;
  if (map[clean]) {
    map[clean].weight = 0.05;
  }
  saveTasteGraph(graph);
}

/**
 * Removes an artist or genre from the blacklist
 */
export function unblacklistNode(type: 'artist' | 'genre', name: string): void {
  const clean = name.trim().toLowerCase();
  if (!clean) return;
  const graph = loadTasteGraph();
  if (type === 'artist') {
    graph.blacklist!.artists = graph.blacklist!.artists.filter((a) => a !== clean);
    if (graph.artists[clean]) graph.artists[clean].weight = 1.0;
  } else {
    graph.blacklist!.genres = graph.blacklist!.genres.filter((g) => g !== clean);
    if (graph.genres[clean]) graph.genres[clean].weight = 1.0;
  }
  saveTasteGraph(graph);
}

/**
 * Checks if a track, artist or genre is blacklisted
 */
export function isBlacklisted(artist?: string, genres?: string[]): boolean {
  const graph = loadTasteGraph();
  if (artist && graph.blacklist?.artists.includes(artist.trim().toLowerCase())) {
    return true;
  }
  if (genres && graph.blacklist?.genres) {
    for (const g of genres) {
      if (graph.blacklist.genres.includes(g.trim().toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Adds a custom user seed (artist or genre) with initial boost
 */
export function addCustomSeed(type: 'artist' | 'genre', name: string): void {
  const clean = name.trim().toLowerCase();
  if (!clean) return;
  const graph = loadTasteGraph();
  const map = type === 'artist' ? graph.artists : graph.genres;
  map[clean] = {
    weight: 3.5,
    listenCount: 1,
    skipCount: 0,
    likeCount: 1,
    lastInteractedAt: Date.now(),
  };
  const pinnedList = type === 'artist' ? graph.pinned!.artists : graph.pinned!.genres;
  if (!pinnedList.includes(clean)) {
    pinnedList.push(clean);
  }
  saveTasteGraph(graph);
}

/**
 * Resets the taste graph back to initial empty state
 */
export function resetTasteGraph(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('freakcloud_taste_updated'));
  } catch {
    // ignore
  }
}

export interface VisualGraphNode {
  id: string;
  name: string;
  type: 'user' | 'genre' | 'artist';
  weight: number;
  listenCount: number;
  likeCount: number;
  skipCount: number;
  color: string;
  radius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface VisualGraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface VisualGraphData {
  nodes: VisualGraphNode[];
  edges: VisualGraphEdge[];
}

const GENRE_PALETTE = [
  '#f7e479', '#f49d4e', '#e06cbb', '#7b8cf7',
  '#4ecdf4', '#6df7a0', '#f76d6d', '#e4c27a',
  '#9d7bf7', '#f77ba6', '#7bf7cf', '#f7c37b',
];

/**
 * Builds nodes and relational edges for the interactive Canvas graph
 */
export function getVisualGraphData(tracksSample: Track[] = []): VisualGraphData {
  const graph = loadTasteGraph();
  const nodes: VisualGraphNode[] = [];
  const edges: VisualGraphEdge[] = [];
  const nodeMap = new Set<string>();

  // 1. Center node: You (Freakcloud)
  nodes.push({
    id: 'core_user',
    name: 'Вы',
    type: 'user',
    weight: 5.0,
    listenCount: graph.recentPlayedIds.length,
    likeCount: 0,
    skipCount: 0,
    color: '#ffffff',
    radius: 24,
  });
  nodeMap.add('core_user');

  // 2. Genre nodes (sorted by effective weight)
  const topGenres = Object.entries(graph.genres)
    .filter(([name]) => !graph.blacklist?.genres.includes(name.toLowerCase()))
    .map(([name, node]) => ({
      name,
      node,
      effectiveWeight: getEffectiveWeight(node),
    }))
    .filter((g) => g.effectiveWeight > 0.4)
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight)
    .slice(0, 16);

  topGenres.forEach((g, idx) => {
    const id = `genre:${g.name}`;
    const radius = Math.max(12, Math.min(26, 12 + g.effectiveWeight * 2.5));
    const color = GENRE_PALETTE[idx % GENRE_PALETTE.length];

    nodes.push({
      id,
      name: g.name.charAt(0).toUpperCase() + g.name.slice(1),
      type: 'genre',
      weight: Math.round(g.effectiveWeight * 10) / 10,
      listenCount: g.node.listenCount,
      likeCount: g.node.likeCount,
      skipCount: g.node.skipCount,
      color,
      radius,
    });
    nodeMap.add(id);

    // Edge from user to top genres
    edges.push({
      source: 'core_user',
      target: id,
      weight: Math.max(0.3, Math.min(1.0, g.effectiveWeight / 4)),
    });
  });

  // 3. Artist nodes (sorted by effective weight)
  const topArtists = Object.entries(graph.artists)
    .filter(([name]) => !graph.blacklist?.artists.includes(name.toLowerCase()))
    .map(([name, node]) => ({
      name,
      node,
      effectiveWeight: getEffectiveWeight(node),
    }))
    .filter((a) => a.effectiveWeight > 0.5)
    .sort((a, b) => b.effectiveWeight - a.effectiveWeight)
    .slice(0, 18);

  topArtists.forEach((a) => {
    const id = `artist:${a.name}`;
    const radius = Math.max(9, Math.min(18, 9 + a.effectiveWeight * 1.8));

    nodes.push({
      id,
      name: a.name,
      type: 'artist',
      weight: Math.round(a.effectiveWeight * 10) / 10,
      listenCount: a.node.listenCount,
      likeCount: a.node.likeCount,
      skipCount: a.node.skipCount,
      color: '#94a3b8',
      radius,
    });
    nodeMap.add(id);

    // Find if this artist maps to any of the present genre nodes in tracksSample
    let linked = false;
    for (const track of tracksSample) {
      if (track.artist?.toLowerCase() === a.name.toLowerCase()) {
        const trackGenres = extractGenresFromTrack(track);
        for (const tg of trackGenres) {
          const targetGenreId = `genre:${tg.toLowerCase()}`;
          if (nodeMap.has(targetGenreId)) {
            edges.push({
              source: id,
              target: targetGenreId,
              weight: 0.6,
            });
            linked = true;
          }
        }
      }
    }

    // Fallback link: if no track-level genre link was established, link to highest affinity genre or core
    if (!linked && topGenres.length > 0) {
      const fallbackGenre = topGenres[nodes.length % topGenres.length];
      edges.push({
        source: id,
        target: `genre:${fallbackGenre.name}`,
        weight: 0.4,
      });
    }
  });

  return { nodes, edges };
}
