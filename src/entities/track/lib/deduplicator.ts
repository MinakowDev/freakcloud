import type { Track } from '../model/types';
import { cleanTrackTitle, extractCanonicalArtist, isAggregatorOrSpamArtist } from './track-cleaner';

export interface DuplicateCluster {
  id: string;
  canonicalTrack: Track;
  duplicates: Track[];
  confidence: number;
  reason: 'exact_id' | 'exact_file' | 'similar_meta' | 'similar_title';
}

/**
 * Normalizes text for comparison by removing punctuation and collapsing spaces
 */
export function normalizeForComparison(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts significant tokens from track title (excluding common noise)
 */
function extractTitleTokens(cleanTitle: string): string[] {
  const normalized = normalizeForComparison(cleanTitle);
  const stopTokens = new Set(['feat', 'ft', 'prod', 'by', 'the', 'a', 'an', 'and', 'with', 'edit']);
  return normalized
    .split(' ')
    .filter((token) => token.length > 1 && !stopTokens.has(token));
}

/**
 * Calculates Dice coefficient similarity between two token lists
 */
function calculateTokenDiceSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  const setB = new Set(tokensB);
  let intersectionCount = 0;
  for (const token of tokensA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }

  return (2 * intersectionCount) / (tokensA.length + tokensB.length);
}

/**
 * Fast Levenshtein distance ratio between two normalized strings
 */
function calculateLevenshteinRatio(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.4) {
    return 0.0; // Early exit if lengths differ drastically
  }

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  const distance = matrix[len1][len2];
  return Math.max(0, 1 - distance / maxLen);
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number;
  reason: 'exact_id' | 'exact_file' | 'similar_meta' | 'similar_title';
}

/**
 * Checks whether two tracks are duplicates
 */
export function areTracksDuplicates(trackA: Track, trackB: Track): DuplicateCheckResult {
  // 1. Exact track ID match
  if (trackA.id === trackB.id) {
    return { isDuplicate: true, confidence: 1.0, reason: 'exact_id' };
  }

  // 2. Exact file path match for local tracks
  if (
    trackA.source === 'local' &&
    trackB.source === 'local' &&
    trackA.permalink_url &&
    trackB.permalink_url &&
    trackA.permalink_url.toLowerCase() === trackB.permalink_url.toLowerCase()
  ) {
    return { isDuplicate: true, confidence: 1.0, reason: 'exact_file' };
  }

  // 3. Duration comparison (tracks with duration delta > 5 sec are usually different versions)
  const durA = trackA.duration_ms || 0;
  const durB = trackB.duration_ms || 0;
  const durationDiff = Math.abs(durA - durB);

  // If both have durations and differ by more than 5 seconds, reject
  if (durA > 0 && durB > 0 && durationDiff > 5000) {
    return { isDuplicate: false, confidence: 0, reason: 'similar_meta' };
  }

  const cleanTitleA = cleanTrackTitle(trackA.title);
  const cleanTitleB = cleanTrackTitle(trackB.title);
  const normTitleA = normalizeForComparison(cleanTitleA);
  const normTitleB = normalizeForComparison(cleanTitleB);

  const artistA = normalizeForComparison(extractCanonicalArtist(trackA));
  const artistB = normalizeForComparison(extractCanonicalArtist(trackB));

  const tokensA = extractTitleTokens(cleanTitleA);
  const tokensB = extractTitleTokens(cleanTitleB);
  const tokenSim = calculateTokenDiceSimilarity(tokensA, tokensB);
  const levSim = calculateLevenshteinRatio(normTitleA, normTitleB);
  const titleSimilarity = Math.max(tokenSim, levSim);

  // Check Artist similarity
  const artistMatches =
    artistA === artistB ||
    (artistA.length > 2 && artistB.includes(artistA)) ||
    (artistB.length > 2 && artistA.includes(artistB));

  // Case A: Same artist + high title similarity + close duration
  if (artistMatches && titleSimilarity >= 0.82 && durationDiff <= 4000) {
    return {
      isDuplicate: true,
      confidence: Math.round(titleSimilarity * 100) / 100,
      reason: 'similar_meta',
    };
  }

  // Case B: Very high title similarity + near identical duration
  if (titleSimilarity >= 0.92 && durationDiff <= 2500) {
    return {
      isDuplicate: true,
      confidence: Math.round(titleSimilarity * 100) / 100,
      reason: 'similar_title',
    };
  }

  return { isDuplicate: false, confidence: 0, reason: 'similar_meta' };
}

/**
 * Evaluates the quality of a track to pick the best canonical entry in a cluster
 */
function scoreTrackQuality(track: Track): number {
  let score = 0;
  if (track.artwork_url) score += 20;
  if (track.genre && track.genre.trim()) score += 5;
  if (!isAggregatorOrSpamArtist(track.artist)) score += 15;
  if (track.duration_ms && track.duration_ms > 0) score += 5;
  if (track.source === 'local') score += 10;
  if (track.permalink_url && track.permalink_url.includes('soundcloud.com')) score += 5;
  return score;
}

/**
 * Finds and clusters duplicate tracks from a list
 */
export function findDuplicateClusters(tracks: Track[]): DuplicateCluster[] {
  if (!tracks || tracks.length < 2) return [];

  const n = tracks.length;
  // Disjoint set (Union-Find)
  const parent = Array.from({ length: n }, (_, i) => i);
  const pairReasons = new Map<string, { confidence: number; reason: DuplicateCluster['reason'] }>();

  function find(i: number): number {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(i: number, j: number, confidence: number, reason: DuplicateCluster['reason']) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
      pairReasons.set(`${rootJ}`, { confidence, reason });
    }
  }

  // Compare pairs (O(N^2), fast because token filter + early exit)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const check = areTracksDuplicates(tracks[i], tracks[j]);
      if (check.isDuplicate) {
        union(i, j, check.confidence, check.reason);
      }
    }
  }

  // Group by root parent
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root) || [];
    list.push(i);
    groups.set(root, list);
  }

  const clusters: DuplicateCluster[] = [];

  groups.forEach((indices, root) => {
    if (indices.length > 1) {
      // Pick best canonical track
      const clusterTracks = indices.map((idx) => tracks[idx]);
      clusterTracks.sort((a, b) => scoreTrackQuality(b) - scoreTrackQuality(a));

      const canonicalTrack = clusterTracks[0];
      const duplicates = clusterTracks.slice(1);
      const meta = pairReasons.get(`${root}`) || { confidence: 0.95, reason: 'similar_meta' };

      clusters.push({
        id: `cluster-${canonicalTrack.id}-${duplicates.length}`,
        canonicalTrack,
        duplicates,
        confidence: meta.confidence,
        reason: meta.reason,
      });
    }
  });

  return clusters;
}

/**
 * Filters out duplicate tracks, keeping only canonical ones
 */
export function removeDuplicatesFromTracks(
  tracks: Track[],
  duplicateTrackIdsToRemove: Set<number>
): Track[] {
  return tracks.filter((t) => !duplicateTrackIdsToRemove.has(t.id));
}
