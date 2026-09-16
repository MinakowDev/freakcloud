use std::path::PathBuf;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::fs;

use crate::domain::{errors::DomainError, ports::SessionRepository};

#[derive(Debug, Serialize, Deserialize)]
struct StoredSession {
    auth_token: String,
    updated_at: u64,
}

#[derive(Debug, Clone)]
pub struct FileSessionStorage {
    storage_path: PathBuf,
}

impl FileSessionStorage {
    pub fn default_path() -> Result<PathBuf, DomainError> {
        let base_dir = dirs::config_dir()
            .or_else(dirs::data_dir)
            .ok_or_else(|| DomainError::Storage("Could not locate user configuration directory".to_string()))?;
        
        let app_dir = base_dir.join("freakcloud");
        Ok(app_dir.join("session.json"))
    }

    pub fn new(storage_path: PathBuf) -> Self {
        Self { storage_path }
    }

    pub fn new_default() -> Result<Self, DomainError> {
        let path = Self::default_path()?;
        Ok(Self::new(path))
    }
}

#[async_trait]
impl SessionRepository for FileSessionStorage {
    async fn load_token(&self) -> Result<Option<String>, DomainError> {
        if !self.storage_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&self.storage_path)
            .await
            .map_err(|e| DomainError::Storage(format!("Failed to read session file: {}", e)))?;

        let stored: StoredSession = serde_json::from_str(&content)
            .map_err(|e| DomainError::Storage(format!("Failed to parse session file: {}", e)))?;

        if stored.auth_token.trim().is_empty() {
            Ok(None)
        } else {
            Ok(Some(stored.auth_token))
        }
    }

    async fn save_token(&self, token: &str) -> Result<(), DomainError> {
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| DomainError::Storage(format!("Failed to create config dir: {}", e)))?;
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let stored = StoredSession {
            auth_token: token.trim().to_string(),
            updated_at: now,
        };

        let json = serde_json::to_string_pretty(&stored)
            .map_err(|e| DomainError::Storage(format!("Failed to serialize session: {}", e)))?;

        fs::write(&self.storage_path, json)
            .await
            .map_err(|e| DomainError::Storage(format!("Failed to write session file: {}", e)))?;

        Ok(())
    }

    async fn clear_token(&self) -> Result<(), DomainError> {
        if self.storage_path.exists() {
            fs::remove_file(&self.storage_path)
                .await
                .map_err(|e| DomainError::Storage(format!("Failed to remove session file: {}", e)))?;
        }
        Ok(())
    }
}
