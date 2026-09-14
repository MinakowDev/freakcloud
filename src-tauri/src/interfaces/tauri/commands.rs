use tauri::State;

use crate::{
    application::AppState,
    domain::{
        errors::DomainError,
        models::{Session, Track},
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
) -> Result<String, DomainError> {
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
