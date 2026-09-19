use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::domain::{errors::DomainError, models::PlaybackStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioPlayerState {
    pub status: PlaybackStatus,
    pub current_time: f64,
    pub duration: f64,
    pub volume: f32,
    pub is_muted: bool,
}

#[async_trait]
pub trait AudioPlayerPort: Send + Sync {
    async fn load_and_play(&self, url_or_path: String, is_local: bool) -> Result<(), DomainError>;
    async fn play(&self) -> Result<(), DomainError>;
    async fn pause(&self) -> Result<(), DomainError>;
    async fn seek(&self, position_seconds: f64) -> Result<(), DomainError>;
    async fn set_volume(&self, volume: f32) -> Result<(), DomainError>;
    async fn set_muted(&self, muted: bool) -> Result<(), DomainError>;
    async fn stop(&self) -> Result<(), DomainError>;
    async fn get_state(&self) -> Result<AudioPlayerState, DomainError>;
    fn set_app_handle(&self, app_handle: tauri::AppHandle);
}
