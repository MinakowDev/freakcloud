import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Track } from './types';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useSession } from '../../session/model/session-context';
import { recordTrackLike, recordTrackUnlike } from '../lib/taste-graph';

interface LikesContextValue {
  likedIds: Set<number>;
  likedTracks: Track[];
  isLoading: boolean;
  error: string | null;
  isLiked: (trackId: number) => boolean;
  likeTrack: (track: Track) => Promise<void>;
  unlikeTrack: (trackId: number) => Promise<void>;
  toggleLike: (track: Track) => Promise<void>;
  refreshLikes: () => Promise<void>;
}

const LikesContext = createContext<LikesContextValue | null>(null);

export const LikesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, openOAuthModal } = useSession();
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const likedIdsRef = useRef<Set<number>>(likedIds);
  likedIdsRef.current = likedIds;
  const likedTracksRef = useRef<Track[]>(likedTracks);
  likedTracksRef.current = likedTracks;

  const refreshLikes = useCallback(async () => {
    if (!session.is_authenticated) {
      setLikedIds(new Set());
      setLikedTracks([]);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const tracks = await tauriApi.getMyLikes(50);
      setLikedTracks(tracks);
      setLikedIds(new Set(tracks.map((t) => t.id)));
    } catch (err) {
      console.error('Failed to load likes:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [session.is_authenticated]);

  useEffect(() => {
    refreshLikes();
  }, [refreshLikes]);

  const isLiked = useCallback((trackId: number) => likedIds.has(trackId), [likedIds]);

  const likeTrack = useCallback(async (track: Track) => {
    if (!session.is_authenticated) {
      openOAuthModal();
      return;
    }

    const prevIds = likedIdsRef.current;
    const prevTracks = likedTracksRef.current;

    setLikedIds((prev) => new Set(prev).add(track.id));
    setLikedTracks((prev) => {
      if (prev.some((t) => t.id === track.id)) return prev;
      return [track, ...prev];
    });

    // Super-boost taste graph nodes for this artist and genres
    recordTrackLike(track);

    try {
      await tauriApi.likeTrack(track.id);
    } catch (err) {
      console.error('Failed to like track in SoundCloud:', err);
      setLikedIds(prevIds);
      setLikedTracks(prevTracks);
    }
  }, [session.is_authenticated, openOAuthModal]);

  const unlikeTrack = useCallback(async (trackId: number) => {
    if (!session.is_authenticated) {
      openOAuthModal();
      return;
    }

    const prevIds = likedIdsRef.current;
    const prevTracks = likedTracksRef.current;

    setLikedIds((prev) => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
    setLikedTracks((prev) => prev.filter((t) => t.id !== trackId));

    const foundTrack = prevTracks.find((t) => t.id === trackId);
    if (foundTrack) {
      recordTrackUnlike(foundTrack);
    }

    try {
      await tauriApi.unlikeTrack(trackId);
    } catch (err) {
      console.error('Failed to unlike track in SoundCloud:', err);
      setLikedIds(prevIds);
      setLikedTracks(prevTracks);
    }
  }, [session.is_authenticated, openOAuthModal]);

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
        isLoading,
        error,
        isLiked,
        likeTrack,
        unlikeTrack,
        toggleLike,
        refreshLikes,
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
