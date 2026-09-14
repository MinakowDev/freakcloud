use serde::{Deserialize, Serialize};

use super::track::Track;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackStatus {
    Playing,
    Paused,
    Stopped,
    Buffering,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    Off,
    Track,
    Queue,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlaybackState {
    pub status: PlaybackStatus,
    pub volume: f32,
    pub is_muted: bool,
    pub position_ms: u32,
    pub duration_ms: u32,
    pub repeat_mode: RepeatMode,
    pub is_shuffled: bool,
    pub current_track: Option<Track>,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            status: PlaybackStatus::Stopped,
            volume: 0.8,
            is_muted: false,
            position_ms: 0,
            duration_ms: 0,
            repeat_mode: RepeatMode::Off,
            is_shuffled: false,
            current_track: None,
        }
    }
}
