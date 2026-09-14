use std::sync::Arc;

use crate::domain::{errors::DomainError, models::Track, ports::SoundCloudGateway};

pub struct GetTrendingUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
}

impl GetTrendingUseCase {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>) -> Self {
        Self { gateway }
    }

    pub async fn execute(&self, vibe: Option<&str>, limit: Option<u32>) -> Result<Vec<Track>, DomainError> {
        let genre = match vibe {
            Some("calm") | Some("спокойное") => Some("ambient"),
            Some("energetic") | Some("бодрое") => Some("electronic"),
            Some("familiar") | Some("знакомое") => Some("synthwave"),
            Some("discover") | Some("открытия") => Some("experimental"),
            other => other,
        };

        let limit = limit.unwrap_or(20).clamp(1, 50);
        self.gateway.get_trending(genre, limit).await
    }
}
