use async_trait::async_trait;

use crate::domain::{
    errors::DomainError,
    models::{CacheStats, Track},
};

#[async_trait]
pub trait AudioCacheGateway: Send + Sync {
    /// Проверить, сохранен ли трек в локальном кэше
    async fn is_cached(&self, track_id: u64) -> bool;

    /// Получить локальный путь к кэшированному аудиофайлу, если он существует
    async fn get_cached_path(&self, track_id: u64) -> Result<Option<String>, DomainError>;

    /// Скачать и сохранить трек в локальный кэш
    async fn download_and_cache(&self, track: &Track, stream_url: &str) -> Result<String, DomainError>;

    /// Получить список всех сохраненных в кэш треков
    async fn get_all_cached(&self) -> Result<Vec<Track>, DomainError>;

    /// Удалить трек из локального кэша
    async fn remove_cached(&self, track_id: u64) -> Result<(), DomainError>;

    /// Полностью очистить локальный кэш аудио
    async fn clear_cache(&self) -> Result<(), DomainError>;

    /// Получить статистику использования дискового пространства кэшем
    async fn get_cache_stats(&self) -> Result<CacheStats, DomainError>;
}
