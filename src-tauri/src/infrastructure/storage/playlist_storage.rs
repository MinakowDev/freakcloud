use std::{collections::HashMap, path::PathBuf, sync::Arc};
use async_trait::async_trait;
use tokio::{fs, sync::RwLock};

use crate::domain::{
    errors::DomainError,
    models::Playlist,
    ports::PlaylistRepository,
};

#[derive(Debug, Clone)]
pub struct FilePlaylistStorage {
    storage_path: PathBuf,
    playlists: Arc<RwLock<HashMap<u64, Playlist>>>,
}

impl FilePlaylistStorage {
    pub fn default_path() -> Result<PathBuf, DomainError> {
        let base_dir = dirs::config_dir()
            .or_else(dirs::data_dir)
            .ok_or_else(|| DomainError::Storage("Could not locate user configuration directory".to_string()))?;

        let app_dir = base_dir.join("freakcloud");
        Ok(app_dir.join("playlists.json"))
    }

    pub async fn new_default() -> Result<Self, DomainError> {
        let path = Self::default_path()?;
        Self::new(path).await
    }

    pub async fn new(storage_path: PathBuf) -> Result<Self, DomainError> {
        if let Some(parent) = storage_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        let mut map = HashMap::new();
        if storage_path.exists() {
            if let Ok(content) = fs::read_to_string(&storage_path).await {
                if let Ok(loaded) = serde_json::from_str::<HashMap<u64, Playlist>>(&content) {
                    map = loaded;
                }
            }
        }

        Ok(Self {
            storage_path,
            playlists: Arc::new(RwLock::new(map)),
        })
    }

    async fn persist(&self) -> Result<(), DomainError> {
        let map_guard = self.playlists.read().await;
        let json = serde_json::to_string_pretty(&*map_guard)
            .map_err(|e| DomainError::Storage(format!("Failed to serialize playlists: {}", e)))?;

        if let Some(parent) = self.storage_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        fs::write(&self.storage_path, json)
            .await
            .map_err(|e| DomainError::Storage(format!("Failed to write playlists file: {}", e)))?;

        Ok(())
    }
}

#[async_trait]
impl PlaylistRepository for FilePlaylistStorage {
    async fn get_all(&self) -> Result<Vec<Playlist>, DomainError> {
        let guard = self.playlists.read().await;
        let mut list: Vec<Playlist> = guard.values().cloned().collect();
        // Sort stably by title or id
        list.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        Ok(list)
    }

    async fn get_by_id(&self, id: u64) -> Result<Option<Playlist>, DomainError> {
        let guard = self.playlists.read().await;
        Ok(guard.get(&id).cloned())
    }

    async fn save(&self, playlist: Playlist) -> Result<(), DomainError> {
        {
            let mut guard = self.playlists.write().await;
            guard.insert(playlist.id, playlist);
        }
        self.persist().await
    }

    async fn delete(&self, id: u64) -> Result<(), DomainError> {
        {
            let mut guard = self.playlists.write().await;
            guard.remove(&id);
        }
        self.persist().await
    }

    async fn exists(&self, id: u64) -> Result<bool, DomainError> {
        let guard = self.playlists.read().await;
        Ok(guard.contains_key(&id))
    }
}
