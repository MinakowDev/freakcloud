use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::{Track, TrackSource},
    ports::{AudioCacheGateway, SoundCloudGateway},
};

pub struct CacheTrackUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
    audio_cache: Arc<dyn AudioCacheGateway>,
}

impl CacheTrackUseCase {
    pub fn new(
        gateway: Arc<dyn SoundCloudGateway>,
        audio_cache: Arc<dyn AudioCacheGateway>,
    ) -> Self {
        Self {
            gateway,
            audio_cache,
        }
    }

    pub async fn execute(&self, track: Track) -> Result<String, DomainError> {
        if let Some(path) = self.audio_cache.get_cached_path(track.id).await? {
            log::info!("[CacheTrack] Track {} already cached", track.id);
            return Ok(path);
        }

        let stream_url = match track.source {
            TrackSource::SoundCloud => self.gateway.resolve_stream_url(track.id).await?,
            TrackSource::YouTube => return Err(DomainError::Unexpected("YouTube Music removed".to_string())),
            TrackSource::Local => return Ok(track.external_id),
        };

        self.audio_cache.download_and_cache(&track, &stream_url).await
    }

    pub async fn remove(&self, track_id: u64) -> Result<(), DomainError> {
        self.audio_cache.remove_cached(track_id).await
    }
}
