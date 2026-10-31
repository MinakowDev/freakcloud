use std::time::Duration;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::errors::DomainError;

const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalTrackMeta {
    pub title: String,
    pub artist: String,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalPlaylistMeta {
    pub service: String, // "yandex", "spotify"
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub tracks: Vec<ExternalTrackMeta>,
}

pub struct ExternalImporter {
    client: reqwest::Client,
}

impl Default for ExternalImporter {
    fn default() -> Self {
        Self::new()
    }
}

impl ExternalImporter {
    pub fn new() -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_UA));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json, text/html, */*"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(12))
            .connect_timeout(Duration::from_secs(6))
            .build()
            .unwrap_or_default();

        Self { client }
    }

    /// Определяет источник и извлекает метаданные треков по ссылке
    pub async fn parse_input(&self, input: &str, custom_title: Option<String>) -> Result<ExternalPlaylistMeta, DomainError> {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            return Err(DomainError::Validation("Введите ссылку на плейлист или альбом".to_string()));
        }

        let mut meta = if trimmed.contains("music.yandex.") {
            self.fetch_yandex_music(trimmed).await?
        } else if trimmed.contains("spotify.com") {
            self.fetch_spotify(trimmed).await?
        } else {
            return Err(DomainError::Validation(
                "Поддерживаются только ссылки Яндекс Музыки и Spotify (например: https://music.yandex.ru/playlists/... или https://open.spotify.com/playlist/...)".to_string(),
            ));
        };

        if let Some(ct) = custom_title {
            if !ct.trim().is_empty() {
                meta.title = ct.trim().to_string();
            }
        }

        Ok(meta)
    }

    /// Парсинг ссылок Яндекс Музыки
    pub async fn fetch_yandex_music(&self, url_str: &str) -> Result<ExternalPlaylistMeta, DomainError> {
        let url = reqwest::Url::parse(url_str)
            .map_err(|e| DomainError::Validation(format!("Некорректная ссылка Яндекс Музыки: {}", e)))?;

        let path = url.path();
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

        // Форматы ссылок:
        // 1. /users/{owner}/playlists/{kind}
        // 2. /playlists/lk.{uuid} или /playlists/{kind_or_uuid}
        // 3. /album/{album_id}
        // 4. /album/{album_id}/track/{track_id}

        if let Some(pos) = segments.iter().position(|&s| s == "playlists") {
            // Формат 1: /users/{owner}/playlists/{kind}
            if pos >= 2 && segments[pos - 2] == "users" && segments.len() > pos + 1 {
                let owner = segments[pos - 1];
                let kind = segments[pos + 1];
                return self.fetch_yandex_playlist_by_owner_kind(owner, kind).await;
            }

            // Формат 2: /playlists/lk.<uuid> или /playlists/<id>
            if segments.len() > pos + 1 {
                let page_ref = segments[pos + 1];
                return self.fetch_yandex_playlist_by_page(url_str, page_ref).await;
            }
        }

        if let Some(pos) = segments.iter().position(|&s| s == "album") {
            if segments.len() > pos + 1 {
                let album_id = segments[pos + 1];
                let single_track_id = if segments.len() > pos + 3 && segments[pos + 2] == "track" {
                    Some(segments[pos + 3])
                } else {
                    None
                };
                return self.fetch_yandex_album(album_id, single_track_id).await;
            }
        }

        Err(DomainError::Validation(
            "Не удалось распознать тип ссылки Яндекс Музыки. Поддерживаются плейлисты (/playlists/..., /users/.../playlists/...) и альбомы (/album/...)".to_string(),
        ))
    }

    /// Загрузка публичной страницы плейлиста Яндекс Музыки с извлечением uid и kind
    async fn fetch_yandex_playlist_by_page(&self, original_url: &str, page_ref: &str) -> Result<ExternalPlaylistMeta, DomainError> {
        let page_url = if original_url.starts_with("http") {
            original_url.to_string()
        } else {
            format!("https://music.yandex.ru/playlists/{}", page_ref)
        };

        let resp = self.client.get(&page_url)
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Ошибка загрузки страницы плейлиста Яндекс Музыки: {}", e)))?;

        if !resp.status().is_success() {
            return Err(DomainError::ExternalService(format!(
                "Яндекс Музыка вернула статус {} при открытии страницы плейлиста",
                resp.status()
            )));
        }

        let html = resp.text().await.map_err(|e| {
            DomainError::ExternalService(format!("Ошибка чтения HTML Яндекс Музыки: {}", e))
        })?;

        // Извлекаем uid и kind из HTML
        if let Some((uid, kind)) = self.extract_yandex_uid_kind(&html) {
            return self.fetch_yandex_playlist_by_owner_kind(&uid, &kind).await;
        }

        Err(DomainError::ExternalService(
            "Не удалось распознать плейлист Яндекс Музыки по данной ссылке. Возможно, плейлист скрыт или ссылка недоступна.".to_string()
        ))
    }

    fn extract_yandex_uid_kind(&self, html: &str) -> Option<(String, String)> {
        let mut pos = 0;
        while let Some(uid_idx) = html[pos..].find("\"uid\":") {
            let abs_uid = pos + uid_idx;
            let after_uid = &html[abs_uid + 6..];
            let uid_str: String = after_uid.chars().take_while(|c| c.is_ascii_digit()).collect();
            if !uid_str.is_empty() {
                let window_len = after_uid.len().min(200);
                let window = &after_uid[..window_len];
                if let Some(kind_idx) = window.find("\"kind\":") {
                    let after_kind = &window[kind_idx + 7..];
                    let kind_str: String = after_kind.chars().take_while(|c| c.is_ascii_digit()).collect();
                    if !kind_str.is_empty() {
                        return Some((uid_str, kind_str));
                    }
                }
            }
            pos = abs_uid + 6;
        }
        None
    }

    async fn fetch_yandex_playlist_by_owner_kind(&self, owner: &str, kind: &str) -> Result<ExternalPlaylistMeta, DomainError> {
        // Попытка 1: официальное мобильное REST API
        let api_url = format!("https://api.music.yandex.net/users/{}/playlists/{}", owner, kind);
        if let Ok(resp) = self.client.get(&api_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<Value>().await {
                    if let Some(res) = json.get("result") {
                        if let Some(meta) = self.parse_yandex_playlist_object(res) {
                            return Ok(meta);
                        }
                    }
                }
            }
        }

        // Попытка 2: веб-хэндлер playlist.jsx
        let handler_url = format!(
            "https://music.yandex.ru/handlers/playlist.jsx?owner={}&kinds={}&light=true",
            owner, kind
        );

        let resp2 = self.client.get(&handler_url)
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Ошибка запроса к Яндекс Музыке: {}", e)))?;

        if !resp2.status().is_success() {
            return Err(DomainError::ExternalService(format!(
                "Яндекс Музыка вернула статус {}. Возможно, плейлист является приватным.",
                resp2.status()
            )));
        }

        let json2: Value = resp2.json().await.map_err(|e| {
            DomainError::ExternalService(format!("Не удалось разобрать ответ Яндекс Музыки: {}", e))
        })?;

        let playlist = json2.get("playlist").ok_or_else(|| {
            DomainError::ExternalService("Плейлист Яндекс Музыки не найден или скрыт".to_string())
        })?;

        self.parse_yandex_playlist_object(playlist).ok_or_else(|| {
            DomainError::ExternalService("Не удалось извлечь треки из плейлиста Яндекс Музыки".to_string())
        })
    }

    fn parse_yandex_playlist_object(&self, playlist: &Value) -> Option<ExternalPlaylistMeta> {
        let title = playlist.get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Плейлист Яндекс Музыки")
            .to_string();

        let description = playlist.get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let cover_url = playlist.get("ogImage")
            .or_else(|| playlist.pointer("/cover/uri"))
            .and_then(|v| v.as_str())
            .map(|img| {
                let clean = img.replace("%%", "400x400");
                if clean.starts_with("http") { clean } else { format!("https://{}", clean) }
            });

        let mut tracks = Vec::new();
        if let Some(raw_tracks) = playlist.get("tracks").and_then(|t| t.as_array()) {
            for t in raw_tracks {
                let track_node = t.get("track").unwrap_or(t);
                if let Some(meta) = self.parse_yandex_track_node(track_node) {
                    tracks.push(meta);
                }
            }
        }

        if tracks.is_empty() {
            return None;
        }

        // Ограничиваем разумным лимитом 250 треков во избежание чрезмерной нагрузки на SoundCloud
        if tracks.len() > 250 {
            tracks.truncate(250);
        }

        Some(ExternalPlaylistMeta {
            service: "yandex".to_string(),
            title,
            description,
            cover_url,
            tracks,
        })
    }

    async fn fetch_yandex_album(&self, album_id: &str, single_track_id: Option<&str>) -> Result<ExternalPlaylistMeta, DomainError> {
        let handler_url = format!("https://music.yandex.ru/handlers/album.jsx?album={}", album_id);

        let resp = self.client.get(&handler_url)
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Ошибка запроса к альбому Яндекс Музыки: {}", e)))?;

        if !resp.status().is_success() {
            return Err(DomainError::ExternalService(format!(
                "Альбом Яндекс Музыки вернул статус {}",
                resp.status()
            )));
        }

        let json: Value = resp.json().await.map_err(|e| {
            DomainError::ExternalService(format!("Не удалось разобрать альбом Яндекс Музыки: {}", e))
        })?;

        let title = json.get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Альбом Яндекс Музыки")
            .to_string();

        let cover_url = json.get("ogImage")
            .and_then(|v| v.as_str())
            .map(|img| {
                let clean = img.replace("%%", "400x400");
                if clean.starts_with("http") { clean } else { format!("https://{}", clean) }
            });

        let mut tracks = Vec::new();

        if let Some(volumes) = json.get("volumes").and_then(|v| v.as_array()) {
            for vol in volumes {
                if let Some(track_list) = vol.as_array() {
                    for t in track_list {
                        if let Some(meta) = self.parse_yandex_track_node(t) {
                            if let Some(req_id) = single_track_id {
                                let tid_str = t.get("id").and_then(|i| i.as_u64()).map(|i| i.to_string());
                                if tid_str.as_deref() == Some(req_id) {
                                    tracks.push(meta);
                                    break;
                                }
                            } else {
                                tracks.push(meta);
                            }
                        }
                    }
                }
            }
        }

        if tracks.is_empty() {
            return Err(DomainError::ExternalService("В альбоме Яндекс Музыки не найдены треки".to_string()));
        }

        if tracks.len() > 250 {
            tracks.truncate(250);
        }

        Ok(ExternalPlaylistMeta {
            service: "yandex".to_string(),
            title,
            description: None,
            cover_url,
            tracks,
        })
    }

    fn parse_yandex_track_node(&self, t: &Value) -> Option<ExternalTrackMeta> {
        let title_raw = t.get("title").and_then(|v| v.as_str())?;
        let version = t.get("version").and_then(|v| v.as_str());
        let full_title = if let Some(v) = version {
            format!("{} ({})", title_raw, v)
        } else {
            title_raw.to_string()
        };

        let mut artists = Vec::new();
        if let Some(arr) = t.get("artists").and_then(|a| a.as_array()) {
            for art in arr {
                if let Some(name) = art.get("name").and_then(|n| n.as_str()) {
                    artists.push(name);
                }
            }
        }
        let artist = if !artists.is_empty() {
            artists.join(", ")
        } else {
            "Неизвестный исполнитель".to_string()
        };

        let duration_ms = t.get("durationMs").and_then(|d| d.as_u64());

        Some(ExternalTrackMeta {
            title: full_title,
            artist,
            duration_ms,
        })
    }

    /// Парсинг ссылок Spotify
    pub async fn fetch_spotify(&self, url_str: &str) -> Result<ExternalPlaylistMeta, DomainError> {
        let url = reqwest::Url::parse(url_str)
            .map_err(|e| DomainError::Validation(format!("Некорректная ссылка Spotify: {}", e)))?;

        let path = url.path();
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

        // /playlist/{id}, /album/{id}, /track/{id}
        let mut entity_type = "";
        let mut entity_id = "";

        for (i, seg) in segments.iter().enumerate() {
            if *seg == "playlist" || *seg == "album" || *seg == "track" {
                entity_type = seg;
                if segments.len() > i + 1 {
                    entity_id = segments[i + 1];
                }
                break;
            }
        }

        if entity_id.is_empty() {
            return Err(DomainError::Validation(
                "Не удалось извлечь ID плейлиста или альбома Spotify. Пример ссылки: https://open.spotify.com/playlist/...".to_string(),
            ));
        }

        // Попытка 1: Web API через анонимный bearer token веб-плеера
        match self.fetch_spotify_via_api(entity_type, entity_id).await {
            Ok(meta) => Ok(meta),
            Err(err) => {
                log::warn!("Spotify Web API error, falling back to embed parsing: {:?}", err);
                // Попытка 2: Fallback через страницу embed
                self.fetch_spotify_via_embed(entity_type, entity_id).await
            }
        }
    }

    async fn get_spotify_guest_token(&self) -> Result<String, DomainError> {
        let token_url = "https://open.spotify.com/get_access_token?reason=transport&productType=web_player";
        let resp = self.client.get(token_url)
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Не удалось получить гостевой токен Spotify: {}", e)))?;

        if !resp.status().is_success() {
            return Err(DomainError::ExternalService(format!(
                "Spotify отказал в генерации гостевого токена (статус {})",
                resp.status()
            )));
        }

        let json: Value = resp.json().await.map_err(|e| {
            DomainError::ExternalService(format!("Некорректный ответ токена Spotify: {}", e))
        })?;

        json.get("accessToken")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| DomainError::ExternalService("Поле accessToken отсутствует в ответе Spotify".to_string()))
    }

    async fn fetch_spotify_via_api(&self, entity_type: &str, entity_id: &str) -> Result<ExternalPlaylistMeta, DomainError> {
        let token = self.get_spotify_guest_token().await?;

        let api_endpoint = match entity_type {
            "playlist" => format!("https://api.spotify.com/v1/playlists/{}", entity_id),
            "album" => format!("https://api.spotify.com/v1/albums/{}", entity_id),
            "track" => format!("https://api.spotify.com/v1/tracks/{}", entity_id),
            _ => return Err(DomainError::Validation("Неподдерживаемый тип контента Spotify".to_string())),
        };

        let resp = self.client.get(&api_endpoint)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Ошибка вызова Spotify API: {}", e)))?;

        if !resp.status().is_success() {
            return Err(DomainError::ExternalService(format!(
                "Spotify API вернул код {}",
                resp.status()
            )));
        }

        let json: Value = resp.json().await.map_err(|e| {
            DomainError::ExternalService(format!("Ошибка парсинга JSON Spotify API: {}", e))
        })?;

        let title = json.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Spotify Playlist")
            .to_string();

        let description = json.get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let cover_url = json.get("images")
            .and_then(|i| i.as_array())
            .and_then(|arr| arr.first())
            .and_then(|img| img.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let mut tracks = Vec::new();

        if entity_type == "track" {
            if let Some(track_meta) = self.parse_spotify_track_item(&json) {
                tracks.push(track_meta);
            }
        } else if entity_type == "playlist" {
            if let Some(items) = json.get("tracks").and_then(|t| t.get("items")).and_then(|i| i.as_array()) {
                for item in items {
                    let track_obj = item.get("track").unwrap_or(item);
                    if let Some(meta) = self.parse_spotify_track_item(track_obj) {
                        tracks.push(meta);
                    }
                }
            }
        } else if entity_type == "album" {
            if let Some(items) = json.get("tracks").and_then(|t| t.get("items")).and_then(|i| i.as_array()) {
                for item in items {
                    if let Some(meta) = self.parse_spotify_track_item(item) {
                        tracks.push(meta);
                    }
                }
            }
        }

        if tracks.is_empty() {
            return Err(DomainError::ExternalService("Не удалось извлечь треки из Spotify".to_string()));
        }

        if tracks.len() > 250 {
            tracks.truncate(250);
        }

        Ok(ExternalPlaylistMeta {
            service: "spotify".to_string(),
            title,
            description,
            cover_url,
            tracks,
        })
    }

    async fn fetch_spotify_via_embed(&self, entity_type: &str, entity_id: &str) -> Result<ExternalPlaylistMeta, DomainError> {
        let embed_url = format!("https://open.spotify.com/embed/{}/{}", entity_type, entity_id);

        let resp = self.client.get(&embed_url)
            .send()
            .await
            .map_err(|e| DomainError::Network(format!("Ошибка загрузки Spotify Embed: {}", e)))?;

        let html = resp.text().await.map_err(|e| {
            DomainError::ExternalService(format!("Ошибка чтения HTML Spotify: {}", e))
        })?;

        // Ищем тег <script id="__NEXT_DATA__" type="application/json">...</script>
        let script_marker = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
        let start_pos = html.find(script_marker)
            .ok_or_else(|| DomainError::ExternalService("Не найден блок данных __NEXT_DATA__ в Spotify Embed".to_string()))?;

        let json_start = start_pos + script_marker.len();
        let end_pos = html[json_start..].find("</script>")
            .ok_or_else(|| DomainError::ExternalService("Не найден закрывающий тег в Spotify Embed".to_string()))?;

        let json_str = &html[json_start..json_start + end_pos];
        let root: Value = serde_json::from_str(json_str).map_err(|e| {
            DomainError::ExternalService(format!("Ошибка разбора JSON из Spotify Embed: {}", e))
        })?;

        let entity = root.pointer("/props/pageProps/state/data/entity")
            .ok_or_else(|| DomainError::ExternalService("Данные entity не найдены в Spotify Embed".to_string()))?;

        let title = entity.get("title")
            .or_else(|| entity.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Spotify Playlist")
            .to_string();

        let cover_url = entity.get("coverArt")
            .and_then(|c| c.get("sources"))
            .and_then(|s| s.as_array())
            .and_then(|arr| arr.first())
            .and_then(|src| src.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        let mut tracks = Vec::new();

        if let Some(track_list) = entity.get("trackList").and_then(|tl| tl.as_array()) {
            for t in track_list {
                let name = t.get("title").and_then(|v| v.as_str());
                let artist = t.get("subtitle").and_then(|v| v.as_str());
                let duration_ms = t.get("duration").and_then(|d| d.as_u64());

                if let (Some(title_str), Some(artist_str)) = (name, artist) {
                    tracks.push(ExternalTrackMeta {
                        title: title_str.to_string(),
                        artist: artist_str.to_string(),
                        duration_ms,
                    });
                }
            }
        }

        if tracks.is_empty() {
            return Err(DomainError::ExternalService("В Spotify Embed не найдено треков".to_string()));
        }

        if tracks.len() > 250 {
            tracks.truncate(250);
        }

        Ok(ExternalPlaylistMeta {
            service: "spotify".to_string(),
            title,
            description: None,
            cover_url,
            tracks,
        })
    }

    fn parse_spotify_track_item(&self, track_obj: &Value) -> Option<ExternalTrackMeta> {
        let title = track_obj.get("name").and_then(|v| v.as_str())?;

        let mut artists = Vec::new();
        if let Some(arr) = track_obj.get("artists").and_then(|a| a.as_array()) {
            for art in arr {
                if let Some(name) = art.get("name").and_then(|n| n.as_str()) {
                    artists.push(name);
                }
            }
        }
        let artist = if !artists.is_empty() {
            artists.join(", ")
        } else {
            "Неизвестный исполнитель".to_string()
        };

        let duration_ms = track_obj.get("duration_ms").and_then(|d| d.as_u64());

        Some(ExternalTrackMeta {
            title: title.to_string(),
            artist,
            duration_ms,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_yandex_lk_playlist() {
        let importer = ExternalImporter::new();
        let url = "https://music.yandex.ru/playlists/lk.e99dbe8b-3952-4265-b4ba-17af1a4104cc?utm_source=web&utm_medium=copy_link";
        let res = importer.parse_input(url, None).await;
        println!("Result: {:?}", res.as_ref().map(|p| (&p.title, p.tracks.len())));
        assert!(res.is_ok());
        let meta = res.unwrap();
        assert_eq!(meta.service, "yandex");
        assert!(!meta.tracks.is_empty());
    }
}
