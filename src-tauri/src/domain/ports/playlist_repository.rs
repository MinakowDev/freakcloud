use async_trait::async_trait;

use crate::domain::{errors::DomainError, models::Playlist};

#[async_trait]
pub trait PlaylistRepository: Send + Sync {
    /// Получение всех сохраненных плейлистов
    async fn get_all(&self) -> Result<Vec<Playlist>, DomainError>;

    /// Получение плейлиста по ID
    async fn get_by_id(&self, id: u64) -> Result<Option<Playlist>, DomainError>;

    /// Сохранение (добавление или обновление) плейлиста
    async fn save(&self, playlist: Playlist) -> Result<(), DomainError>;

    /// Удаление сохраненного плейлиста
    async fn delete(&self, id: u64) -> Result<(), DomainError>;

    /// Проверка, сохранен ли плейлист
    async fn exists(&self, id: u64) -> Result<bool, DomainError>;
}
