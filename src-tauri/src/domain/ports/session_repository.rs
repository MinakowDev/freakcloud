use async_trait::async_trait;

use crate::domain::errors::DomainError;

#[async_trait]
pub trait SessionRepository: Send + Sync {
    /// Загрузить сохраненный токен авторизации
    async fn load_token(&self) -> Result<Option<String>, DomainError>;

    /// Сохранить токен авторизации
    async fn save_token(&self, token: &str) -> Result<(), DomainError>;

    /// Удалить сохраненную сессию
    async fn clear_token(&self) -> Result<(), DomainError>;
}
