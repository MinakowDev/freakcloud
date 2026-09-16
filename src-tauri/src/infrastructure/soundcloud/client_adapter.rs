use std::sync::Arc;
use async_trait::async_trait;
use tokio::sync::RwLock;

use rsoundcloud::{
    models::{track::Track as ScTrack, user::User as ScUser},
    CollectionParams, MeApi, PlaylistsApi, ResourceId, SearchApi, SoundCloudClient, TracksApi,
};

use crate::domain::{
    errors::DomainError,
    models::{Playlist, Track, UserProfile},
    ports::SoundCloudGateway,
};

pub struct RSoundCloudAdapter {
    client: Arc<RwLock<Option<SoundCloudClient>>>,
    http: reqwest::Client,
    current_token: Arc<RwLock<Option<String>>>,
    cached_client_id: Arc<RwLock<Option<String>>>,
}

impl RSoundCloudAdapter {
    pub async fn new(auth_token: Option<String>) -> Result<Self, DomainError> {
        let sc_client = match SoundCloudClient::new(None, auth_token.clone()).await {
            Ok(c) => Some(c),
            Err(e) => {
                eprintln!(
                    "SoundCloud client startup initialization deferred (offline / blocked): {:?}",
                    e
                );
                None
            }
        };

        // Cache client_id for raw HTTP requests (like/unlike need it as query param)
        let cached_client_id = match SoundCloudClient::generate_client_id().await {
            Ok(id) => Some(id),
            Err(_) => None,
        };

        let http = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| DomainError::Network(e.to_string()))?;

        Ok(Self {
            client: Arc::new(RwLock::new(sc_client)),
            http,
            current_token: Arc::new(RwLock::new(auth_token)),
            cached_client_id: Arc::new(RwLock::new(cached_client_id)),
        })
    }

    pub async fn ensure_client(&self) -> Result<(), DomainError> {
        {
            let guard = self.client.read().await;
            if guard.is_some() {
                return Ok(());
            }
        }

        let mut guard = self.client.write().await;
        if guard.is_none() {
            let token = self.current_token.read().await.clone();
            let sc_client = SoundCloudClient::new(None, token)
                .await
                .map_err(|e| DomainError::SoundCloud(format!("SoundCloud недоступен (проверьте подключение к сети или запустите zapret / VPN): {:?}", e)))?;
            *guard = Some(sc_client);
        }
        Ok(())
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
        self.ensure_client().await?;
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or_else(|| {
            DomainError::SoundCloud("SoundCloud недоступен (запустите zapret или проверьте сеть)".to_string())
        })?;
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

    async fn search_playlists(&self, query: &str, limit: u32, offset: u32) -> Result<Vec<Playlist>, DomainError> {
        self.ensure_client().await?;
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or_else(|| {
            DomainError::SoundCloud("SoundCloud недоступен (запустите zapret или проверьте сеть)".to_string())
        })?;
        let params = CollectionParams {
            limit: Some(limit),
            offset: Some(offset),
        };

        let items = client
            .search_playlists(query.to_string(), params)
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Search playlists failed: {:?}", e)))?;

        // Исключаем альбомы (is_album == false), чтобы возвращать только плейлисты
        let playlists = items
            .into_iter()
            .filter(|item| !item.album_playlist.is_album)
            .map(|item| Playlist {
                id: item.album_playlist.id,
                title: item.album_playlist.title,
                author: item.user.user.username,
                author_id: Some(item.user.user.id),
                duration_ms: (item.album_playlist.duration as u32).max(0),
                artwork_url: item.album_playlist.artwork_url,
                track_count: (item.album_playlist.track_count as u32).max(0),
                permalink_url: Some(item.album_playlist.permalink_url),
                is_album: false,
                tracks: None,
            })
            .collect();

        Ok(playlists)
    }

    async fn get_playlist(&self, playlist_id: u64) -> Result<Playlist, DomainError> {
        self.ensure_client().await?;
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or_else(|| {
            DomainError::SoundCloud("SoundCloud недоступен (запустите zapret или проверьте сеть)".to_string())
        })?;

        let p = client
            .get_playlist(ResourceId::Id(playlist_id))
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to get playlist {}: {:?}", playlist_id, e)))?;

        Ok(Playlist {
            id: p.album_playlist.id,
            title: p.album_playlist.title,
            author: p.user.username,
            author_id: Some(p.user.id),
            duration_ms: (p.album_playlist.duration as u32).max(0),
            artwork_url: p.album_playlist.artwork_url,
            track_count: (p.album_playlist.track_count as u32).max(0),
            permalink_url: Some(p.album_playlist.permalink_url),
            is_album: p.album_playlist.is_album,
            tracks: None,
        })
    }

    async fn get_playlist_tracks(&self, playlist_id: u64) -> Result<Vec<Track>, DomainError> {
        self.ensure_client().await?;
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or_else(|| {
            DomainError::SoundCloud("SoundCloud недоступен (запустите zapret или проверьте сеть)".to_string())
        })?;

        let tracks = client
            .get_playlist_tracks(ResourceId::Id(playlist_id))
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to get tracks for playlist {}: {:?}", playlist_id, e)))?;

        Ok(tracks.iter().map(Self::map_track).collect())
    }

    async fn get_track(&self, track_id: u64) -> Result<Track, DomainError> {
        self.ensure_client().await?;
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or_else(|| {
            DomainError::SoundCloud("SoundCloud недоступен (запустите zapret или проверьте сеть)".to_string())
        })?;
        let sc_track = client
            .get_track(ResourceId::Id(track_id))
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to get track {}: {:?}", track_id, e)))?;

        Ok(Self::map_track(&sc_track))
    }

    async fn resolve_stream_url(&self, track_id: u64) -> Result<String, DomainError> {
        self.ensure_client().await?;
        let sc_track = {
            let client_guard = self.client.read().await;
            let client = client_guard.as_ref().ok_or_else(|| {
                DomainError::SoundCloud("SoundCloud недоступен (запустите zapret или проверьте сеть)".to_string())
            })?;
            client
                .get_track(ResourceId::Id(track_id))
                .await
                .map_err(|e| DomainError::SoundCloud(format!("Failed to fetch track {}: {:?}", track_id, e)))?
        };

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
        self.ensure_client().await?;
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or_else(|| {
            DomainError::SoundCloud("SoundCloud недоступен (запустите zapret или проверьте сеть)".to_string())
        })?;
        let me = client
            .get_me()
            .await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to get user profile: {:?}", e)))?;

        Ok(Self::map_user(&me))
    }

    async fn get_my_likes(&self, limit: u32) -> Result<Vec<Track>, DomainError> {
        let token = match self.current_token.read().await.as_ref() {
            Some(t) if !t.trim().is_empty() => t.trim().to_string(),
            _ => return Err(DomainError::Unauthorized),
        };

        let me = self.get_me().await?;

        #[derive(serde::Deserialize)]
        struct LikeUserData {
            id: Option<u64>,
            username: Option<String>,
        }

        #[derive(serde::Deserialize)]
        struct LikeTrackData {
            id: u64,
            title: String,
            user: LikeUserData,
            duration: u64,
            artwork_url: Option<String>,
            waveform_url: Option<String>,
            playback_count: Option<u64>,
            likes_count: Option<u64>,
            genre: Option<String>,
            permalink_url: Option<String>,
        }

        #[derive(serde::Deserialize)]
        struct LikeCollectionItem {
            track: Option<LikeTrackData>,
            id: Option<u64>,
            title: Option<String>,
            user: Option<LikeUserData>,
            duration: Option<u64>,
            artwork_url: Option<String>,
            waveform_url: Option<String>,
            playback_count: Option<u64>,
            likes_count: Option<u64>,
            genre: Option<String>,
            permalink_url: Option<String>,
        }

        #[derive(serde::Deserialize)]
        struct LikesApiResponse {
            collection: Vec<LikeCollectionItem>,
        }

        let limit = if limit == 0 { 50 } else { limit };
        let url = format!("https://api-v2.soundcloud.com/users/{}/track_likes?limit={}", me.id, limit);

        let resp = match self.http.get(&url).header("Authorization", format!("OAuth {}", token)).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => {
                let fallback_url = format!("https://api-v2.soundcloud.com/me/likes/tracks?limit={}", limit);
                self.http.get(&fallback_url)
                    .header("Authorization", format!("OAuth {}", token))
                    .send()
                    .await
                    .map_err(|e| DomainError::Network(format!("Failed to fetch likes: {}", e)))?
            }
        };

        if !resp.status().is_success() {
            return Err(DomainError::SoundCloud(format!("Failed to fetch likes, HTTP {}", resp.status())));
        }

        let data: LikesApiResponse = resp.json().await
            .map_err(|e| DomainError::SoundCloud(format!("Failed to parse likes response: {}", e)))?;

        let mut tracks = Vec::new();
        for item in data.collection {
            if let Some(t) = item.track {
                tracks.push(Track {
                    id: t.id,
                    title: t.title,
                    artist: t.user.username.unwrap_or_else(|| "SoundCloud Artist".to_string()),
                    artist_id: t.user.id,
                    duration_ms: t.duration as u32,
                    artwork_url: t.artwork_url,
                    waveform_url: t.waveform_url,
                    stream_url: None,
                    playback_count: t.playback_count,
                    likes_count: t.likes_count,
                    genre: t.genre,
                    permalink_url: t.permalink_url.unwrap_or_default(),
                });
            } else if let Some(id) = item.id {
                let (artist, artist_id) = match item.user {
                    Some(u) => (u.username.unwrap_or_else(|| "SoundCloud Artist".to_string()), u.id),
                    None => ("SoundCloud Artist".to_string(), None),
                };
                tracks.push(Track {
                    id,
                    title: item.title.unwrap_or_else(|| "Unknown Track".to_string()),
                    artist,
                    artist_id,
                    duration_ms: item.duration.unwrap_or(0) as u32,
                    artwork_url: item.artwork_url,
                    waveform_url: item.waveform_url,
                    stream_url: None,
                    playback_count: item.playback_count,
                    likes_count: item.likes_count,
                    genre: item.genre,
                    permalink_url: item.permalink_url.unwrap_or_default(),
                });
            }
        }

        Ok(tracks)
    }

    async fn get_trending(&self, genre: Option<&str>, limit: u32) -> Result<Vec<Track>, DomainError> {
        let query = genre.unwrap_or("electronic");
        self.search_tracks(query, limit, 0).await
    }

    async fn set_auth_token(&self, token: Option<String>) -> Result<(), DomainError> {
        let mut client_guard = self.client.write().await;
        *self.current_token.write().await = token.clone();

        match SoundCloudClient::new(None, token.clone()).await {
            Ok(mut new_client) => {
                new_client.set_auth_token(token);
                *client_guard = Some(new_client);
                Ok(())
            }
            Err(e) => {
                *client_guard = None;
                Err(DomainError::SoundCloud(format!("Failed to re-initialize client: {:?}", e)))
            }
        }
    }

    async fn like_track(&self, track_id: u64) -> Result<(), DomainError> {
        let token = match self.current_token.read().await.as_ref() {
            Some(t) if !t.trim().is_empty() => t.trim().to_string(),
            _ => return Err(DomainError::Unauthorized),
        };

        // Lazily populate client_id cache
        if self.cached_client_id.read().await.is_none() {
            if let Ok(id) = SoundCloudClient::generate_client_id().await {
                *self.cached_client_id.write().await = Some(id);
            }
        }
        let client_id = self.cached_client_id.read().await.clone().unwrap_or_default();

        // 1. Primary v2 API: PUT https://api-v2.soundcloud.com/likes/tracks/{track_id}?client_id=...
        if !client_id.is_empty() {
            let v2_url = format!(
                "https://api-v2.soundcloud.com/likes/tracks/{}?client_id={}",
                track_id, client_id
            );
            let resp = self.http.put(&v2_url)
                .header("Authorization", format!("OAuth {}", token))
                .header("Accept", "application/json")
                .header("Origin", "https://soundcloud.com")
                .header("Referer", "https://soundcloud.com/")
                .header("Content-Length", "0")
                .send()
                .await;

            if let Ok(r) = resp {
                let status = r.status().as_u16();
                if r.status().is_success() || status == 200 || status == 201 || status == 204 {
                    return Ok(());
                }
                eprintln!("[like_track] v2 PUT /likes/tracks/{} failed: {}", track_id, status);
            }

            // Also try POST if PUT fails
            let resp_post = self.http.post(&v2_url)
                .header("Authorization", format!("OAuth {}", token))
                .header("Accept", "application/json")
                .header("Origin", "https://soundcloud.com")
                .header("Referer", "https://soundcloud.com/")
                .header("Content-Length", "0")
                .send()
                .await;

            if let Ok(r) = resp_post {
                let status = r.status().as_u16();
                if r.status().is_success() || status == 200 || status == 201 || status == 204 {
                    return Ok(());
                }
                eprintln!("[like_track] v2 POST /likes/tracks/{} failed: {}", track_id, status);
            }
        }

        // 2. Fallback: v1 Public API POST https://api.soundcloud.com/likes/tracks/{track_id}
        let fallback_url = format!(
            "https://api.soundcloud.com/likes/tracks/{}?client_id={}&oauth_token={}",
            track_id, client_id, token
        );
        let resp = self.http.post(&fallback_url)
            .header("Content-Length", "0")
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Failed to like track: {}", e)))?;

        let status = resp.status().as_u16();
        if resp.status().is_success() || status == 200 || status == 201 || status == 204 {
            Ok(())
        } else {
            Err(DomainError::SoundCloud(format!("Failed to like track, HTTP {}", resp.status())))
        }
    }

    async fn unlike_track(&self, track_id: u64) -> Result<(), DomainError> {
        let token = match self.current_token.read().await.as_ref() {
            Some(t) if !t.trim().is_empty() => t.trim().to_string(),
            _ => return Err(DomainError::Unauthorized),
        };

        if self.cached_client_id.read().await.is_none() {
            if let Ok(id) = SoundCloudClient::generate_client_id().await {
                *self.cached_client_id.write().await = Some(id);
            }
        }
        let client_id = self.cached_client_id.read().await.clone().unwrap_or_default();

        // 1. Primary v2 API: DELETE https://api-v2.soundcloud.com/likes/tracks/{track_id}?client_id=...
        if !client_id.is_empty() {
            let v2_url = format!(
                "https://api-v2.soundcloud.com/likes/tracks/{}?client_id={}",
                track_id, client_id
            );
            let resp = self.http.delete(&v2_url)
                .header("Authorization", format!("OAuth {}", token))
                .header("Accept", "application/json")
                .header("Origin", "https://soundcloud.com")
                .header("Referer", "https://soundcloud.com/")
                .send()
                .await;

            if let Ok(r) = resp {
                let status = r.status().as_u16();
                if r.status().is_success() || status == 200 || status == 204 {
                    return Ok(());
                }
                eprintln!("[unlike_track] v2 DELETE /likes/tracks/{} failed: {}", track_id, status);
            }
        }

        // 2. Fallback: v1 Public API DELETE https://api.soundcloud.com/likes/tracks/{track_id}
        let fallback_url = format!(
            "https://api.soundcloud.com/likes/tracks/{}?client_id={}&oauth_token={}",
            track_id, client_id, token
        );
        let resp = self.http.delete(&fallback_url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Failed to unlike track: {}", e)))?;

        let status = resp.status().as_u16();
        if resp.status().is_success() || status == 200 || status == 204 {
            Ok(())
        } else {
            Err(DomainError::SoundCloud(format!("Failed to unlike track, HTTP {}", resp.status())))
        }
    }


    async fn get_related_tracks(&self, track_id: u64, limit: u32) -> Result<Vec<Track>, DomainError> {
        #[derive(serde::Deserialize)]
        struct RelatedUserData {
            id: Option<u64>,
            username: Option<String>,
        }

        #[derive(serde::Deserialize)]
        struct RelatedTrackData {
            id: u64,
            title: String,
            user: RelatedUserData,
            duration: u64,
            artwork_url: Option<String>,
            waveform_url: Option<String>,
            playback_count: Option<u64>,
            likes_count: Option<u64>,
            genre: Option<String>,
            permalink_url: Option<String>,
        }

        #[derive(serde::Deserialize)]
        struct RelatedItem {
            track: Option<RelatedTrackData>,
            id: Option<u64>,
            title: Option<String>,
            user: Option<RelatedUserData>,
            duration: Option<u64>,
            artwork_url: Option<String>,
            waveform_url: Option<String>,
            playback_count: Option<u64>,
            likes_count: Option<u64>,
            genre: Option<String>,
            permalink_url: Option<String>,
        }

        #[derive(serde::Deserialize)]
        struct RelatedResponse {
            collection: Option<Vec<RelatedItem>>,
        }

        let limit = if limit == 0 { 20 } else { limit };
        let station_url = format!("https://api-v2.soundcloud.com/stations/soundcloud:track-stations:{}/tracks?limit={}", track_id, limit);
        let related_url = format!("https://api-v2.soundcloud.com/tracks/{}/related?limit={}", track_id, limit);

        let token = self.current_token.read().await.clone();

        let mut data: Option<RelatedResponse> = None;

        // 1. Попытка получить через track-stations (дает более высокое качество подборки и радио-поток)
        let mut req = self.http.get(&station_url).header("Accept", "application/json");
        if let Some(ref t) = token {
            if !t.trim().is_empty() {
                req = req.header("Authorization", format!("OAuth {}", t.trim()));
            }
        }

        if let Ok(resp) = req.send().await {
            if resp.status().is_success() {
                if let Ok(parsed) = resp.json::<RelatedResponse>().await {
                    if let Some(ref col) = parsed.collection {
                        if !col.is_empty() {
                            data = Some(parsed);
                        }
                    }
                }
            }
        }

        // 2. Если track-stations не вернул треков, пробуем fallback на /tracks/{id}/related
        if data.is_none() {
            let mut req = self.http.get(&related_url).header("Accept", "application/json");
            if let Some(ref t) = token {
                if !t.trim().is_empty() {
                    req = req.header("Authorization", format!("OAuth {}", t.trim()));
                }
            }
            if let Ok(resp) = req.send().await {
                if resp.status().is_success() {
                    if let Ok(parsed) = resp.json::<RelatedResponse>().await {
                        data = Some(parsed);
                    }
                }
            }
        }

        let data = data.ok_or_else(|| DomainError::SoundCloud("Failed to fetch tracks from track-station or related".to_string()))?;

        let mut tracks = Vec::new();
        if let Some(items) = data.collection {
            for item in items {
                if let Some(t) = item.track {
                    tracks.push(Track {
                        id: t.id,
                        title: t.title,
                        artist: t.user.username.unwrap_or_else(|| "SoundCloud Artist".to_string()),
                        artist_id: t.user.id,
                        duration_ms: t.duration as u32,
                        artwork_url: t.artwork_url,
                        waveform_url: t.waveform_url,
                        stream_url: None,
                        playback_count: t.playback_count,
                        likes_count: t.likes_count,
                        genre: t.genre,
                        permalink_url: t.permalink_url.unwrap_or_default(),
                    });
                } else if let Some(id) = item.id {
                    let (artist, artist_id) = match item.user {
                        Some(u) => (u.username.unwrap_or_else(|| "SoundCloud Artist".to_string()), u.id),
                        None => ("SoundCloud Artist".to_string(), None),
                    };
                    tracks.push(Track {
                        id,
                        title: item.title.unwrap_or_else(|| "Unknown Track".to_string()),
                        artist,
                        artist_id,
                        duration_ms: item.duration.unwrap_or(0) as u32,
                        artwork_url: item.artwork_url,
                        waveform_url: item.waveform_url,
                        stream_url: None,
                        playback_count: item.playback_count,
                        likes_count: item.likes_count,
                        genre: item.genre,
                        permalink_url: item.permalink_url.unwrap_or_default(),
                    });
                }
            }
        }

        Ok(tracks)
    }

    async fn is_authenticated(&self) -> bool {
        self.current_token.read().await.is_some()
    }
}
