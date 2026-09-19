use std::{collections::HashMap, path::PathBuf, sync::Arc};
use async_trait::async_trait;
use tokio::{fs, sync::RwLock};

use crate::domain::{
    errors::DomainError,
    models::{CacheStats, CachedTrack, Track},
    ports::AudioCacheGateway,
};

pub struct LocalAudioCache {
    _cache_dir: PathBuf,
    audio_dir: PathBuf,
    index_file: PathBuf,
    index: Arc<RwLock<HashMap<u64, CachedTrack>>>,
    http: reqwest::Client,
}

impl LocalAudioCache {
    pub async fn new_default() -> Result<Self, DomainError> {
        let base_dir = dirs::cache_dir()
            .or_else(dirs::data_dir)
            .ok_or_else(|| DomainError::Storage("Could not locate system cache directory".to_string()))?;

        let cache_dir = base_dir.join("freakcloud");
        let audio_dir = cache_dir.join("audio");
        let index_file = cache_dir.join("cache_index.json");

        // Ensure directories exist
        fs::create_dir_all(&audio_dir)
            .await
            .map_err(|e| DomainError::Storage(format!("Failed to create audio cache directory: {}", e)))?;

        // Load existing index if any
        let mut index_map = HashMap::new();
        if index_file.exists() {
            if let Ok(content) = fs::read_to_string(&index_file).await {
                if let Ok(loaded) = serde_json::from_str::<HashMap<u64, CachedTrack>>(&content) {
                    index_map = loaded;
                }
            }
        }

        let http = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .build()
            .map_err(|e| DomainError::Network(e.to_string()))?;

        Ok(Self {
            _cache_dir: cache_dir,
            audio_dir,
            index_file,
            index: Arc::new(RwLock::new(index_map)),
            http,
        })
    }

    async fn persist_index(&self) -> Result<(), DomainError> {
        let index_guard = self.index.read().await;
        let json = serde_json::to_string_pretty(&*index_guard)
            .map_err(|e| DomainError::Storage(format!("Failed to serialize cache index: {}", e)))?;

        fs::write(&self.index_file, json)
            .await
            .map_err(|e| DomainError::Storage(format!("Failed to write cache index: {}", e)))?;

        Ok(())
    }
}

#[async_trait]
impl AudioCacheGateway for LocalAudioCache {
    async fn is_cached(&self, track_id: u64) -> bool {
        let index = self.index.read().await;
        if let Some(entry) = index.get(&track_id) {
            PathBuf::from(&entry.file_path).exists()
        } else {
            false
        }
    }

    async fn get_cached_path(&self, track_id: u64) -> Result<Option<String>, DomainError> {
        let index = self.index.read().await;
        if let Some(entry) = index.get(&track_id) {
            let path = PathBuf::from(&entry.file_path);
            if path.exists() {
                return Ok(Some(entry.file_path.clone()));
            }
        }
        Ok(None)
    }

    async fn download_and_cache(&self, track: &Track, stream_url: &str) -> Result<String, DomainError> {
        // Destination file: <audio_dir>/<track_id>.mp3
        let file_name = format!("{}.mp3", track.id);
        let dest_path = self.audio_dir.join(&file_name);

        // Download audio stream bytes
        let resp = self
            .http
            .get(stream_url)
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Failed to download audio: {}", e)))?;

        if !resp.status().is_success() {
            return Err(DomainError::Network(format!(
                "Failed to download audio stream, HTTP status: {}",
                resp.status()
            )));
        }

        let mut bytes = resp
            .bytes()
            .await
            .map_err(|e| DomainError::Network(format!("Failed to read audio stream bytes: {}", e)))?
            .to_vec();

        // If HLS playlist, resolve and concatenate segments
        if bytes.starts_with(b"#EXTM3U") || bytes.starts_with(b"#EXT-X") {
            let mut current_playlist_url = stream_url.to_string();
            let mut m3u8_text = String::from_utf8_lossy(&bytes).to_string();

            // If this is a master/variant playlist (contains child .m3u8), resolve the child playlist first
            let child_playlist_path = m3u8_text
                .lines()
                .map(|l| l.trim())
                .find(|l| !l.starts_with('#') && l.contains(".m3u8"))
                .map(|s| s.to_string());

            if let Some(child_path) = child_playlist_path {
                let resolved_child_url = if child_path.starts_with("http://") || child_path.starts_with("https://") {
                    child_path
                } else if let Ok(base) = reqwest::Url::parse(&current_playlist_url) {
                    base.join(&child_path).map(|u| u.to_string()).unwrap_or(child_path)
                } else {
                    child_path
                };

                if let Ok(child_resp) = self.http.get(&resolved_child_url).send().await {
                    if child_resp.status().is_success() {
                        if let Ok(child_bytes) = child_resp.bytes().await {
                            current_playlist_url = resolved_child_url;
                            m3u8_text = String::from_utf8_lossy(&child_bytes).to_string();
                        }
                    }
                }
            }

            let segment_urls: Vec<String> = m3u8_text
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty() && !l.starts_with('#'))
                .map(|l| {
                    if l.starts_with("http://") || l.starts_with("https://") {
                        l.to_string()
                    } else if let Ok(base) = reqwest::Url::parse(&current_playlist_url) {
                        base.join(l).map(|u| u.to_string()).unwrap_or_else(|_| l.to_string())
                    } else {
                        l.to_string()
                    }
                })
                .collect();

            if !segment_urls.is_empty() {
                let mut combined = Vec::new();
                for seg_url in segment_urls {
                    if let Ok(seg_resp) = self.http.get(&seg_url).send().await {
                        if seg_resp.status().is_success() {
                            if let Ok(seg_chunk) = seg_resp.bytes().await {
                                combined.extend_from_slice(&seg_chunk);
                            }
                        }
                    }
                }
                if !combined.is_empty() {
                    bytes = combined;
                }
            }
        }

        let size_bytes = bytes.len() as u64;

        fs::write(&dest_path, &bytes)
            .await
            .map_err(|e| DomainError::Storage(format!("Failed to write audio file: {}", e)))?;

        let file_path_str = dest_path.to_string_lossy().to_string();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let cached_entry = CachedTrack {
            track: track.clone(),
            file_path: file_path_str.clone(),
            size_bytes,
            cached_at: now,
        };

        {
            let mut index_guard = self.index.write().await;
            index_guard.insert(track.id, cached_entry);
        }

        self.persist_index().await?;

        Ok(file_path_str)
    }

    async fn get_all_cached(&self) -> Result<Vec<Track>, DomainError> {
        let index = self.index.read().await;
        let mut tracks: Vec<Track> = index
            .values()
            .filter(|e| PathBuf::from(&e.file_path).exists())
            .map(|e| e.track.clone())
            .collect();

        // Sort by artist and title
        tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        Ok(tracks)
    }

    async fn remove_cached(&self, track_id: u64) -> Result<(), DomainError> {
        let removed = {
            let mut index_guard = self.index.write().await;
            index_guard.remove(&track_id)
        };

        if let Some(entry) = removed {
            let path = PathBuf::from(entry.file_path);
            if path.exists() {
                let _ = fs::remove_file(path).await;
            }
            self.persist_index().await?;
        }

        Ok(())
    }

    async fn clear_cache(&self) -> Result<(), DomainError> {
        {
            let mut index_guard = self.index.write().await;
            index_guard.clear();
        }

        let _ = self.persist_index().await;

        if self.audio_dir.exists() {
            let mut entries = fs::read_dir(&self.audio_dir)
                .await
                .map_err(|e| DomainError::Storage(e.to_string()))?;

            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.is_file() {
                    let _ = fs::remove_file(path).await;
                }
            }
        }

        Ok(())
    }

    async fn get_cache_stats(&self) -> Result<CacheStats, DomainError> {
        let index = self.index.read().await;
        let mut total_size = 0u64;
        let mut count = 0usize;

        for entry in index.values() {
            let path = PathBuf::from(&entry.file_path);
            if path.exists() {
                count += 1;
                total_size += entry.size_bytes;
            }
        }

        Ok(CacheStats {
            total_tracks: count,
            total_size_bytes: total_size,
        })
    }
}
