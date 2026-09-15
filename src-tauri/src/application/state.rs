use std::sync::Arc;

use crate::{
    application::use_cases::{
        AuthenticateUseCase, CacheTrackUseCase, GetTrackStreamUseCase, GetTrendingUseCase,
        ManageCacheUseCase, SearchTracksUseCase,
    },
    domain::ports::{AudioCacheGateway, SessionRepository, SoundCloudGateway},
};

pub struct AppState {
    pub search_tracks: SearchTracksUseCase,
    pub get_track_stream: GetTrackStreamUseCase,
    pub authenticate: AuthenticateUseCase,
    pub get_trending: GetTrendingUseCase,
    pub cache_track: CacheTrackUseCase,
    pub manage_cache: ManageCacheUseCase,
    pub gateway: Arc<dyn SoundCloudGateway>,
    pub session_repo: Arc<dyn SessionRepository>,
    pub audio_cache: Arc<dyn AudioCacheGateway>,
}

impl AppState {
    pub fn new(
        gateway: Arc<dyn SoundCloudGateway>,
        session_repo: Arc<dyn SessionRepository>,
        audio_cache: Arc<dyn AudioCacheGateway>,
    ) -> Self {
        Self {
            search_tracks: SearchTracksUseCase::new(gateway.clone()),
            get_track_stream: GetTrackStreamUseCase::new(gateway.clone(), audio_cache.clone()),
            authenticate: AuthenticateUseCase::new(gateway.clone(), session_repo.clone()),
            get_trending: GetTrendingUseCase::new(gateway.clone()),
            cache_track: CacheTrackUseCase::new(gateway.clone(), audio_cache.clone()),
            manage_cache: ManageCacheUseCase::new(audio_cache.clone()),
            gateway,
            session_repo,
            audio_cache,
        }
    }
}
