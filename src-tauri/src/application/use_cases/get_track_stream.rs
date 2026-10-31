use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::{AudioSource, TrackSource},
    ports::{AudioCacheGateway, SoundCloudGateway},
};

pub struct GetTrackStreamUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
    audio_cache: Arc<dyn AudioCacheGateway>,
}

impl GetTrackStreamUseCase {
    pub fn new(
        gateway: Arc<dyn SoundCloudGateway>,
        audio_cache: Arc<dyn AudioCacheGateway>,
    ) -> Self {
        Self {
            gateway,
            audio_cache,
        }
    }

    pub async fn execute(
        &self,
        track_id: u64,
        source: Option<TrackSource>,
        _external_id: Option<String>,
    ) -> Result<AudioSource, DomainError> {
        if let Some(TrackSource::Local) = source {
            if let Some(ref path) = _external_id {
                log::info!("[GetTrackStream] Serving local audio file: {}", path);
                return Ok(AudioSource {
                    url: path.clone(),
                    is_local: true,
                    file_path: Some(path.clone()),
                });
            }
        }

        if let Some(file_path) = self.audio_cache.get_cached_path(track_id).await? {
            log::info!("[GetTrackStream] Track {} found in cache", track_id);
            return Ok(AudioSource {
                url: file_path.clone(),
                is_local: true,
                file_path: Some(file_path),
            });
        }

        let stream_url = match source.unwrap_or(TrackSource::SoundCloud) {
            TrackSource::SoundCloud => self.gateway.resolve_stream_url(track_id).await?,
            TrackSource::YouTube => return Err(DomainError::Unexpected("YouTube Music removed".to_string())),
            TrackSource::Local => return Err(DomainError::Storage("Local file path missing".to_string())),
        };

        Ok(AudioSource {
            url: stream_url,
            is_local: false,
            file_path: None,
        })
    }
}
