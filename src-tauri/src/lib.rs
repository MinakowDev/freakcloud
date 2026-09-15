pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interfaces;

use std::sync::Arc;
use application::AppState;
use infrastructure::{FileSessionStorage, LocalAudioCache, RSoundCloudAdapter};
use interfaces::tauri::commands::{
    cache_track, clear_cache, get_cache_stats, get_cached_tracks, get_current_session,
    get_track_details, get_track_stream, get_trending, get_my_likes, like_track, unlike_track,
    get_related_tracks, is_track_cached, login_with_token, logout, open_soundcloud_login, remove_cached_track, search_tracks,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session_repo = Arc::new(
        FileSessionStorage::new_default()
            .expect("Failed to initialize session storage"),
    );

    // Инициализируем аудиокэш и SoundCloud Gateway асинхронно
    let session_repo_clone = session_repo.clone();
    let (gateway, audio_cache) = tauri::async_runtime::block_on(async move {
        use domain::ports::SessionRepository;
        let saved_token = session_repo_clone.load_token().await.unwrap_or(None);

        let gw = Arc::new(
            RSoundCloudAdapter::new(saved_token)
                .await
                .expect("Failed to initialize RSoundCloudAdapter"),
        );

        let cache = Arc::new(
            LocalAudioCache::new_default()
                .await
                .expect("Failed to initialize LocalAudioCache"),
        );

        (gw, cache)
    });

    let app_state = AppState::new(gateway, session_repo, audio_cache);

    use infrastructure::start_loopback_server;
    use tauri::{
        menu::{MenuBuilder, MenuItemBuilder},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        Manager,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_loopback_server(app_handle).await;
            });

            // Настройка системного трея (System Tray)
            let show_i = MenuItemBuilder::with_id("show", "Открыть freackcloud").build(app)?;
            let hide_i = MenuItemBuilder::with_id("hide", "Скрыть в трей").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Выйти").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show_i, &hide_i, &quit_i]).build()?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("freackcloud")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.unminimize();
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_tracks,
            get_track_stream,
            get_track_details,
            get_trending,
            get_my_likes,
            like_track,
            unlike_track,
            get_related_tracks,
            login_with_token,
            logout,
            get_current_session,
            cache_track,
            remove_cached_track,
            get_cached_tracks,
            get_cache_stats,
            clear_cache,
            is_track_cached,
            open_soundcloud_login,
        ])
        .run(tauri::generate_context!())
        .expect("error while running freackcloud application");
}
