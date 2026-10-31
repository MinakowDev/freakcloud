// Centralized registry of all localStorage keys used across the application

export const STORAGE_KEYS = {
  // Player state and preferences
  PLAYER_VOLUME: 'freakcloud_player_volume',
  AUTOPLAY_WAVE: 'freakcloud_autoplay_wave',
  AUDIO_QUALITY: 'freakcloud_audio_quality',
  VOLUME_NORM: 'freakcloud_volume_norm',

  // Tray overlay widget synchronization
  TRAY_STATE: 'freakcloud_tray_state',
  TRAY_WIDGET_ENABLED: 'freakcloud_tray_widget_enabled',

  // Integrations
  DISCORD_RPC_ENABLED: 'discord_rpc_enabled',
  GLOBAL_SHORTCUTS: 'freakcloud_global_shortcuts',
  WINDOWS_MEDIA_CONTROLS: 'freakcloud_windows_media_controls',
  PREDICTIVE_PRECACHE: 'freakcloud_predictive_precache',

  // Application settings and UI
  LOCALE: 'freakcloud_locale',
  SUPPORT_DISMISSED: 'freakcloud_github_star_dismissed',
  RECENT_SEARCHES: 'freakcloud_recent_searches',

  // Tracks, likes, cache, and recommendations graph
  MY_LIKES: 'freakcloud_my_likes',
  AUTO_CACHE: 'freakcloud_auto_cache',
  TASTE_GRAPH: 'freakcloud_taste_graph',
  RECENT_TRACKS: 'freakcloud_recent_tracks',
  LOCAL_MUSIC_DIR: 'freakcloud_local_music_dir',
  LOCAL_TRACKS: 'freakcloud_local_tracks',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
