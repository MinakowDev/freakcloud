use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::AudioSource,
    ports::{AudioCacheGateway, SoundCloudGateway},
};

pub struct GetTrackStreamUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
    audio_cache: Arc<dyn AudioCacheGateway>,
}

impl GetTrackStreamUseCase {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>, audio_cache: Arc<dyn AudioCacheGateway>) -> Self {
        Self {
            gateway,
            audio_cache,
        }
    }

    /// Cache-First резолвинг аудиоисточника для трека
    pub async fn execute(&self, track_id: u64) -> Result<AudioSource, DomainError> {
        // 1. Сначала проверяем локальный кэш
        if let Some(file_path) = self.audio_cache.get_cached_path(track_id).await? {
            return Ok(AudioSource {
                url: file_path.clone(),
                is_local: true,
                file_path: Some(file_path),
            });
        }

        // 2. Если в кэше нет — запрашиваем прямой URL потока у SoundCloud
        let stream_url = self.gateway.resolve_stream_url(track_id).await?;
        Ok(AudioSource {
            url: stream_url,
            is_local: false,
            file_path: None,
        })
    }
}
