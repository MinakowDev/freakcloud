import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { Playlist } from './types';
import { tauriApi } from '../../../shared/api/tauri-client';

interface PlaylistContextValue {
  savedPlaylists: Playlist[];
  isLoading: boolean;
  refreshSavedPlaylists: () => Promise<void>;
  savePlaylist: (playlist: Playlist) => Promise<void>;
  removeSavedPlaylist: (playlistId: number) => Promise<void>;
  isPlaylistSaved: (playlistId: number) => boolean;
  createCustomPlaylist: (title: string) => Promise<Playlist>;
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export const PlaylistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedPlaylists, setSavedPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshSavedPlaylists = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await tauriApi.getSavedPlaylists();
      setSavedPlaylists(list);
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

  const value = useMemo(() => ({
    savedPlaylists,
    isLoading,
    refreshSavedPlaylists,
    savePlaylist,
    removeSavedPlaylist,
    isPlaylistSaved,
    createCustomPlaylist,
  }), [savedPlaylists, isLoading, refreshSavedPlaylists, savePlaylist, removeSavedPlaylist, isPlaylistSaved, createCustomPlaylist]);

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>;
};

export const usePlaylists = (): PlaylistContextValue => {
  const ctx = useContext(PlaylistContext);
  if (!ctx) {
    throw new Error('usePlaylists must be used within a PlaylistProvider');
  }
  return ctx;
};
