use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::RwLock;

use rsoundcloud::{
    models::{track::Track as ScTrack, user::User as ScUser},
    CollectionParams, MeApi, ResourceId, SearchApi, SoundCloudClient, TracksApi,
};

use crate::domain::{
    errors::DomainError,
    models::{Track, UserProfile},
    ports::SoundCloudGateway,
};

pub struct RSoundCloudAdapter {
    client: Arc<RwLock<SoundCloudClient>>,
    http: reqwest::Client,
    current_token: Arc<RwLock<Option<String>>>,
}

impl RSoundCloudAdapter {
    pub async fn new(auth_token: Option<String>) -> Result<Self, DomainError> {
        let sc_client = SoundCloudClient::new(None, auth_token.clone())
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to initialize SoundCloud client: {:?}", e)))?;

        let http = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| DomainError::Network(e.to_string()))?;

        Ok(Self {
            client: Arc::new(RwLock::new(sc_client)),
            http,
            current_token: Arc::new(RwLock::new(auth_token)),
        })
    }

    fn map_track(sc: &ScTrack) -> Track {
        Track {
            id: sc.track.id,
            title: sc.track.title.clone(),
            artist: sc.user.username.clone(),
            artist_id: Some(sc.user.id),
            duration_ms: sc.track.duration as u32,
            artwork_url: sc.track.artwork_url.clone(),
            waveform_url: Some(sc.track.waveform_url.clone()),
            stream_url: None,
            playback_count: sc.track.playback_count.map(|c| c as u64),
            likes_count: sc.track.likes_count.map(|c| c as u64),
            genre: sc.track.genre.clone(),
            permalink_url: sc.track.permalink_url.clone(),
        }
    }

    fn map_user(u: &ScUser) -> UserProfile {
        UserProfile {
            id: u.user.id,
            username: u.user.username.clone(),
            full_name: Some(u.user.full_name.clone()),
            avatar_url: Some(u.user.avatar_url.clone()),
            permalink_url: u.user.permalink_url.clone(),
            followers_count: Some(u.user.followers_count as u64),
            track_count: Some(u.track_count as u64),
        }
    }
}

#[async_trait]
impl SoundCloudGateway for RSoundCloudAdapter {
    async fn search_tracks(&self, query: &str, limit: u32, offset: u32) -> Result<Vec<Track>, DomainError> {
        let client = self.client.read().await;
        let params = CollectionParams {
            limit: Some(limit),
            offset: Some(offset),
        };

        let tracks = client
            .search_tracks(query.to_string(), params)
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Search failed: {:?}", e)))?;

        Ok(tracks.iter().map(Self::map_track).collect())
    }

    async fn get_track(&self, track_id: u64) -> Result<Track, DomainError> {
        let client = self.client.read().await;
        let sc_track = client
            .get_track(ResourceId::Id(track_id))
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to get track {}: {:?}", track_id, e)))?;

        Ok(Self::map_track(&sc_track))
    }

    async fn resolve_stream_url(&self, track_id: u64) -> Result<String, DomainError> {
        let client = self.client.read().await;
        let sc_track = client
            .get_track(ResourceId::Id(track_id))
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to fetch track {}: {:?}", track_id, e)))?;

        // Find progressive MP3 or HLS stream transcoding from track media
        let transcodings = &sc_track.track.media.transcodings;
        let target_transcoding = transcodings
            .iter()
            .find(|t| t.format.protocol == "progressive" && t.format.mime_type.contains("audio/mpeg"))
            .or_else(|| transcodings.iter().find(|t| t.format.protocol == "progressive"))
            .or_else(|| transcodings.first())
            .ok_or_else(|| DomainError::StreamNotAvailable(track_id))?;

        // Resolve stream URL using client_id / auth token
        let mut req = self.http.get(&target_transcoding.url);
        
        // Append client_id or authorization
        if let Some(token) = self.current_token.read().await.as_ref() {
            req = req.header("Authorization", format!("OAuth {}", token));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Failed to resolve stream link: {}", e)))?;

        #[derive(serde::Deserialize)]
        struct StreamResponse {
            url: String,
        }

        let stream_data: StreamResponse = resp
            .json()
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to parse stream URL response: {}", e)))?;

        Ok(stream_data.url)
    }

    async fn get_me(&self) -> Result<UserProfile, DomainError> {
        let client = self.client.read().await;
        let me = client
            .get_me()
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to get user profile: {:?}", e)))?;

        Ok(Self::map_user(&me))
    }

    async fn get_my_likes(&self, limit: u32) -> Result<Vec<Track>, DomainError> {
        let _ = limit;
        // If authenticated, we can return recent likes; for now returns an empty list or searches library
        Ok(Vec::new())
    }

    async fn get_trending(&self, genre: Option<&str>, limit: u32) -> Result<Vec<Track>, DomainError> {
        let query = genre.unwrap_or("electronic");
        self.search_tracks(query, limit, 0).await
    }

    async fn set_auth_token(&self, token: Option<String>) -> Result<(), DomainError> {
        let mut client_guard = self.client.write().await;
        let mut new_client = SoundCloudClient::new(None, token.clone())
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to re-initialize client: {:?}", e)))?;
        
        new_client.set_auth_token(token.clone());
        *client_guard = new_client;
        *self.current_token.write().await = token;
        Ok(())
    }

    async fn is_authenticated(&self) -> bool {
        self.current_token.read().await.is_some()
    }
}
