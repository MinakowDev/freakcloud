use std::sync::Arc;

use crate::{
    application::use_cases::{
        AuthenticateUseCase, GetTrackStreamUseCase, GetTrendingUseCase, SearchTracksUseCase,
    },
    domain::ports::{SessionRepository, SoundCloudGateway},
};

pub struct AppState {
    pub search_tracks: SearchTracksUseCase,
    pub get_track_stream: GetTrackStreamUseCase,
    pub authenticate: AuthenticateUseCase,
    pub get_trending: GetTrendingUseCase,
    pub gateway: Arc<dyn SoundCloudGateway>,
    pub session_repo: Arc<dyn SessionRepository>,
}

impl AppState {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>, session_repo: Arc<dyn SessionRepository>) -> Self {
        Self {
            search_tracks: SearchTracksUseCase::new(gateway.clone()),
            get_track_stream: GetTrackStreamUseCase::new(gateway.clone()),
            authenticate: AuthenticateUseCase::new(gateway.clone(), session_repo.clone()),
            get_trending: GetTrendingUseCase::new(gateway.clone()),
            gateway,
            session_repo,
        }
    }
}
