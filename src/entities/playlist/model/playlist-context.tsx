import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { Playlist } from './types';
import type { Track } from '../../track/model/types';
import { tauriApi } from '../../../shared/api/tauri-client';
import { entityCache } from '../../../shared/lib/entity-cache';

interface PlaylistContextValue {
  savedPlaylists: Playlist[];
  isLoading: boolean;
  refreshSavedPlaylists: () => Promise<void>;
  savePlaylist: (playlist: Playlist) => Promise<void>;
  removeSavedPlaylist: (playlistId: number) => Promise<void>;
  isPlaylistSaved: (playlistId: number) => boolean;
  createCustomPlaylist: (title: string) => Promise<Playlist>;
  addTrackToPlaylist: (playlistId: number, track: Track) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  updatePlaylistTitle: (playlistId: number, newTitle: string) => Promise<void>;
  deleteCustomPlaylist: (playlistId: number) => Promise<void>;
  trackToAddToPlaylist: Track | null;
  openAddToPlaylist: (track: Track) => void;
  closeAddToPlaylist: () => void;
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export const PlaylistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedPlaylists, setSavedPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [trackToAddToPlaylist, setTrackToAddToPlaylist] = useState<Track | null>(null);

  const refreshSavedPlaylists = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await tauriApi.getSavedPlaylists();
      setSavedPlaylists(list);
      list.forEach((p) => {
        entityCache.setCachedPlaylist(p.id, p);
      });
    } catch (err) {
      console.error('Failed to load saved playlists:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSavedPlaylists();
  }, [refreshSavedPlaylists]);

  const savePlaylist = useCallback(async (playlist: Playlist) => {
    try {
      await tauriApi.savePlaylist(playlist);
      entityCache.setCachedPlaylist(playlist.id, playlist);
      setSavedPlaylists((prev) => {
        const exists = prev.some((p) => p.id === playlist.id);
        if (exists) {
          return prev.map((p) => (p.id === playlist.id ? playlist : p));
        }
        return [playlist, ...prev];
      });
    } catch (err) {
      console.error('Failed to save playlist:', err);
      throw err;
    }
  }, []);

  const removeSavedPlaylist = useCallback(async (playlistId: number) => {
    try {
      await tauriApi.removeSavedPlaylist(playlistId);
      setSavedPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    } catch (err) {
      console.error('Failed to remove playlist:', err);
      throw err;
    }
  }, []);

  const isPlaylistSaved = useCallback((playlistId: number) => {
    return savedPlaylists.some((p) => p.id === playlistId);
  }, [savedPlaylists]);

  const createCustomPlaylist = useCallback(async (title: string): Promise<Playlist> => {
    const newPlaylist: Playlist = {
      id: Date.now(),
      title: title.trim() || 'Новый плейлист',
      author: 'Вы',
      duration_ms: 0,
      track_count: 0,
      is_album: false,
      tracks: [],
    };
    await savePlaylist(newPlaylist);
    return newPlaylist;
  }, [savePlaylist]);

  const addTrackToPlaylist = useCallback(async (playlistId: number, track: Track) => {
    let target = savedPlaylists.find((p) => p.id === playlistId);
    if (!target) {
      const cached = entityCache.getCachedPlaylist(playlistId);
      if (cached) target = cached;
    }
    if (!target) return;

    const currentTracks = target.tracks || [];
    if (currentTracks.some((t) => t.id === track.id)) {
      return;
    }

    const updatedTracks = [...currentTracks, track];
    const updatedPlaylist: Playlist = {
      ...target,
      tracks: updatedTracks,
      track_count: updatedTracks.length,
      duration_ms: (target.duration_ms || 0) + (track.duration_ms || 0),
      artwork_url: target.artwork_url || track.artwork_url,
    };

    await savePlaylist(updatedPlaylist);
  }, [savedPlaylists, savePlaylist]);

  const removeTrackFromPlaylist = useCallback(async (playlistId: number, trackId: number) => {
    let target = savedPlaylists.find((p) => p.id === playlistId);
    if (!target) {
      const cached = entityCache.getCachedPlaylist(playlistId);
      if (cached) target = cached;
    }
    if (!target) return;

    const currentTracks = target.tracks || [];
    const removedTrack = currentTracks.find((t) => t.id === trackId);
    const updatedTracks = currentTracks.filter((t) => t.id !== trackId);
    const durationDelta = removedTrack ? (removedTrack.duration_ms || 0) : 0;

    const updatedPlaylist: Playlist = {
      ...target,
      tracks: updatedTracks,
      track_count: updatedTracks.length,
      duration_ms: Math.max(0, (target.duration_ms || 0) - durationDelta),
    };

    await savePlaylist(updatedPlaylist);
  }, [savedPlaylists, savePlaylist]);

  const updatePlaylistTitle = useCallback(async (playlistId: number, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    let target = savedPlaylists.find((p) => p.id === playlistId);
    if (!target) {
      const cached = entityCache.getCachedPlaylist(playlistId);
      if (cached) target = cached;
    }
    if (!target) return;

    const updatedPlaylist: Playlist = {
      ...target,
      title: trimmed,
    };

    await savePlaylist(updatedPlaylist);
  }, [savedPlaylists, savePlaylist]);

  const deleteCustomPlaylist = useCallback(async (playlistId: number) => {
    await removeSavedPlaylist(playlistId);
  }, [removeSavedPlaylist]);

  const openAddToPlaylist = useCallback((track: Track) => {
    setTrackToAddToPlaylist(track);
  }, []);

  const closeAddToPlaylist = useCallback(() => {
    setTrackToAddToPlaylist(null);
  }, []);

  const value = useMemo(() => ({
    savedPlaylists,
    isLoading,
    refreshSavedPlaylists,
    savePlaylist,
    removeSavedPlaylist,
    isPlaylistSaved,
    createCustomPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    updatePlaylistTitle,
    deleteCustomPlaylist,
    trackToAddToPlaylist,
    openAddToPlaylist,
    closeAddToPlaylist,
  }), [
    savedPlaylists,
    isLoading,
    refreshSavedPlaylists,
    savePlaylist,
    removeSavedPlaylist,
    isPlaylistSaved,
    createCustomPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    updatePlaylistTitle,
    deleteCustomPlaylist,
    trackToAddToPlaylist,
    openAddToPlaylist,
    closeAddToPlaylist,
  ]);

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>;
};

export const usePlaylists = (): PlaylistContextValue => {
  const ctx = useContext(PlaylistContext);
  if (!ctx) {
    throw new Error('usePlaylists must be used within a PlaylistProvider');
  }
  return ctx;
};
