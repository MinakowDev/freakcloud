use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::Session,
    ports::{SessionRepository, SoundCloudGateway},
};

pub struct AuthenticateUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
    session_repo: Arc<dyn SessionRepository>,
}

impl AuthenticateUseCase {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>, session_repo: Arc<dyn SessionRepository>) -> Self {
        Self {
            gateway,
            session_repo,
        }
    }

    /// Вход с OAuth-токеном SoundCloud
    pub async fn login_with_token(&self, token: &str) -> Result<Session, DomainError> {
        let clean_token = token.trim();
        if clean_token.is_empty() {
            return Err(DomainError::InvalidToken);
        }

        // Проверяем токен, применив его к клиенту и запросив профиль
        self.gateway.set_auth_token(Some(clean_token.to_string())).await?;
        
        match self.gateway.get_me().await {
            Ok(user) => {
                // Сохраняем сессию на диск
                self.session_repo.save_token(clean_token).await?;
                Ok(Session::authenticated(clean_token.to_string(), user))
            }
            Err(err) => {
                // Сбрасываем некорректный токен
                let _ = self.gateway.set_auth_token(None).await;
                Err(DomainError::SoundCloud(format!("Failed to verify token: {}", err)))
            }
        }
    }

    /// Выход из аккаунта
    pub async fn logout(&self) -> Result<Session, DomainError> {
        self.gateway.set_auth_token(None).await?;
        self.session_repo.clear_token().await?;
        Ok(Session::guest())
    }

    /// Восстановление текущей сессии при старте приложения
    pub async fn get_current_session(&self) -> Result<Session, DomainError> {
        if let Ok(Some(token)) = self.session_repo.load_token().await {
            self.gateway.set_auth_token(Some(token.clone())).await?;
            match self.gateway.get_me().await {
                Ok(user) => return Ok(Session::authenticated(token, user)),
                Err(_) => {
                    // Токен устарел или невалиден, очищаем
                    let _ = self.session_repo.clear_token().await;
                    let _ = self.gateway.set_auth_token(None).await;
                }
            }
        }

        Ok(Session::guest())
    }
}
