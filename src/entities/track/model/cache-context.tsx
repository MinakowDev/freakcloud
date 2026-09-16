import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { CacheStats, Track } from './types';
import { tauriApi } from '../../../shared/api/tauri-client';

const AUTO_CACHE_STORAGE_KEY = 'freakcloud_auto_cache';

interface CacheContextValue {
  cachedIds: Set<number>;
  cachedTracks: Track[];
  cacheStats: CacheStats;
  autoCache: boolean;
  setAutoCache: (enabled: boolean) => void;
  isDownloading: (trackId: number) => boolean;
  isCached: (trackId: number) => boolean;
  isManuallyRemoved: (trackId: number) => boolean;
  cacheTrack: (track: Track) => Promise<void>;
  removeCachedTrack: (trackId: number) => Promise<void>;
  clearCache: () => Promise<void>;
  refreshCache: () => Promise<void>;
}

const CacheContext = createContext<CacheContextValue | null>(null);

export const CacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cachedIds, setCachedIds] = useState<Set<number>>(new Set());
  const [cachedTracks, setCachedTracks] = useState<Track[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats>({ total_tracks: 0, total_size_bytes: 0 });
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [manuallyRemovedIds, setManuallyRemovedIds] = useState<Set<number>>(new Set());

  const [autoCache, setAutoCacheState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTO_CACHE_STORAGE_KEY);
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const setAutoCache = useCallback((enabled: boolean) => {
    setAutoCacheState(enabled);
    try {
      localStorage.setItem(AUTO_CACHE_STORAGE_KEY, String(enabled));
    } catch (err) {
      console.error('Failed to save autoCache setting:', err);
    }
  }, []);

  const refreshCache = useCallback(async () => {
    try {
      const [tracks, stats] = await Promise.all([
        tauriApi.getCachedTracks(),
        tauriApi.getCacheStats(),
      ]);
      setCachedTracks(tracks);
      setCacheStats(stats);
      setCachedIds(new Set(tracks.map((t) => t.id)));
    } catch (err) {
      console.error('Failed to load cache:', err);
    }
  }, []);

  useEffect(() => {
    refreshCache();
  }, [refreshCache]);

  const isCached = useCallback((trackId: number) => cachedIds.has(trackId), [cachedIds]);

  const isDownloading = useCallback((trackId: number) => downloadingIds.has(trackId), [downloadingIds]);

  const isManuallyRemoved = useCallback((trackId: number) => manuallyRemovedIds.has(trackId), [manuallyRemovedIds]);

  const cacheTrack = async (track: Track) => {
    if (downloadingIds.has(track.id)) return;
    try {
      setDownloadingIds((prev) => new Set(prev).add(track.id));
      // If user explicitly caches a track, remove it from the manually removed set
      setManuallyRemovedIds((prev) => {
        if (!prev.has(track.id)) return prev;
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
      await tauriApi.cacheTrack(track);
      await refreshCache();
    } catch (err) {
      console.error('Failed to cache track:', err);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  const removeCachedTrack = async (trackId: number) => {
    try {
      // Mark as explicitly/manually removed so auto-cache won't immediately re-cache it during playback
      setManuallyRemovedIds((prev) => new Set(prev).add(trackId));
      await tauriApi.removeCachedTrack(trackId);
      await refreshCache();
    } catch (err) {
      console.error('Failed to remove cached track:', err);
    }
  };

  const clearCache = async () => {
    try {
      await tauriApi.clearCache();
      await refreshCache();
    } catch (err) {
      console.error('Failed to clear cache:', err);
    }
  };

  const value: CacheContextValue = {
    cachedIds,
    cachedTracks,
    cacheStats,
    autoCache,
    setAutoCache,
    isDownloading,
    isCached,
    isManuallyRemoved,
    cacheTrack,
    removeCachedTrack,
    clearCache,
    refreshCache,
  };

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
};

export const useCache = (): CacheContextValue => {
  const context = useContext(CacheContext);
  if (!context) {
    throw new Error('useCache must be used within CacheProvider');
  }
  return context;
};
