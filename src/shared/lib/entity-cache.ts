import type { Playlist } from '../../entities/playlist/model/types';
import type { Track } from '../../entities/track/model/types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface ArtistCacheData {
  tracks: Track[];
  albums: Playlist[];
  avatarUrl?: string;
}

// 30 minutes TTL for metadata cache
const DEFAULT_TTL_MS = 30 * 60 * 1000;

class EntityCache {
  private playlistCache = new Map<number, CacheEntry<Playlist>>();
  private artistCache = new Map<string, CacheEntry<ArtistCacheData>>();

  // Playlist / Album details cache
  getCachedPlaylist(playlistId: number, ttl = DEFAULT_TTL_MS): Playlist | null {
    const entry = this.playlistCache.get(playlistId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttl) {
      this.playlistCache.delete(playlistId);
      return null;
    }
    return entry.data;
  }

  setCachedPlaylist(playlistId: number, playlist: Playlist): void {
    this.playlistCache.set(playlistId, {
      data: playlist,
      timestamp: Date.now(),
    });
  }

  // Artist details & tracks & discography cache
  getCachedArtist(artistName: string, ttl = DEFAULT_TTL_MS): ArtistCacheData | null {
    const key = artistName.trim().toLowerCase();
    const entry = this.artistCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttl) {
      this.artistCache.delete(key);
      return null;
    }
    return entry.data;
  }

  setCachedArtist(artistName: string, data: ArtistCacheData): void {
    const key = artistName.trim().toLowerCase();
    this.artistCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clearEntityCache(): void {
    this.playlistCache.clear();
    this.artistCache.clear();
  }

  getEntityCacheStats(): { playlistsCount: number; artistsCount: number } {
    return {
      playlistsCount: this.playlistCache.size,
      artistsCount: this.artistCache.size,
    };
  }
}

export const entityCache = new EntityCache();
