import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { AudioSource, CacheStats, Track } from '../../entities/track/model/types';
import type { Session } from '../../entities/session/model/types';
import type { Playlist } from '../../entities/playlist/model/types';

export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    (window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
};

async function safeInvoke<T>(command: string, args: Record<string, unknown> = {}, fallback?: T): Promise<T> {
  if (!isTauri()) {
    console.warn(`[Tauri API] IPC not available in this environment. Falling back for command: "${command}"`);
    return fallback as T;
  }
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    console.error(`[Tauri API] Command "${command}" failed:`, err);
    throw err;
  }
}

const DEFAULT_SESSION: Session = {
  is_authenticated: false,
};

const DEFAULT_CACHE_STATS: CacheStats = {
  total_tracks: 0,
  total_size_bytes: 0,
};

export const tauriApi = {
  isTauri,

  searchTracks: async (query: string, limit = 30, offset = 0): Promise<Track[]> => {
    return safeInvoke<Track[]>('search_tracks', { query, limit, offset }, []);
  },

  searchPlaylists: async (query: string, limit = 20, offset = 0): Promise<Playlist[]> => {
    return safeInvoke<Playlist[]>('search_playlists', { query, limit, offset }, []);
  },

  getPlaylistDetails: async (playlistId: number): Promise<Playlist> => {
    return safeInvoke<Playlist>('get_playlist_details', { playlistId });
  },

  getSavedPlaylists: async (): Promise<Playlist[]> => {
    return safeInvoke<Playlist[]>('get_saved_playlists', {}, []);
  },

  savePlaylist: async (playlist: Playlist): Promise<void> => {
    return safeInvoke<void>('save_playlist', { playlist });
  },

  removeSavedPlaylist: async (playlistId: number): Promise<void> => {
    return safeInvoke<void>('remove_saved_playlist', { playlistId });
  },

  isPlaylistSaved: async (playlistId: number): Promise<boolean> => {
    return safeInvoke<boolean>('is_playlist_saved', { playlistId }, false);
  },

  getTrackStream: async (trackId: number): Promise<AudioSource> => {
    return safeInvoke<AudioSource>(
      'get_track_stream',
      { trackId },
      { url: '', is_local: false }
    );
  },

  getTrackDetails: async (trackId: number): Promise<Track> => {
    return safeInvoke<Track>('get_track_details', { trackId }, {
      id: trackId,
      title: 'Unknown Track',
      artist: 'Unknown Artist',
      duration_ms: 0,
      permalink_url: '',
    });
  },

  getMyLikes: async (limit = 50): Promise<Track[]> => {
    return safeInvoke<Track[]>('get_my_likes', { limit }, []);
  },

  likeTrack: async (trackId: number): Promise<void> => {
    return safeInvoke<void>('like_track', { trackId });
  },

  unlikeTrack: async (trackId: number): Promise<void> => {
    return safeInvoke<void>('unlike_track', { trackId });
  },

  getRelatedTracks: async (trackId: number, limit = 20): Promise<Track[]> => {
    return safeInvoke<Track[]>('get_related_tracks', { trackId, limit }, []);
  },

  getTrending: async (vibe?: string, limit = 30): Promise<Track[]> => {
    return safeInvoke<Track[]>('get_trending', { vibe, limit }, []);
  },

  loginWithToken: async (token: string): Promise<Session> => {
    return safeInvoke<Session>('login_with_token', { token }, {
      is_authenticated: true,
      user: {
        id: 0,
        username: 'SoundCloud User',
        full_name: 'SoundCloud User',
        permalink_url: '',
      },
      auth_token: token,
    });
  },

  logout: async (): Promise<Session> => {
    return safeInvoke<Session>('logout', {}, DEFAULT_SESSION);
  },

  getCurrentSession: async (): Promise<Session> => {
    return safeInvoke<Session>('get_current_session', {}, DEFAULT_SESSION);
  },

  cacheTrack: async (track: Track): Promise<string> => {
    return safeInvoke<string>('cache_track', { track }, '');
  },

  removeCachedTrack: async (trackId: number): Promise<void> => {
    return safeInvoke<void>('remove_cached_track', { trackId });
  },

  getCachedTracks: async (): Promise<Track[]> => {
    return safeInvoke<Track[]>('get_cached_tracks', {}, []);
  },

  getCacheStats: async (): Promise<CacheStats> => {
    return safeInvoke<CacheStats>('get_cache_stats', {}, DEFAULT_CACHE_STATS);
  },

  clearCache: async (): Promise<void> => {
    return safeInvoke<void>('clear_cache');
  },

  isTrackCached: async (trackId: number): Promise<boolean> => {
    return safeInvoke<boolean>('is_track_cached', { trackId }, false);
  },

  openSoundcloudLogin: async (): Promise<void> => {
    return safeInvoke<void>('open_soundcloud_login');
  },

  openExternal: async (url: string): Promise<void> => {
    if (isTauri()) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
        return;
      } catch (err) {
        console.warn('Failed to open external url with plugin-opener:', err);
      }
    }
    window.open(url, '_blank');
  },

  showMainWindow: async (): Promise<void> => {
    return safeInvoke<void>('show_main_window', {});
  },

  updateDiscordRpc: async (payload: DiscordRpcPayload): Promise<void> => {
    return safeInvoke<void>('update_discord_rpc', { payload });
  },

  clearDiscordRpc: async (): Promise<void> => {
    return safeInvoke<void>('clear_discord_rpc');
  },

  setDiscordRpcEnabled: async (enabled: boolean): Promise<void> => {
    return safeInvoke<void>('set_discord_rpc_enabled', { enabled });
  },

  setDiscordClientId: async (clientId?: string): Promise<void> => {
    return safeInvoke<void>('set_discord_client_id', { clientId });
  },

  resolveAudioUrl: (source: AudioSource): string => {
    if (source.is_local && source.file_path) {
      if (isTauri()) {
        try {
          return convertFileSrc(source.file_path);
        } catch {
          return source.file_path;
        }
      }
      return source.file_path;
    }
    return source.url;
  },
};

export interface DiscordRpcPayload {
  title: string;
  artist: string;
  artwork_url?: string;
  permalink_url?: string;
  is_playing: boolean;
  current_time_sec: number;
  duration_sec: number;
}
