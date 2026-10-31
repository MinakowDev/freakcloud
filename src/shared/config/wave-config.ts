// Infinite wave / recommendation stream configuration

export const WAVE_CONFIG = {
  // Threshold of tracks remaining in queue to trigger automatic replenishment
  REPLENISH_THRESHOLD: 4,

  // Batch sizes for recommendation requests
  REPLENISH_BATCH_SIZE: 12,
  INITIAL_BATCH_SIZE: 25,

  // Seed limits for generating taste vectors
  SEED_TRACKS_LIMIT: 8,
  SEED_REPLENISH_LIMIT: 6,
} as const;
