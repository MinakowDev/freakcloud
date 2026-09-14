use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: u64,
    pub username: String,
    pub full_name: Option<String>,
    pub avatar_url: Option<String>,
    pub permalink_url: String,
    pub followers_count: Option<u64>,
    pub track_count: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Session {
    pub auth_token: Option<String>,
    pub user: Option<UserProfile>,
    pub is_authenticated: bool,
}

impl Session {
    pub fn guest() -> Self {
        Self {
            auth_token: None,
            user: None,
            is_authenticated: false,
        }
    }

    pub fn authenticated(auth_token: String, user: UserProfile) -> Self {
        Self {
            auth_token: Some(auth_token),
            user: Some(user),
            is_authenticated: true,
        }
    }
}
