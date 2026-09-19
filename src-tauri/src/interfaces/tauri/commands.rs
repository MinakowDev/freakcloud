use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::{
    application::AppState,
    domain::{
        errors::DomainError,
        models::{AudioSource, CacheStats, PaginatedTracks, Playlist, Session, Track},
    },
};

#[tauri::command]
pub async fn search_tracks(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Track>, DomainError> {
    state.search_tracks.execute(&query, limit, offset).await
}

#[tauri::command]
pub async fn get_track_stream(
    state: State<'_, AppState>,
    track_id: u64,
) -> Result<AudioSource, DomainError> {
    state.get_track_stream.execute(track_id).await
}

#[tauri::command]
pub async fn get_track_details(
    state: State<'_, AppState>,
    track_id: u64,
) -> Result<Track, DomainError> {
    state.gateway.get_track(track_id).await
}

#[tauri::command]
pub async fn get_trending(
    state: State<'_, AppState>,
    vibe: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<Track>, DomainError> {
    state.get_trending.execute(vibe.as_deref(), limit).await
}

#[tauri::command]
pub async fn get_my_likes(
    state: State<'_, AppState>,
    limit: Option<u32>,
    next_href: Option<String>,
) -> Result<PaginatedTracks, DomainError> {
    state.gateway.get_my_likes(limit.unwrap_or(50), next_href).await
}

#[tauri::command]
pub async fn like_track(
    state: State<'_, AppState>,
    track_id: u64,
) -> Result<(), DomainError> {
    state.gateway.like_track(track_id).await
}

#[tauri::command]
pub async fn unlike_track(
    state: State<'_, AppState>,
    track_id: u64,
) -> Result<(), DomainError> {
    state.gateway.unlike_track(track_id).await
}

#[tauri::command]
pub async fn get_related_tracks(
    state: State<'_, AppState>,
    track_id: u64,
    limit: Option<u32>,
) -> Result<Vec<Track>, DomainError> {
    state.gateway.get_related_tracks(track_id, limit.unwrap_or(20)).await
}

#[tauri::command]
pub async fn login_with_token(
    state: State<'_, AppState>,
    token: String,
) -> Result<Session, DomainError> {
    state.authenticate.login_with_token(&token).await
}

#[tauri::command]
pub async fn logout(
    state: State<'_, AppState>,
) -> Result<Session, DomainError> {
    state.authenticate.logout().await
}

#[tauri::command]
pub async fn get_current_session(
    state: State<'_, AppState>,
) -> Result<Session, DomainError> {
    state.authenticate.get_current_session().await
}

#[tauri::command]
pub async fn cache_track(
    state: State<'_, AppState>,
    track: Track,
) -> Result<String, DomainError> {
    state.cache_track.execute(track).await
}

#[tauri::command]
pub async fn remove_cached_track(
    state: State<'_, AppState>,
    track_id: u64,
) -> Result<(), DomainError> {
    state.cache_track.remove(track_id).await
}

#[tauri::command]
pub async fn get_cached_tracks(
    state: State<'_, AppState>,
) -> Result<Vec<Track>, DomainError> {
    state.manage_cache.get_all_cached().await
}

#[tauri::command]
pub async fn get_cache_stats(
    state: State<'_, AppState>,
) -> Result<CacheStats, DomainError> {
    state.manage_cache.get_stats().await
}

#[tauri::command]
pub async fn clear_cache(
    state: State<'_, AppState>,
) -> Result<(), DomainError> {
    state.manage_cache.clear().await
}

#[tauri::command]
pub async fn is_track_cached(
    state: State<'_, AppState>,
    track_id: u64,
) -> Result<bool, DomainError> {
    Ok(state.manage_cache.is_cached(track_id).await)
}

#[tauri::command]
pub async fn open_soundcloud_login(app: AppHandle) -> Result<(), DomainError> {
    if let Some(win) = app.get_webview_window("soundcloud_login") {
        let _ = win.set_focus();
        return Ok(());
    }

    let url = "https://soundcloud.com/signin"
        .parse()
        .map_err(|e| DomainError::Network(format!("Invalid URL: {}", e)))?;

    let script = r#"
        (function() {
            function checkAuth() {
                try {
                    let token = null;
                    const cookieMatch = document.cookie.match(/oauth_token=([^;]+)/);
                    if (cookieMatch && cookieMatch[1]) {
                        token = decodeURIComponent(cookieMatch[1]);
                    } else {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && (key.includes('oauth') || key.includes('token'))) {
                                const val = localStorage.getItem(key);
                                if (val && val.startsWith('2-')) {
                                    token = val;
                                    break;
                                }
                            }
                        }
                    }

                    if (token) {
                        window.location.href = "https://freakcloud.local/callback?token=" + encodeURIComponent(token);
                    }
                } catch (e) {
                    console.error('CheckAuth error:', e);
                }
            }
            setInterval(checkAuth, 800);
        })();
    "#;

    let app_handle = app.clone();
    WebviewWindowBuilder::new(&app, "soundcloud_login", WebviewUrl::External(url))
        .title("SoundCloud — Вход в аккаунт")
        .inner_size(540.0, 720.0)
        .center()
        .initialization_script(script)
        .on_navigation(move |nav_url| {
            if nav_url.host_str() == Some("freakcloud.local") {
                if let Some((_, token)) = nav_url.query_pairs().find(|(k, _)| k == "token") {
                    let token_str = token.to_string();
                    let app_inner = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        use tauri::Manager;
                        if let Some(state) = app_inner.try_state::<crate::application::AppState>() {
                            let _ = state.authenticate.login_with_token(&token_str).await;
                        }
                        if let Some(win) = app_inner.get_webview_window("soundcloud_login") {
                            let _ = win.close();
                        }
                        use tauri::Emitter;
                        let _ = app_inner.emit("session_updated", ());
                    });
                    return false;
                }
            }
            true
        })
        .build()
        .map_err(|e| DomainError::Unexpected(e.to_string()))?;

    Ok(())
}

#[tauri::command]
pub async fn search_playlists(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Playlist>, DomainError> {
    state.manage_playlists.search(&query, limit, offset).await
}

#[tauri::command]
pub async fn search_albums(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Playlist>, DomainError> {
    state.manage_playlists.search_albums(&query, limit, offset).await
}

#[tauri::command]
pub async fn get_playlist_details(
    state: State<'_, AppState>,
    playlist_id: u64,
) -> Result<Playlist, DomainError> {
    state.manage_playlists.get_details(playlist_id).await
}

#[tauri::command]
pub async fn get_saved_playlists(
    state: State<'_, AppState>,
) -> Result<Vec<Playlist>, DomainError> {
    state.manage_playlists.get_saved().await
}

#[tauri::command]
pub async fn save_playlist(
    state: State<'_, AppState>,
    playlist: Playlist,
) -> Result<(), DomainError> {
    state.manage_playlists.save(playlist).await
}

#[tauri::command]
pub async fn remove_saved_playlist(
    state: State<'_, AppState>,
    playlist_id: u64,
) -> Result<(), DomainError> {
    state.manage_playlists.remove(playlist_id).await
}

#[tauri::command]
pub async fn is_playlist_saved(
    state: State<'_, AppState>,
    playlist_id: u64,
) -> Result<bool, DomainError> {
    state.manage_playlists.is_saved(playlist_id).await
}

#[tauri::command]
pub fn update_discord_rpc(
    state: State<'_, AppState>,
    payload: crate::infrastructure::DiscordActivityPayload,
) {
    state.discord_rpc.update_activity(payload);
}

#[tauri::command]
pub fn clear_discord_rpc(
    state: State<'_, AppState>,
) {
    state.discord_rpc.clear_activity();
}

#[tauri::command]
pub fn set_discord_rpc_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) {
    state.discord_rpc.set_enabled(enabled);
}

#[tauri::command]
pub fn set_discord_client_id(
    state: State<'_, AppState>,
    client_id: Option<String>,
) {
    state.discord_rpc.set_client_id(client_id);
}

#[tauri::command]
pub async fn player_load_and_play(
    state: State<'_, AppState>,
    url: String,
    is_local: bool,
) -> Result<(), DomainError> {
    state.audio_player.load_and_play(url, is_local).await
}

#[tauri::command]
pub async fn player_play(
    state: State<'_, AppState>,
) -> Result<(), DomainError> {
    state.audio_player.play().await
}

#[tauri::command]
pub async fn player_pause(
    state: State<'_, AppState>,
) -> Result<(), DomainError> {
    state.audio_player.pause().await
}

#[tauri::command]
pub async fn player_seek(
    state: State<'_, AppState>,
    position_seconds: f64,
) -> Result<(), DomainError> {
    state.audio_player.seek(position_seconds).await
}

#[tauri::command]
pub async fn player_set_volume(
    state: State<'_, AppState>,
    volume: f32,
) -> Result<(), DomainError> {
    state.audio_player.set_volume(volume).await
}

#[tauri::command]
pub async fn player_set_muted(
    state: State<'_, AppState>,
    muted: bool,
) -> Result<(), DomainError> {
    state.audio_player.set_muted(muted).await
}

#[tauri::command]
pub async fn player_stop(
    state: State<'_, AppState>,
) -> Result<(), DomainError> {
    state.audio_player.stop().await
}

#[tauri::command]
pub async fn player_get_state(
    state: State<'_, AppState>,
) -> Result<crate::domain::ports::AudioPlayerState, DomainError> {
    state.audio_player.get_state().await
}

#[tauri::command]
pub fn log_frontend_error(level: String, message: String, context: Option<String>) {
    let ctx = context.map(|c| format!(" | Context: {}", c)).unwrap_or_default();
    match level.to_lowercase().as_str() {
        "warn" => log::warn!("[Frontend] {}{}", message, ctx),
        "info" => log::info!("[Frontend] {}{}", message, ctx),
        _ => log::error!("[Frontend] {}{}", message, ctx),
    }
}

#[tauri::command]
pub async fn open_log_dir(app: AppHandle) -> Result<(), DomainError> {
    use tauri_plugin_opener::OpenerExt;
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| DomainError::Storage(format!("Could not get log dir: {}", e)))?;

    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir)
            .map_err(|e| DomainError::Storage(format!("Failed to create log dir: {}", e)))?;
    }

    let path_str = log_dir.to_string_lossy().to_string();
    app.opener()
        .open_path(&path_str, None::<&str>)
        .map_err(|e| DomainError::Storage(format!("Failed to open log dir: {}", e)))?;

    Ok(())
}
