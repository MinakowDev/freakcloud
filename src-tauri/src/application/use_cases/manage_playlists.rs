use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::Playlist,
    ports::{PlaylistRepository, SoundCloudGateway},
};

pub struct ManagePlaylistsUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
    repo: Arc<dyn PlaylistRepository>,
}

impl ManagePlaylistsUseCase {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>, repo: Arc<dyn PlaylistRepository>) -> Self {
        Self { gateway, repo }
    }

    pub async fn search(&self, query: &str, limit: Option<u32>, offset: Option<u32>) -> Result<Vec<Playlist>, DomainError> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        self.gateway
            .search_playlists(trimmed, limit.unwrap_or(20), offset.unwrap_or(0))
            .await
    }

    pub async fn get_saved(&self) -> Result<Vec<Playlist>, DomainError> {
        self.repo.get_all().await
    }

    pub async fn get_details(&self, playlist_id: u64) -> Result<Playlist, DomainError> {
        // 1. Проверяем, есть ли плейлист в локальном хранилище с треками
        if let Ok(Some(saved)) = self.repo.get_by_id(playlist_id).await {
            if let Some(ref tracks) = saved.tracks {
                if !tracks.is_empty() {
                    return Ok(saved);
                }
            }
        }

        // 2. Получаем метаданные и треки из SoundCloud
        let mut playlist = match self.gateway.get_playlist(playlist_id).await {
            Ok(p) => p,
            Err(e) => {
                // Если офлайн, но есть сохраненный плейлист без треков — вернем его
                if let Ok(Some(saved)) = self.repo.get_by_id(playlist_id).await {
                    return Ok(saved);
                }
                return Err(e);
            }
        };

        if let Ok(tracks) = self.gateway.get_playlist_tracks(playlist_id).await {
            playlist.tracks = Some(tracks);
            // Если он уже в сохраненных — обновим его локально
            if self.repo.exists(playlist_id).await.unwrap_or(false) {
                let _ = self.repo.save(playlist.clone()).await;
            }
        }

        Ok(playlist)
    }

    pub async fn save(&self, mut playlist: Playlist) -> Result<(), DomainError> {
        // Если треков еще нет, попробуем загрузить их перед сохранением для офлайн-доступа
        if playlist.tracks.is_none() || playlist.tracks.as_ref().map(|t| t.is_empty()).unwrap_or(false) {
            if let Ok(tracks) = self.gateway.get_playlist_tracks(playlist.id).await {
                playlist.tracks = Some(tracks);
            }
        }

        self.repo.save(playlist).await
    }

    pub async fn remove(&self, playlist_id: u64) -> Result<(), DomainError> {
        self.repo.delete(playlist_id).await
    }

    pub async fn is_saved(&self, playlist_id: u64) -> Result<bool, DomainError> {
        self.repo.exists(playlist_id).await
    }
}
