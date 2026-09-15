use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::{CacheStats, Track},
    ports::AudioCacheGateway,
};

pub struct ManageCacheUseCase {
    audio_cache: Arc<dyn AudioCacheGateway>,
}

impl ManageCacheUseCase {
    pub fn new(audio_cache: Arc<dyn AudioCacheGateway>) -> Self {
        Self { audio_cache }
    }

    pub async fn get_all_cached(&self) -> Result<Vec<Track>, DomainError> {
        self.audio_cache.get_all_cached().await
    }

    pub async fn get_stats(&self) -> Result<CacheStats, DomainError> {
        self.audio_cache.get_cache_stats().await
    }

    pub async fn clear(&self) -> Result<(), DomainError> {
        self.audio_cache.clear_cache().await
    }

    pub async fn is_cached(&self, track_id: u64) -> bool {
        self.audio_cache.is_cached(track_id).await
    }
}
