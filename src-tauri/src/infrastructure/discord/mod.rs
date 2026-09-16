use std::time::{SystemTime, UNIX_EPOCH};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

pub const DEFAULT_DISCORD_CLIENT_ID: &str = "802958833214423081"; // SoundCloud official application ID on Discord
pub const FREAKCLOUD_LOGO_URL: &str = "https://raw.githubusercontent.com/MinakowDev/freakcloud/master/docs/logo.png";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordActivityPayload {
    pub title: String,
    pub artist: String,
    pub artwork_url: Option<String>,
    pub permalink_url: Option<String>,
    pub is_playing: bool,
    pub current_time_sec: u64,
    pub duration_sec: u64,
}

enum DiscordCommand {
    Update(DiscordActivityPayload),
    Clear,
    SetEnabled(bool),
    SetClientId(Option<String>),
}

#[derive(Clone)]
pub struct DiscordRpcService {
    sender: UnboundedSender<DiscordCommand>,
}

impl DiscordRpcService {
    pub fn new() -> Self {
        let (sender, mut receiver) = unbounded_channel::<DiscordCommand>();

        // Run Discord IPC loop on a dedicated thread because DiscordIpc uses blocking OS pipes
        std::thread::Builder::new()
            .name("discord-rpc-worker".to_string())
            .spawn(move || {
                let mut client: Option<DiscordIpcClient> = None;
                let mut is_enabled = true;
                let mut active_client_id = DEFAULT_DISCORD_CLIENT_ID.to_string();
                let mut last_payload: Option<DiscordActivityPayload> = None;

                while let Some(cmd) = receiver.blocking_recv() {
                    match cmd {
                        DiscordCommand::SetClientId(custom_id) => {
                            let new_id = custom_id
                                .as_deref()
                                .map(str::trim)
                                .filter(|s| !s.is_empty())
                                .unwrap_or(DEFAULT_DISCORD_CLIENT_ID)
                                .to_string();

                            if new_id != active_client_id {
                                active_client_id = new_id;
                                if let Some(mut c) = client.take() {
                                    let _ = c.clear_activity();
                                    let _ = c.close();
                                }
                                if is_enabled {
                                    if let Some(payload) = &last_payload {
                                        Self::apply_activity(&mut client, &active_client_id, payload);
                                    }
                                }
                            }
                        }
                        DiscordCommand::SetEnabled(enabled) => {
                            is_enabled = enabled;
                            if !enabled {
                                if let Some(mut c) = client.take() {
                                    let _ = c.clear_activity();
                                    let _ = c.close();
                                }
                            } else if let Some(payload) = &last_payload {
                                Self::apply_activity(&mut client, &active_client_id, payload);
                            }
                        }
                        DiscordCommand::Clear => {
                            last_payload = None;
                            if let Some(c) = client.as_mut() {
                                let _ = c.clear_activity();
                            }
                        }
                        DiscordCommand::Update(payload) => {
                            last_payload = Some(payload.clone());
                            if is_enabled {
                                Self::apply_activity(&mut client, &active_client_id, &payload);
                            }
                        }
                    }
                }

                // Clean up when channel closes
                if let Some(mut c) = client.take() {
                    let _ = c.clear_activity();
                    let _ = c.close();
                }
            })
            .expect("Failed to spawn discord-rpc worker thread");

        Self { sender }
    }

    fn ensure_connected<'a>(client: &'a mut Option<DiscordIpcClient>, client_id: &str) -> bool {
        if client.is_some() {
            return true;
        }

        let mut new_client = DiscordIpcClient::new(client_id);
        if new_client.connect().is_ok() {
            *client = Some(new_client);
            true
        } else {
            false
        }
    }

    fn apply_activity(client: &mut Option<DiscordIpcClient>, client_id: &str, payload: &DiscordActivityPayload) {
        if !Self::ensure_connected(client, client_id) {
            return;
        }

        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Truncate strings to Discord IPC limit (128 bytes)
        let title = Self::truncate_str(&payload.title, 120);
        let artist = if payload.artist.trim().is_empty() {
            "SoundCloud".to_string()
        } else {
            Self::truncate_str(&payload.artist, 120)
        };

        let mut act = activity::Activity::new()
            .details(&title)
            .state(&artist);

        // Assets: Cover Art + freakcloud badge
        let has_custom_artwork = payload
            .artwork_url
            .as_ref()
            .map(|url| url.starts_with("http") && url.len() <= 256)
            .unwrap_or(false);

        let large_image = if has_custom_artwork {
            payload.artwork_url.as_deref().unwrap()
        } else {
            FREAKCLOUD_LOGO_URL
        };

        let mut assets = activity::Assets::new()
            .large_image(large_image)
            .large_text(&title);

        if has_custom_artwork {
            // Small badge in corner displaying freakcloud logo
            let small_text = if payload.is_playing { "freakcloud" } else { "freakcloud (Paused)" };
            assets = assets.small_image(FREAKCLOUD_LOGO_URL).small_text(small_text);
        }

        act = act.assets(assets);

        // Timestamps (only when actively playing)
        if payload.is_playing && payload.duration_sec > 0 {
            let start = now_sec.saturating_sub(payload.current_time_sec) as i64;
            let end = (start as u64 + payload.duration_sec) as i64;
            act = act.timestamps(activity::Timestamps::new().start(start).end(end));
        }

        // Action Button: "Listen on SoundCloud"
        let buttons = if let Some(url) = &payload.permalink_url {
            if url.starts_with("http://") || url.starts_with("https://") {
                vec![activity::Button::new("Listen on SoundCloud", url)]
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };

        if !buttons.is_empty() {
            act = act.buttons(buttons);
        }

        if let Some(c) = client.as_mut() {
            if c.set_activity(act).is_err() {
                // Pipe broke or Discord was closed
                let _ = c.close();
                *client = None;
            }
        }
    }

    fn truncate_str(s: &str, max_bytes: usize) -> String {
        if s.len() <= max_bytes {
            return s.to_string();
        }
        let mut count = 0;
        let mut end = 0;
        for (i, c) in s.char_indices() {
            if count + c.len_utf8() > max_bytes.saturating_sub(3) {
                break;
            }
            count += c.len_utf8();
            end = i + c.len_utf8();
        }
        format!("{}...", &s[..end])
    }

    pub fn update_activity(&self, payload: DiscordActivityPayload) {
        let _ = self.sender.send(DiscordCommand::Update(payload));
    }

    pub fn clear_activity(&self) {
        let _ = self.sender.send(DiscordCommand::Clear);
    }

    pub fn set_enabled(&self, enabled: bool) {
        let _ = self.sender.send(DiscordCommand::SetEnabled(enabled));
    }

    pub fn set_client_id(&self, client_id: Option<String>) {
        let _ = self.sender.send(DiscordCommand::SetClientId(client_id));
    }
}
