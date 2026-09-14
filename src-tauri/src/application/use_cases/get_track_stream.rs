use std::sync::Arc;

use crate::domain::{errors::DomainError, ports::SoundCloudGateway};

pub struct GetTrackStreamUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
}

impl GetTrackStreamUseCase {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>) -> Self {
        Self { gateway }
    }

    pub async fn execute(&self, track_id: u64) -> Result<String, DomainError> {
        self.gateway.resolve_stream_url(track_id).await
    }
}
