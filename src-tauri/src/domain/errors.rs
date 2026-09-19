use thiserror::Error;

#[derive(Debug, Error)]
pub enum DomainError {
    #[error("SoundCloud API error: {0}")]
    SoundCloud(String),

    #[error("Track not found: ID {0}")]
    TrackNotFound(u64),

    #[error("Stream not available for track {0}")]
    StreamNotAvailable(u64),

    #[error("Authentication required for this operation")]
    Unauthorized,

    #[error("Invalid token provided")]
    InvalidToken,

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Playback error: {0}")]
    Playback(String),

    #[error("Unexpected error: {0}")]
    Unexpected(String),
}

impl serde::Serialize for DomainError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
