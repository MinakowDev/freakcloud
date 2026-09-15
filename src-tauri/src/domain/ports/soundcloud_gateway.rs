use async_trait::async_trait;

use crate::domain::{
    errors::DomainError,
    models::{Track, UserProfile},
};

#[async_trait]
pub trait SoundCloudGateway: Send + Sync {
    /// Поиск треков по запросу
    async fn search_tracks(&self, query: &str, limit: u32, offset: u32) -> Result<Vec<Track>, DomainError>;

    /// Получение информации о треке по его ID
    async fn get_track(&self, track_id: u64) -> Result<Track, DomainError>;

    /// Получение прямой ссылки на аудиопоток (progressive MP3) для воспроизведения
    async fn resolve_stream_url(&self, track_id: u64) -> Result<String, DomainError>;

    /// Получение профиля авторизованного пользователя
    async fn get_me(&self) -> Result<UserProfile, DomainError>;

    /// Получение списка понравившихся треков пользователя
    async fn get_my_likes(&self, limit: u32) -> Result<Vec<Track>, DomainError>;

    /// Получение трендовых/популярных треков для главной страницы
    async fn get_trending(&self, genre: Option<&str>, limit: u32) -> Result<Vec<Track>, DomainError>;

    /// Установка или сброс токена авторизации в клиенте
    async fn set_auth_token(&self, token: Option<String>) -> Result<(), DomainError>;

    /// Добавление трека в понравившиеся
    async fn like_track(&self, track_id: u64) -> Result<(), DomainError>;

    /// Удаление трека из понравившихся
    async fn unlike_track(&self, track_id: u64) -> Result<(), DomainError>;

    /// Получение похожих/рекомендованных треков (SoundCloud Related Tracks)
    async fn get_related_tracks(&self, track_id: u64, limit: u32) -> Result<Vec<Track>, DomainError>;

    /// Проверка, активен ли токен авторизации
    async fn is_authenticated(&self) -> bool;
}
