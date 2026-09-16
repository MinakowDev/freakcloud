use serde::{Deserialize, Serialize};
use super::Track;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Playlist {
    pub id: u64,
    pub title: String,
    pub author: String,
    pub author_id: Option<u64>,
    pub duration_ms: u32,
    pub artwork_url: Option<String>,
    pub track_count: u32,
    pub permalink_url: Option<String>,
    pub is_album: bool,
    pub tracks: Option<Vec<Track>>,
}

impl Playlist {
    pub fn formatted_duration(&self) -> String {
        let total_seconds = self.duration_ms / 1000;
        let minutes = total_seconds / 60;
        let seconds = total_seconds % 60;
        format!("{:02}:{:02}", minutes, seconds)
    }

    pub fn high_res_artwork_url(&self) -> Option<String> {
        self.artwork_url.as_ref().map(|url| {
            if url.contains("-large.") {
                url.replace("-large.", "-t500x500.")
            } else {
                url.clone()
            }
        })
    }
}
