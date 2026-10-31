use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::Track,
    ports::SoundCloudGateway,
};

pub struct SearchTracksUseCase {
    sc_gateway: Arc<dyn SoundCloudGateway>,
}

impl SearchTracksUseCase {
    pub fn new(sc_gateway: Arc<dyn SoundCloudGateway>) -> Self {
        Self { sc_gateway }
    }

    pub async fn execute(
        &self,
        query: &str,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<Vec<Track>, DomainError> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let limit = limit.unwrap_or(30).clamp(1, 100);
        let offset = offset.unwrap_or(0);

        self.sc_gateway.search_tracks(trimmed, limit, offset).await
    }
}
