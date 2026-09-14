use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Track {
    pub id: u64,
    pub title: String,
    pub artist: String,
    pub artist_id: Option<u64>,
    pub duration_ms: u32,
    pub artwork_url: Option<String>,
    pub waveform_url: Option<String>,
    pub stream_url: Option<String>,
    pub playback_count: Option<u64>,
    pub likes_count: Option<u64>,
    pub genre: Option<String>,
    pub permalink_url: String,
}

impl Track {
    pub fn formatted_duration(&self) -> String {
        let total_seconds = self.duration_ms / 1000;
        let minutes = total_seconds / 60;
        let seconds = total_seconds % 60;
        format!("{:02}:{:02}", minutes, seconds)
    }

    pub fn high_res_artwork_url(&self) -> Option<String> {
        self.artwork_url.as_ref().map(|url| {
            // SoundCloud URL transformations: replace -large.jpg with -t500x500.jpg
            if url.contains("-large.") {
                url.replace("-large.", "-t500x500.")
            } else {
                url.clone()
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_formatted_duration() {
        let track = Track {
            id: 1,
            title: "Test Track".to_string(),
            artist: "Artist".to_string(),
            artist_id: None,
            duration_ms: 212_000, // 3:32
            artwork_url: None,
            waveform_url: None,
            stream_url: None,
            playback_count: None,
            likes_count: None,
            genre: None,
            permalink_url: "https://soundcloud.com/test".to_string(),
        };

        assert_eq!(track.formatted_duration(), "03:32");
    }

    #[test]
    fn test_high_res_artwork() {
        let track = Track {
            id: 1,
            title: "Test Track".to_string(),
            artist: "Artist".to_string(),
            artist_id: None,
            duration_ms: 60_000,
            artwork_url: Some("https://i1.sndcdn.com/artworks-123-large.jpg".to_string()),
            waveform_url: None,
            stream_url: None,
            playback_count: None,
            likes_count: None,
            genre: None,
            permalink_url: "https://soundcloud.com/test".to_string(),
        };

        assert_eq!(
            track.high_res_artwork_url(),
            Some("https://i1.sndcdn.com/artworks-123-t500x500.jpg".to_string())
        );
    }
}
