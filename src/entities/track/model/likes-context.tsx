import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Track } from './types';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useSession } from '../../session/model/session-context';
import { recordTrackLike, recordTrackUnlike } from '../lib/taste-graph';

const MY_LIKES_STORAGE_KEY = 'freakcloud_my_likes';

function loadStoredMyLikes(): Track[] {
  try {
    const raw = localStorage.getItem(MY_LIKES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[LikesContext] Failed to parse freakcloud_my_likes:', err);
    return [];
  }
}

function saveStoredMyLikes(tracks: Track[]): void {
  try {
    localStorage.setItem(MY_LIKES_STORAGE_KEY, JSON.stringify(tracks));
  } catch (err) {
    console.warn('[LikesContext] Failed to save freakcloud_my_likes:', err);
  }
}

interface LikesContextValue {
  // 1. Freakcloud internal likes ("Мои лайки")
  likedIds: Set<number>;
  likedTracks: Track[];
  isLiked: (trackId: number) => boolean;
  likeTrack: (track: Track) => Promise<void>;
  unlikeTrack: (trackId: number) => Promise<void>;
  toggleLike: (track: Track) => Promise<void>;

  // 2. SoundCloud account tracks ("SoundCloud")
  soundCloudTracks: Track[];
  isLoadingSoundCloud: boolean;
  soundCloudError: string | null;
  refreshSoundCloud: () => Promise<void>;

  // Backward-compatibility aliases
  isLoading: boolean;
  error: string | null;
  refreshLikes: () => Promise<void>;
}

const LikesContext = createContext<LikesContextValue | null>(null);

export const LikesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useSession();

  // Internal Freakcloud likes (instant, reliable, offline-ready)
  const [likedTracks, setLikedTracks] = useState<Track[]>(() => loadStoredMyLikes());
  const [likedIds, setLikedIds] = useState<Set<number>>(() => new Set(loadStoredMyLikes().map((t) => t.id)));

  // SoundCloud account collection
  const [soundCloudTracks, setSoundCloudTracks] = useState<Track[]>([]);
  const [isLoadingSoundCloud, setIsLoadingSoundCloud] = useState<boolean>(false);
  const [soundCloudError, setSoundCloudError] = useState<string | null>(null);

  const likedIdsRef = useRef<Set<number>>(likedIds);
  likedIdsRef.current = likedIds;
  const likedTracksRef = useRef<Track[]>(likedTracks);
  likedTracksRef.current = likedTracks;

  // Refresh SoundCloud account likes
  const refreshSoundCloud = useCallback(async () => {
    if (!session.is_authenticated) {
      setSoundCloudTracks([]);
      return;
    }
    try {
      setIsLoadingSoundCloud(true);
      setSoundCloudError(null);
      const tracks = await tauriApi.getMyLikes(50);
      setSoundCloudTracks(tracks);
    } catch (err) {
      console.warn('[LikesContext] Failed to load SoundCloud likes:', err);
      setSoundCloudError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingSoundCloud(false);
    }
  }, [session.is_authenticated]);

  useEffect(() => {
    refreshSoundCloud();
  }, [refreshSoundCloud]);

  const isLiked = useCallback((trackId: number) => likedIds.has(trackId), [likedIds]);

  // Like track inside Freakcloud
  const likeTrack = useCallback(async (track: Track) => {
    if (!track || !track.id) return;

    setLikedIds((prev) => {
      const next = new Set(prev);
      next.add(track.id);
      return next;
    });

    setLikedTracks((prev) => {
      if (prev.some((t) => t.id === track.id)) return prev;
      const next = [track, ...prev];
      saveStoredMyLikes(next);
      return next;
    });

    // Directly boost Taste Graph nodes (artists & micro-genres)
    recordTrackLike(track);

    // Optional background sync attempt with SoundCloud (non-blocking, won't revert on failure)
    if (session.is_authenticated) {
      tauriApi.likeTrack(track.id).catch(() => {
        // DataDome or API mismatch is expected; local like remains active
      });
    }
  }, [session.is_authenticated]);

  // Unlike track inside Freakcloud
  const unlikeTrack = useCallback(async (trackId: number) => {
    const prevTracks = likedTracksRef.current;
    const foundTrack = prevTracks.find((t) => t.id === trackId);

    setLikedIds((prev) => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });

    setLikedTracks((prev) => {
      const next = prev.filter((t) => t.id !== trackId);
      saveStoredMyLikes(next);
      return next;
    });

    if (foundTrack) {
      recordTrackUnlike(foundTrack);
    }

    // Optional background sync attempt with SoundCloud (non-blocking)
    if (session.is_authenticated) {
      tauriApi.unlikeTrack(trackId).catch(() => {});
    }
  }, [session.is_authenticated]);

  const toggleLike = useCallback(async (track: Track) => {
    if (likedIdsRef.current.has(track.id)) {
      await unlikeTrack(track.id);
    } else {
      await likeTrack(track);
    }
  }, [likeTrack, unlikeTrack]);

  return (
    <LikesContext.Provider
      value={{
        likedIds,
        likedTracks,
        isLiked,
        likeTrack,
        unlikeTrack,
        toggleLike,
        soundCloudTracks,
        isLoadingSoundCloud,
        soundCloudError,
        refreshSoundCloud,
        isLoading: isLoadingSoundCloud,
        error: soundCloudError,
        refreshLikes: refreshSoundCloud,
      }}
    >
      {children}
    </LikesContext.Provider>
  );
};

export const useLikes = (): LikesContextValue => {
  const context = useContext(LikesContext);
  if (!context) {
    throw new Error('useLikes must be used within a LikesProvider');
  }
  return context;
};
