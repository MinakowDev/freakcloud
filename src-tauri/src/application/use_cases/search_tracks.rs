use std::sync::Arc;

use crate::domain::{errors::DomainError, models::Track, ports::SoundCloudGateway};

pub struct SearchTracksUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
}

impl SearchTracksUseCase {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>) -> Self {
        Self { gateway }
    }

    pub async fn execute(&self, query: &str, limit: Option<u32>, offset: Option<u32>) -> Result<Vec<Track>, DomainError> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let limit = limit.unwrap_or(20).clamp(1, 50);
        let offset = offset.unwrap_or(0);

        self.gateway.search_tracks(trimmed, limit, offset).await
    }
}
