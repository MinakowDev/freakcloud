// Player timing thresholds, fallbacks and behavior constants

export const PLAYER_CONFIG = {
  // Volume
  DEFAULT_INITIAL_VOLUME: 0.8,

  // Audio update throttling for smooth UI without cascading re-renders
  TIME_UPDATE_THROTTLE_MS: 250,

  // Intervals for broadcasting player state to system tray
  TRAY_BROADCAST_INTERVAL_SEC: 1,

  // Track behavior evaluation thresholds
  MIN_LISTEN_RECORD_SECONDS: 30,
  MIN_LISTEN_RECORD_RATIO: 0.5,
  SKIP_RECORD_THRESHOLD_SECONDS: 15,
  SKIP_RECORD_MIN_DURATION_SECONDS: 25,

  // Fallback track duration (3 minutes) when duration is unavailable
  FALLBACK_TRACK_DURATION_MS: 180000,

  // Navigation and history
  MAX_SHUFFLE_HISTORY_LENGTH: 100,
  QUICK_DOUBLE_CLICK_THRESHOLD_MS: 1500,
  PREV_TRACK_REWIND_THRESHOLD_SECONDS: 3,

  // Predictive pre-caching
  PRECACHE_TRIGGER_SECONDS: 5,

  // Error recovery
  STREAM_ERROR_RECOVERY_DELAY_MS: 1200,
  MAX_CONSECUTIVE_STREAM_ERRORS: 4,

  // Loudness normalization
  NORMALIZATION_TARGET_RMS: 48,
  NORMALIZATION_MIN_GAIN: 0.5,
  NORMALIZATION_MAX_GAIN: 1.6,
} as const;
