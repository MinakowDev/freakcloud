import type { Track } from '../../track/model/types';
import type { Playlist } from '../model/types';
import { STORAGE_KEYS } from '../../../shared/config';
import { scoreTrackAffinity, loadTasteGraph } from '../../track/lib/taste-graph';

export const SMART_PLAYLIST_IDS = {
  ON_REPEAT: -1001,
  FORGOTTEN_FAVORITES: -1002,
  TASTE_RADAR: -1003,
  LOCAL_COLLECTION: -1004,
} as const;

export interface SmartPlaylist extends Playlist {
  icon: string;
  accentColor: string;
  bgGradient: string;
  description: string;
}

export function getLocalTracks(): Track[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_TRACKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalTracks(tracks: Track[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_TRACKS, JSON.stringify(tracks));
    window.dispatchEvent(new Event('freakcloud_local_tracks_updated'));
  } catch (err) {
    console.warn('[SmartPlaylists] Failed to save local tracks:', err);
  }
}

export function getLocalMusicDir(): string | null {
  return localStorage.getItem(STORAGE_KEYS.LOCAL_MUSIC_DIR);
}

export function saveLocalMusicDir(dir: string | null): void {
  if (dir) {
    localStorage.setItem(STORAGE_KEYS.LOCAL_MUSIC_DIR, dir);
  } else {
    localStorage.removeItem(STORAGE_KEYS.LOCAL_MUSIC_DIR);
  }
}

interface GenerateSmartPlaylistsParams {
  likedTracks: Track[];
  historyTracks: Track[];
  cachedTracks?: Track[];
  localTracks?: Track[];
  t: (key: string) => string;
}

export function generateSmartPlaylists({
  likedTracks,
  historyTracks,
  cachedTracks = [],
  localTracks = [],
  t,
}: GenerateSmartPlaylistsParams): SmartPlaylist[] {
  const result: SmartPlaylist[] = [];

  // 1. «Топ на повторе» (On Repeat)
  const freqMap = new Map<number, number>();
  const trackMap = new Map<number, Track>();
  historyTracks.forEach((track) => {
    if (!track || !track.id) return;
    freqMap.set(track.id, (freqMap.get(track.id) || 0) + 1);
    if (!trackMap.has(track.id)) {
      trackMap.set(track.id, track);
    }
  });

  const sortedByFreq = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => trackMap.get(id)!)
    .filter(Boolean)
    .slice(0, 35);

  const repeatTracks = sortedByFreq.length > 0 ? sortedByFreq : historyTracks.slice(0, 30);
  const repeatDuration = repeatTracks.reduce((acc, tr) => acc + (tr.duration_ms || 0), 0);
  const repeatArtwork = repeatTracks.find((tr) => Boolean(tr.artwork_url))?.artwork_url;

  result.push({
    id: SMART_PLAYLIST_IDS.ON_REPEAT,
    title: t('smart_playlists.on_repeat_title'),
    description: t('smart_playlists.on_repeat_desc'),
    author: 'Freakcloud AI',
    duration_ms: repeatDuration,
    artwork_url: repeatArtwork,
    track_count: repeatTracks.length,
    is_album: false,
    tracks: repeatTracks,
    icon: 'ri-fire-line',
    accentColor: 'text-amber-400',
    bgGradient: 'from-amber-500/20 via-orange-500/10 to-transparent',
    source: 'smart',
  });

  // 2. «Забытые фавориты» (Forgotten Favorites)
  // Liked tracks not in last 40 history tracks
  const recentPlayedIds = new Set(historyTracks.slice(0, 40).map((tr) => tr.id));
  const forgottenTracks = likedTracks
    .filter((tr) => !recentPlayedIds.has(tr.id))
    .slice(0, 35);

  const fallbackForgotten = forgottenTracks.length > 0 ? forgottenTracks : [...likedTracks].reverse().slice(0, 30);
  const forgottenDuration = fallbackForgotten.reduce((acc, tr) => acc + (tr.duration_ms || 0), 0);
  const forgottenArtwork = fallbackForgotten.find((tr) => Boolean(tr.artwork_url))?.artwork_url;

  result.push({
    id: SMART_PLAYLIST_IDS.FORGOTTEN_FAVORITES,
    title: t('smart_playlists.forgotten_title'),
    description: t('smart_playlists.forgotten_desc'),
    author: 'Freakcloud AI',
    duration_ms: forgottenDuration,
    artwork_url: forgottenArtwork,
    track_count: fallbackForgotten.length,
    is_album: false,
    tracks: fallbackForgotten,
    icon: 'ri-history-line',
    accentColor: 'text-violet-400',
    bgGradient: 'from-violet-500/20 via-purple-500/10 to-transparent',
    source: 'smart',
  });

  // 3. «Вкусовой радар» (Taste Radar)
  const poolTracks = new Map<number, Track>();
  [...likedTracks, ...historyTracks, ...cachedTracks].forEach((tr) => {
    if (tr && tr.id) {
      poolTracks.set(tr.id, tr);
    }
  });

  const tasteGraph = loadTasteGraph();
  const blacklistedArtists = new Set((tasteGraph.blacklist?.artists || []).map((a) => a.toLowerCase()));

  const scoredTracks = Array.from(poolTracks.values())
    .filter((tr) => {
      if (!tr.artist) return true;
      return !blacklistedArtists.has(tr.artist.trim().toLowerCase());
    })
    .map((tr) => ({
      track: tr,
      score: scoreTrackAffinity(tr),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 35)
    .map((item) => item.track);

  const tasteRadarTracks = scoredTracks.length > 0 ? scoredTracks : Array.from(poolTracks.values()).slice(0, 30);
  const tasteRadarDuration = tasteRadarTracks.reduce((acc, tr) => acc + (tr.duration_ms || 0), 0);
  const tasteRadarArtwork = tasteRadarTracks.find((tr) => Boolean(tr.artwork_url))?.artwork_url;

  result.push({
    id: SMART_PLAYLIST_IDS.TASTE_RADAR,
    title: t('smart_playlists.taste_radar_title'),
    description: t('smart_playlists.taste_radar_desc'),
    author: 'Freakcloud AI',
    duration_ms: tasteRadarDuration,
    artwork_url: tasteRadarArtwork,
    track_count: tasteRadarTracks.length,
    is_album: false,
    tracks: tasteRadarTracks,
    icon: 'ri-radar-line',
    accentColor: 'text-emerald-400',
    bgGradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    source: 'smart',
  });

  // 4. «Локальная коллекция» (Local Collection)
  const localDuration = localTracks.reduce((acc, tr) => acc + (tr.duration_ms || 0), 0);
  const localArtwork = localTracks.find((tr) => Boolean(tr.artwork_url))?.artwork_url;

  result.push({
    id: SMART_PLAYLIST_IDS.LOCAL_COLLECTION,
    title: t('smart_playlists.local_collection_title'),
    description: t('smart_playlists.local_collection_desc'),
    author: t('smart_playlists.local_collection_author'),
    duration_ms: localDuration,
    artwork_url: localArtwork,
    track_count: localTracks.length,
    is_album: false,
    tracks: localTracks,
    icon: 'ri-folder-music-line',
    accentColor: 'text-sky-400',
    bgGradient: 'from-sky-500/20 via-blue-500/10 to-transparent',
    source: 'local',
  });

  return result;
}
