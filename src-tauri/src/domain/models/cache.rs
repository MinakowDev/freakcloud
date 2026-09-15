use serde::{Deserialize, Serialize};
use super::track::Track;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedTrack {
    pub track: Track,
    pub file_path: String,
    pub size_bytes: u64,
    pub cached_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_tracks: usize,
    pub total_size_bytes: u64,
}

impl CacheStats {
    pub fn formatted_size(&self) -> String {
        let mb = (self.total_size_bytes as f64) / (1024.0 * 1024.0);
        if mb >= 1024.0 {
            format!("{:.2} ГБ", mb / 1024.0)
        } else {
            format!("{:.1} МБ", mb)
        }
    }
}
