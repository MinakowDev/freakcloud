import type { Track } from '../model/types';
import { tauriApi } from '../../../shared/api/tauri-client';
import { getTopTasteSeeds, getRecentPlayedIds, scoreTrackAffinity } from './taste-graph';

export type WaveVibe = 'discover' | 'familiar' | 'energetic' | 'calm';

interface TasteProfile {
  topArtists: string[];
  topGenres: string[];
  knownTrackIds: Set<number>;
}

// Extract genres, moods and stylistic keywords from track title & genre
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
];

/**
 * Builds a weighted taste profile from the user's recent likes and cached tracks.
 * Applies time-decay weighting so recently liked tracks have stronger influence.
 */
export function buildTasteProfile(likes: Track[], cached: Track[]): TasteProfile {
  const artistWeights = new Map<string, number>();
  const genreWeights = new Map<string, number>();
  const knownTrackIds = new Set<number>();

  const pool = [...likes, ...cached];

  pool.forEach((track, index) => {
    knownTrackIds.add(track.id);

    // Time-decay: recent tracks (index 0..10) get weight ~1.0, older taper to ~0.35
    const decayWeight = Math.max(0.35, Math.exp(-0.035 * index));

    // Weight artist
    if (track.artist && track.artist.trim()) {
      const cleanArtist = track.artist.trim();
      artistWeights.set(cleanArtist, (artistWeights.get(cleanArtist) || 0) + decayWeight * 2);
    }

    // Weight metadata genre
    if (track.genre && track.genre.trim()) {
      const cleanGenre = track.genre.toLowerCase().trim();
      genreWeights.set(cleanGenre, (genreWeights.get(cleanGenre) || 0) + decayWeight);
    }

    // Extract microgenre keywords from title & genre string
    const fullText = `${track.title} ${track.genre || ''}`.toLowerCase();
    MICRO_GENRE_KEYWORDS.forEach((kw) => {
      if (fullText.includes(kw)) {
        genreWeights.set(kw, (genreWeights.get(kw) || 0) + decayWeight * 1.5);
      }
    });
  });

  // Blend in behavioral Taste Graph (accumulated listens, skips, and likes)
  const tasteSeeds = getTopTasteSeeds(6, 6);
  tasteSeeds.artists.forEach((artist, idx) => {
    const weight = 3.5 - idx * 0.35;
    artistWeights.set(artist, (artistWeights.get(artist) || 0) + weight);
  });
  tasteSeeds.genres.forEach((genre, idx) => {
    const weight = 2.5 - idx * 0.25;
    genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight);
  });

  // Track ID memory from graph to prevent repeating recently played tracks
  getRecentPlayedIds().forEach((id) => knownTrackIds.add(id));

  // Sort artists by weight descending
  const sortedArtists = Array.from(artistWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([artist]) => artist);

  // Sort genres by weight descending
  const sortedGenres = Array.from(genreWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre);

  return {
    topArtists: sortedArtists.slice(0, 5),
    topGenres: sortedGenres.slice(0, 6),
    knownTrackIds,
  };
}

/**
 * Shuffles an array with non-adjacent artist distribution (DJ smoothing)
 */
function smoothShuffle(tracks: Track[]): Track[] {
  if (tracks.length <= 2) return [...tracks];

  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
  const result: Track[] = [];
  const pool = [...shuffled];

  while (pool.length > 0) {
    const lastArtist = result[result.length - 1]?.artist;
    // Try to find a track from a different artist than the last one
    const candidateIdx = pool.findIndex((t) => t.artist !== lastArtist);

    if (candidateIdx !== -1) {
      result.push(pool.splice(candidateIdx, 1)[0]);
    } else {
      result.push(pool.shift()!);
    }
  }

  return result;
}

/**
 * Generates a tailored "Personal Wave" track list based on user taste profile and selected vibe.
 * Leverages SoundCloud Track Stations for collaborative filtering blended with local Taste Graph scoring.
 */
export async function generatePersonalWave(
  vibe: WaveVibe,
  likes: Track[],
  cached: Track[]
): Promise<Track[]> {
  const profile = buildTasteProfile(likes, cached);
  const userTracks = [...likes, ...cached];

  // 1. "Знакомое" (Familiar): Smart shuffle of user's personal likes & cache, plus related station tracks
  if (vibe === 'familiar') {
    if (userTracks.length > 0) {
      const seed = likes[0] || cached[0];
      let stationBonus: Track[] = [];
      if (seed) {
        try {
          const related = await tauriApi.getRelatedTracks(seed.id, 10);
          stationBonus = related.filter((t) => !profile.knownTrackIds.has(t.id));
        } catch {
          // ignore network failure
        }
      }
      return smoothShuffle([...userTracks, ...stationBonus.slice(0, 5)]).slice(0, 35);
    }
    return await tauriApi.getTrending('synthwave', 25);
  }

  // 2. "Открытия" (Discover): Seed track stations from user's most recent likes
  if (vibe === 'discover') {
    const candidatePromises: Promise<Track[]>[] = [];

    // Strategy A: Query Track Stations for top seed tracks from user's likes
    const seedCandidates = likes.slice(0, 4);
    if (seedCandidates.length > 0) {
      seedCandidates.slice(0, 3).forEach((seed) => {
        candidatePromises.push(tauriApi.getRelatedTracks(seed.id, 18));
      });
    }

    // Strategy B: Top artist seeds from taste profile
    if (profile.topArtists.length > 0) {
      profile.topArtists.slice(0, 2).forEach((artist) => {
        candidatePromises.push(tauriApi.searchTracks(artist, 12));
      });
    }

    // Fallback if no likes or profile yet
    if (candidatePromises.length === 0) {
      candidatePromises.push(tauriApi.getTrending('discover', 30));
    }

    const batches = await Promise.allSettled(candidatePromises);
    const discoveredTracks: Track[] = [];
    const seenIds = new Set<number>();

    batches.forEach((b) => {
      if (b.status === 'fulfilled' && Array.isArray(b.value)) {
        b.value.forEach((track) => {
          if (!profile.knownTrackIds.has(track.id) && !seenIds.has(track.id)) {
            seenIds.add(track.id);
            discoveredTracks.push(track);
          }
        });
      }
    });

    if (discoveredTracks.length > 0) {
      // Re-rank candidates by local Taste Graph affinity score
      discoveredTracks.sort((a, b) => scoreTrackAffinity(b) - scoreTrackAffinity(a));
      return smoothShuffle(discoveredTracks).slice(0, 30);
    }

    return await tauriApi.getTrending('discover', 25);
  }

  // 3. "Бодрое" (Energetic): Energetic track stations + local high tempo tracks
  if (vibe === 'energetic') {
    const energeticKeywords = ['phonk', 'dnb', 'bass', 'electronic', 'club', 'breakbeat'];
    const matchingLocal = userTracks.filter((t) => {
      const text = `${t.title} ${t.genre || ''}`.toLowerCase();
      return energeticKeywords.some((kw) => text.includes(kw));
    });

    const candidatePromises: Promise<Track[]>[] = [];
    if (matchingLocal.length > 0) {
      candidatePromises.push(tauriApi.getRelatedTracks(matchingLocal[0].id, 15));
    }
    candidatePromises.push(tauriApi.getTrending('energetic', 20));

    const batches = await Promise.allSettled(candidatePromises);
    const stationTracks: Track[] = [];
    batches.forEach((b) => {
      if (b.status === 'fulfilled' && Array.isArray(b.value)) {
        stationTracks.push(...b.value);
      }
    });

    const merged = [
      ...matchingLocal,
      ...stationTracks.filter((t) => !matchingLocal.some((m) => m.id === t.id)),
    ];

    merged.sort((a, b) => scoreTrackAffinity(b) - scoreTrackAffinity(a));
    return smoothShuffle(merged.length > 0 ? merged : stationTracks).slice(0, 30);
  }

  // 4. "Спокойное" (Calm): Ambient / lofi track stations
  if (vibe === 'calm') {
    const calmKeywords = ['ambient', 'lofi', 'chill', 'downtempo', 'peaceful', 'relax'];
    const matchingLocal = userTracks.filter((t) => {
      const text = `${t.title} ${t.genre || ''}`.toLowerCase();
      return calmKeywords.some((kw) => text.includes(kw));
    });

    const candidatePromises: Promise<Track[]>[] = [];
    if (matchingLocal.length > 0) {
      candidatePromises.push(tauriApi.getRelatedTracks(matchingLocal[0].id, 15));
    }
    candidatePromises.push(tauriApi.getTrending('calm', 20));

    const batches = await Promise.allSettled(candidatePromises);
    const stationTracks: Track[] = [];
    batches.forEach((b) => {
      if (b.status === 'fulfilled' && Array.isArray(b.value)) {
        stationTracks.push(...b.value);
      }
    });

    const merged = [
      ...matchingLocal,
      ...stationTracks.filter((t) => !matchingLocal.some((m) => m.id === t.id)),
    ];

    merged.sort((a, b) => scoreTrackAffinity(b) - scoreTrackAffinity(a));
    return smoothShuffle(merged.length > 0 ? merged : stationTracks).slice(0, 30);
  }

  return smoothShuffle(userTracks).slice(0, 25);
}

export interface WaveBatchOptions {
  vibe?: WaveVibe;
  likes: Track[];
  cached: Track[];
  excludeIds?: Set<number>;
  batchSize?: number;
  currentTrackId?: number;
}

/**
 * Generates a fresh batch of tracks for the Infinite Personal Wave,
 * querying SoundCloud track-stations for the currently playing and liked tracks,
 * re-ranked via Taste Graph affinity and strictly excluding queued or recently played tracks.
 */
export async function generateWaveBatch(options: WaveBatchOptions): Promise<Track[]> {
  const {
    vibe = 'discover',
    likes,
    cached,
    excludeIds = new Set(),
    batchSize = 12,
    currentTrackId,
  } = options;
  const profile = buildTasteProfile(likes, cached);

  // Combine all exclusions: currently queued + recently played in taste graph
  const allExcluded = new Set<number>([...excludeIds, ...profile.knownTrackIds]);

  const candidatePromises: Promise<Track[]>[] = [];

  // 1. Primary Seed: If current playing track is provided, query its Track Station
  if (currentTrackId) {
    candidatePromises.push(tauriApi.getRelatedTracks(currentTrackId, 20));
  }

  // 2. Secondary Seed: A random recent liked track
  if (likes.length > 0) {
    const recentSample = likes.slice(0, 6);
    const randomLike = recentSample[Math.floor(Math.random() * recentSample.length)];
    if (randomLike && randomLike.id !== currentTrackId) {
      candidatePromises.push(tauriApi.getRelatedTracks(randomLike.id, 18));
    }
  }

  // 3. Additional seed from top artist if needed
  if (profile.topArtists.length > 0 && candidatePromises.length < 2) {
    const randomArtist = profile.topArtists[Math.floor(Math.random() * profile.topArtists.length)];
    candidatePromises.push(tauriApi.searchTracks(randomArtist, 10));
  }

  // 4. Trending vibe fallback
  const trendingVibe = vibe === 'energetic' ? 'electronic' : vibe === 'calm' ? 'ambient' : undefined;
  candidatePromises.push(tauriApi.getTrending(trendingVibe, 15));

  const results = await Promise.allSettled(candidatePromises);
  const candidates: Track[] = [];
  const seenInBatch = new Set<number>();

  results.forEach((res) => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      res.value.forEach((t) => {
        if (!allExcluded.has(t.id) && !seenInBatch.has(t.id)) {
          seenInBatch.add(t.id);
          candidates.push(t);
        }
      });
    }
  });

  if (candidates.length >= 4) {
    // Re-rank by taste graph affinity score
    candidates.sort((a, b) => scoreTrackAffinity(b) - scoreTrackAffinity(a));
    return smoothShuffle(candidates).slice(0, batchSize);
  }

  // Fallback: fetch general trending tracks excluding queue
  try {
    const fallback = await tauriApi.getTrending(undefined, 20);
    const fallbackFiltered = fallback.filter((t) => !excludeIds.has(t.id) && !seenInBatch.has(t.id));
    const combined = [...candidates, ...fallbackFiltered];
    combined.sort((a, b) => scoreTrackAffinity(b) - scoreTrackAffinity(a));
    return smoothShuffle(combined).slice(0, batchSize);
  } catch (err) {
    console.warn('[WaveAlgorithm] Fallback trending fetch failed:', err);
    return candidates;
  }
}

