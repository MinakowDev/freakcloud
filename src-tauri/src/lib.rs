pub mod application;
pub mod domain;
pub mod infrastructure;
pub mod interfaces;

use std::sync::Arc;
use application::AppState;
use domain::ports::AudioPlayerPort;
use infrastructure::{
    DiscordRpcService, FilePlaylistStorage, FileSessionStorage, LocalAudioCache,
    RSoundCloudAdapter, RodioAudioPlayer,
};
use interfaces::tauri::commands::{
    cache_track, clear_cache, clear_discord_rpc, get_cache_stats, get_cached_tracks,
    get_current_session, get_my_likes, get_playlist_details, get_related_tracks,
    get_saved_playlists, get_track_details, get_track_stream, get_trending, is_playlist_saved,
    is_track_cached, like_track, log_frontend_error, login_with_token, logout, open_log_dir, open_soundcloud_login,
    player_get_state, player_load_and_play, player_pause, player_play, player_seek,
    player_set_muted, player_set_volume, player_stop, remove_cached_track,
    remove_saved_playlist, save_playlist, search_albums, search_playlists, search_tracks,
    set_discord_client_id, set_discord_rpc_enabled, unlike_track, update_discord_rpc,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session_repo = Arc::new(
        FileSessionStorage::new_default()
            .expect("Failed to initialize session storage"),
    );

    // Инициализируем аудиокэш, хранилище плейлистов и SoundCloud Gateway асинхронно
    let session_repo_clone = session_repo.clone();
    let (gateway, audio_cache, playlist_repo) = tauri::async_runtime::block_on(async move {
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

        let p_repo = Arc::new(
            FilePlaylistStorage::new_default()
                .await
                .expect("Failed to initialize FilePlaylistStorage"),
        );

        (gw, cache, p_repo)
    });

    let audio_player = Arc::new(
        RodioAudioPlayer::new()
            .expect("Failed to initialize RodioAudioPlayer"),
    );
    let discord_rpc = Arc::new(DiscordRpcService::new());
    let app_state = AppState::new(
        gateway,
        session_repo,
        audio_cache,
        playlist_repo,
        discord_rpc,
        audio_player.clone(),
    );

    use infrastructure::start_loopback_server;
    use tauri::{
        menu::{MenuBuilder, MenuItemBuilder},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
        Manager,
    };

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    if let Some(tray_win) = app.get_webview_window("tray-widget") {
        let _ = tray_win.hide();
    }
}

    use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("freakcloud".into()),
                    }),
                    Target::new(TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("reqwest", log::LevelFilter::Warn)
                .level_for("symphonia", log::LevelFilter::Warn)
                .level_for("cpal", log::LevelFilter::Warn)
                .rotation_strategy(RotationStrategy::KeepAll)
                .max_file_size(2 * 1024 * 1024)
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .on_window_event(|window, event| {
            if window.label() == "tray-widget" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            let app_handle = app.handle().clone();
            audio_player.set_app_handle(app_handle.clone());
            tauri::async_runtime::spawn(async move {
                start_loopback_server(app_handle).await;
            });

            // Настройка системного трея (System Tray)
            let show_i = MenuItemBuilder::with_id("show", "Открыть freakcloud").build(app)?;
            let hide_i = MenuItemBuilder::with_id("hide", "Скрыть в трей").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Выйти").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show_i, &hide_i, &quit_i]).build()?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("freakcloud")
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
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(tray_win) = app.get_webview_window("tray-widget") {
                            if tray_win.is_visible().unwrap_or(false) {
                                let _ = tray_win.hide();
                            } else {
                                let widget_width = 340.0;
                                let widget_height = 140.0;
                                if let Ok(scale_factor) = tray_win.scale_factor() {
                                    let (icon_x, icon_y, icon_w) = match rect.position {
                                        tauri::Position::Physical(p) => (
                                            p.x as f64 / scale_factor,
                                            p.y as f64 / scale_factor,
                                            match rect.size {
                                                tauri::Size::Physical(s) => s.width as f64 / scale_factor,
                                                tauri::Size::Logical(s) => s.width,
                                            },
                                        ),
                                        tauri::Position::Logical(p) => (
                                            p.x,
                                            p.y,
                                            match rect.size {
                                                tauri::Size::Physical(s) => s.width as f64 / scale_factor,
                                                tauri::Size::Logical(s) => s.width,
                                            },
                                        ),
                                    };

                                    let target_x = (icon_x + icon_w / 2.0 - widget_width / 2.0).max(10.0);
                                    let target_y = (icon_y - widget_height - 12.0).max(10.0);

                                    let _ = tray_win.set_position(tauri::Position::Logical(
                                        tauri::LogicalPosition::new(target_x, target_y),
                                    ));
                                }
                                let _ = tray_win.show();
                                let _ = tray_win.set_focus();
                            }
                        }
                    }
                    TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.unminimize();
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_tracks,
            search_playlists,
            search_albums,
            get_playlist_details,
            get_saved_playlists,
            save_playlist,
            remove_saved_playlist,
            is_playlist_saved,
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
            show_main_window,
            update_discord_rpc,
            clear_discord_rpc,
            set_discord_rpc_enabled,
            set_discord_client_id,
            player_load_and_play,
            player_play,
            player_pause,
            player_seek,
            player_set_volume,
            player_set_muted,
            player_stop,
            player_get_state,
            log_frontend_error,
            open_log_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running freakcloud application");
}
