// Desktop tray overlay widget timing and synchronization constants

export const TRAY_CONFIG = {
  // Polling fallback interval to detect external state updates
  SYNC_POLL_INTERVAL_MS: 800,

  // Staggered sync request timeouts on widget mount
  INITIAL_SYNC_DELAY_1_MS: 300,
  INITIAL_SYNC_DELAY_2_MS: 1000,
} as const;
