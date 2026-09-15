use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::Track,
    ports::{AudioCacheGateway, SoundCloudGateway},
};

pub struct CacheTrackUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
    audio_cache: Arc<dyn AudioCacheGateway>,
}

impl CacheTrackUseCase {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>, audio_cache: Arc<dyn AudioCacheGateway>) -> Self {
        Self {
            gateway,
            audio_cache,
        }
    }

    pub async fn execute(&self, track: Track) -> Result<String, DomainError> {
        // Если уже в кэше, сразу возвращаем путь
        if let Some(path) = self.audio_cache.get_cached_path(track.id).await? {
            return Ok(path);
        }

        // Получаем URL аудиопотока
        let stream_url = self.gateway.resolve_stream_url(track.id).await?;

        // Скачиваем и кэшируем
        self.audio_cache.download_and_cache(&track, &stream_url).await
    }

    pub async fn remove(&self, track_id: u64) -> Result<(), DomainError> {
        self.audio_cache.remove_cached(track_id).await
    }
}
