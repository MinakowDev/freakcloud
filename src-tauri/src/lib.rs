pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interfaces;

use std::sync::Arc;
use application::AppState;
use infrastructure::{FileSessionStorage, RSoundCloudAdapter};
use interfaces::tauri::commands::{
    get_current_session, get_track_details, get_track_stream, get_trending, login_with_token,
    logout, search_tracks,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session_repo = Arc::new(
        FileSessionStorage::new_default()
            .expect("Failed to initialize session storage"),
    );

    // Инициализируем SoundCloud Gateway асинхронно
    let session_repo_clone = session_repo.clone();
    let gateway = tauri::async_runtime::block_on(async move {
        use domain::ports::SessionRepository;
        let saved_token = session_repo_clone.load_token().await.unwrap_or(None);
        Arc::new(
            RSoundCloudAdapter::new(saved_token)
                .await
                .expect("Failed to initialize RSoundCloudAdapter"),
        )
    });

    let app_state = AppState::new(gateway, session_repo);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            search_tracks,
            get_track_stream,
            get_track_details,
            get_trending,
            login_with_token,
            logout,
            get_current_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running freackcloud application");
}
