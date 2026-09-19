use std::{
    fs::File,
    io::Cursor,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, RwLock,
    },
    thread,
    time::Duration,
};

use async_trait::async_trait;
use rodio::{Decoder, OutputStream, Sink, Source};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, RwLock as TokioRwLock};

use crate::domain::{
    errors::DomainError,
    models::PlaybackStatus,
    ports::{AudioPlayerPort, AudioPlayerState},
};

enum AudioWorkerCommand {
    LoadBytes {
        bytes: Vec<u8>,
        seq: u64,
        reply: oneshot::Sender<Result<(), String>>,
    },
    LoadFile {
        path: PathBuf,
        seq: u64,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Play,
    Pause,
    Seek(f64),
    SetVolume(f32),
    SetMuted(bool),
    Stop,
}

pub struct RodioAudioPlayer {
    cmd_tx: mpsc::UnboundedSender<AudioWorkerCommand>,
    state: Arc<TokioRwLock<AudioPlayerState>>,
    app_handle_slot: Arc<RwLock<Option<AppHandle>>>,
    http: reqwest::Client,
    seq: Arc<AtomicU64>,
}

impl RodioAudioPlayer {
    pub fn new() -> Result<Self, DomainError> {
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<AudioWorkerCommand>();

        let state = Arc::new(TokioRwLock::new(AudioPlayerState {
            status: PlaybackStatus::Stopped,
            current_time: 0.0,
            duration: 0.0,
            volume: 0.8,
            is_muted: false,
        }));

        let state_clone = Arc::clone(&state);
        let app_handle_slot: Arc<RwLock<Option<AppHandle>>> = Arc::new(RwLock::new(None));
        let app_handle_slot_clone = Arc::clone(&app_handle_slot);
        let seq = Arc::new(AtomicU64::new(0));

        // Dedicated audio worker thread
        thread::Builder::new()
            .name("freakcloud-audio-worker".to_string())
            .spawn(move || {
                let (_stream, stream_handle) = match OutputStream::try_default() {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!("[RodioAudioPlayer] Failed to open default audio stream: {:?}", e);
                        return;
                    }
                };

                let mut sink = match Sink::try_new(&stream_handle) {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!("[RodioAudioPlayer] Failed to create audio sink: {:?}", e);
                        return;
                    }
                };

                let mut current_duration = 0.0;
                let mut target_volume = 0.8f32;
                let mut is_muted = false;
                let mut has_track = false;
                let mut active_seq = 0u64;
                let is_playing = Arc::new(AtomicBool::new(false));

                sink.set_volume(target_volume);

                loop {
                    // Process commands
                    while let Ok(cmd) = cmd_rx.try_recv() {
                        match cmd {
                            AudioWorkerCommand::LoadBytes { bytes, seq, reply } => {
                                if seq < active_seq {
                                    let _ = reply.send(Ok(()));
                                    continue;
                                }
                                active_seq = seq;
                                sink.stop();
                                sink = match Sink::try_new(&stream_handle) {
                                    Ok(s) => s,
                                    Err(e) => {
                                        has_track = false;
                                        is_playing.store(false, Ordering::SeqCst);
                                        let _ = reply.send(Err(format!("Sink recreation error: {:?}", e)));
                                        continue;
                                    }
                                };

                                let cursor = Cursor::new(bytes);
                                match Decoder::new(cursor) {
                                    Ok(source) => {
                                        current_duration = source
                                            .total_duration()
                                            .map(|d| d.as_secs_f64())
                                            .unwrap_or(0.0);
                                        sink.append(source);
                                        let eff_vol = if is_muted { 0.0 } else { target_volume };
                                        sink.set_volume(eff_vol);
                                        sink.play();
                                        has_track = true;
                                        is_playing.store(true, Ordering::SeqCst);
                                        let _ = reply.send(Ok(()));
                                    }
                                    Err(err) => {
                                        has_track = false;
                                        is_playing.store(false, Ordering::SeqCst);
                                        let _ = reply.send(Err(format!("Decode error: {:?}", err)));
                                    }
                                }
                            }
                            AudioWorkerCommand::LoadFile { path, seq, reply } => {
                                if seq < active_seq {
                                    let _ = reply.send(Ok(()));
                                    continue;
                                }
                                active_seq = seq;
                                sink.stop();
                                sink = match Sink::try_new(&stream_handle) {
                                    Ok(s) => s,
                                    Err(e) => {
                                        has_track = false;
                                        is_playing.store(false, Ordering::SeqCst);
                                        let _ = reply.send(Err(format!("Sink recreation error: {:?}", e)));
                                        continue;
                                    }
                                };

                                match File::open(&path) {
                                    Ok(file) => match Decoder::new(std::io::BufReader::new(file)) {
                                        Ok(source) => {
                                            current_duration = source
                                                .total_duration()
                                                .map(|d| d.as_secs_f64())
                                                .unwrap_or(0.0);
                                            sink.append(source);
                                            let eff_vol = if is_muted { 0.0 } else { target_volume };
                                            sink.set_volume(eff_vol);
                                            sink.play();
                                            has_track = true;
                                            is_playing.store(true, Ordering::SeqCst);
                                            let _ = reply.send(Ok(()));
                                        }
                                        Err(err) => {
                                            has_track = false;
                                            is_playing.store(false, Ordering::SeqCst);
                                            let _ = reply.send(Err(format!("Decode error: {:?}", err)));
                                        }
                                    },
                                    Err(err) => {
                                        has_track = false;
                                        is_playing.store(false, Ordering::SeqCst);
                                        let _ = reply.send(Err(format!("File open error: {:?}", err)));
                                    }
                                }
                            }
                            AudioWorkerCommand::Play => {
                                if has_track {
                                    sink.play();
                                    is_playing.store(true, Ordering::SeqCst);
                                }
                            }
                            AudioWorkerCommand::Pause => {
                                sink.pause();
                                is_playing.store(false, Ordering::SeqCst);
                            }
                            AudioWorkerCommand::Seek(sec) => {
                                if has_track {
                                    let d = Duration::from_secs_f64(sec.max(0.0));
                                    let _ = sink.try_seek(d);
                                }
                            }
                            AudioWorkerCommand::SetVolume(v) => {
                                target_volume = v.clamp(0.0, 1.0);
                                if !is_muted {
                                    sink.set_volume(target_volume);
                                }
                            }
                            AudioWorkerCommand::SetMuted(m) => {
                                is_muted = m;
                                sink.set_volume(if is_muted { 0.0 } else { target_volume });
                            }
                            AudioWorkerCommand::Stop => {
                                sink.stop();
                                has_track = false;
                                is_playing.store(false, Ordering::SeqCst);
                            }
                        }
                    }

                    // Progress and status tracking
                    let cur_time = if has_track {
                        sink.get_pos().as_secs_f64()
                    } else {
                        0.0
                    };

                    let ended = has_track && sink.empty();
                    if ended {
                        has_track = false;
                        is_playing.store(false, Ordering::SeqCst);
                        if let Ok(slot) = app_handle_slot_clone.read() {
                            if let Some(app) = slot.as_ref() {
                                let _ = app.emit("player:ended", ());
                                let _ = app.emit("player:status", "ended");
                            }
                        }
                    }

                    let playing_now = is_playing.load(Ordering::SeqCst);
                    let cur_status = if ended {
                        PlaybackStatus::Stopped
                    } else if playing_now {
                        PlaybackStatus::Playing
                    } else if has_track {
                        PlaybackStatus::Paused
                    } else {
                        PlaybackStatus::Stopped
                    };

                    // Update shared state
                    if let Ok(mut lock) = state_clone.try_write() {
                        lock.status = cur_status;
                        lock.current_time = cur_time;
                        lock.duration = current_duration;
                        lock.volume = target_volume;
                        lock.is_muted = is_muted;
                    }

                    // Broadcast time update to frontend
                    if playing_now {
                        if let Ok(slot) = app_handle_slot_clone.read() {
                            if let Some(app) = slot.as_ref() {
                                #[derive(serde::Serialize, Clone)]
                                struct TimePayload {
                                    current_time: f64,
                                    duration: f64,
                                }
                                let _ = app.emit(
                                    "player:time",
                                    TimePayload {
                                        current_time: cur_time,
                                        duration: current_duration,
                                    },
                                );
                            }
                        }
                    }

                    thread::sleep(Duration::from_millis(50));
                }
            })
            .map_err(|e| DomainError::Playback(format!("Failed to spawn audio thread: {}", e)))?;

        let http = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .build()
            .map_err(|e| DomainError::Network(e.to_string()))?;

        Ok(Self {
            cmd_tx,
            state,
            app_handle_slot,
            http,
            seq,
        })
    }
}

#[async_trait]
impl AudioPlayerPort for RodioAudioPlayer {
    async fn load_and_play(&self, url_or_path: String, is_local: bool) -> Result<(), DomainError> {
        let (tx, rx) = oneshot::channel();
        let current_seq = self.seq.fetch_add(1, Ordering::SeqCst) + 1;

        if is_local {
            let path = PathBuf::from(url_or_path);
            self.cmd_tx
                .send(AudioWorkerCommand::LoadFile {
                    path,
                    seq: current_seq,
                    reply: tx,
                })
                .map_err(|e| DomainError::Playback(format!("Worker channel closed: {}", e)))?;
        } else {
            let resp = self
                .http
                .get(&url_or_path)
                .send()
                .await
                .map_err(|e| DomainError::Network(format!("Failed to stream track: {}", e)))?;

            if !resp.status().is_success() {
                return Err(DomainError::Network(format!(
                    "Failed to stream track, HTTP status: {}",
                    resp.status()
                )));
            }

            let mut audio_bytes = resp
                .bytes()
                .await
                .map_err(|e| DomainError::Network(format!("Failed to read stream bytes: {}", e)))?
                .to_vec();

            // Handle HLS playlist (.m3u8) by downloading and concatenating segments
            if audio_bytes.starts_with(b"#EXTM3U") || audio_bytes.starts_with(b"#EXT-X") {
                let mut current_playlist_url = url_or_path.clone();
                let mut m3u8_text = String::from_utf8_lossy(&audio_bytes).to_string();

                // If this is a master/variant playlist (contains child .m3u8), resolve the child playlist first
                let child_playlist_path = m3u8_text
                    .lines()
                    .map(|l| l.trim())
                    .find(|l| !l.starts_with('#') && l.contains(".m3u8"))
                    .map(|s| s.to_string());

                if let Some(child_path) = child_playlist_path {
                    let resolved_child_url = if child_path.starts_with("http://") || child_path.starts_with("https://") {
                        child_path
                    } else if let Ok(base) = reqwest::Url::parse(&current_playlist_url) {
                        base.join(&child_path).map(|u| u.to_string()).unwrap_or(child_path)
                    } else {
                        child_path
                    };

                    if let Ok(child_resp) = self.http.get(&resolved_child_url).send().await {
                        if child_resp.status().is_success() {
                            if let Ok(child_bytes) = child_resp.bytes().await {
                                current_playlist_url = resolved_child_url;
                                m3u8_text = String::from_utf8_lossy(&child_bytes).to_string();
                            }
                        }
                    }
                }

                let segment_urls: Vec<String> = m3u8_text
                    .lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty() && !l.starts_with('#'))
                    .map(|l| {
                        if l.starts_with("http://") || l.starts_with("https://") {
                            l.to_string()
                        } else if let Ok(base) = reqwest::Url::parse(&current_playlist_url) {
                            base.join(l).map(|u| u.to_string()).unwrap_or_else(|_| l.to_string())
                        } else {
                            l.to_string()
                        }
                    })
                    .collect();

                if !segment_urls.is_empty() {
                    let mut combined = Vec::new();
                    for seg_url in segment_urls {
                        if self.seq.load(Ordering::SeqCst) != current_seq {
                            return Ok(());
                        }
                        if let Ok(seg_resp) = self.http.get(&seg_url).send().await {
                            if seg_resp.status().is_success() {
                                if let Ok(seg_chunk) = seg_resp.bytes().await {
                                    combined.extend_from_slice(&seg_chunk);
                                }
                            }
                        }
                    }
                    if !combined.is_empty() {
                        audio_bytes = combined;
                    }
                }
            }

            // Check if superseded while downloading
            if self.seq.load(Ordering::SeqCst) != current_seq {
                return Ok(());
            }

            self.cmd_tx
                .send(AudioWorkerCommand::LoadBytes {
                    bytes: audio_bytes,
                    seq: current_seq,
                    reply: tx,
                })
                .map_err(|e| DomainError::Playback(format!("Worker channel closed: {}", e)))?;
        }

        match rx.await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(err)) => Err(DomainError::Playback(err)),
            Err(e) => Err(DomainError::Playback(format!("Worker response error: {}", e))),
        }
    }

    async fn play(&self) -> Result<(), DomainError> {
        self.cmd_tx
            .send(AudioWorkerCommand::Play)
            .map_err(|e| DomainError::Playback(e.to_string()))
    }

    async fn pause(&self) -> Result<(), DomainError> {
        self.cmd_tx
            .send(AudioWorkerCommand::Pause)
            .map_err(|e| DomainError::Playback(e.to_string()))
    }

    async fn seek(&self, position_seconds: f64) -> Result<(), DomainError> {
        self.cmd_tx
            .send(AudioWorkerCommand::Seek(position_seconds))
            .map_err(|e| DomainError::Playback(e.to_string()))
    }

    async fn set_volume(&self, volume: f32) -> Result<(), DomainError> {
        self.cmd_tx
            .send(AudioWorkerCommand::SetVolume(volume))
            .map_err(|e| DomainError::Playback(e.to_string()))
    }

    async fn set_muted(&self, muted: bool) -> Result<(), DomainError> {
        self.cmd_tx
            .send(AudioWorkerCommand::SetMuted(muted))
            .map_err(|e| DomainError::Playback(e.to_string()))
    }

    async fn stop(&self) -> Result<(), DomainError> {
        self.cmd_tx
            .send(AudioWorkerCommand::Stop)
            .map_err(|e| DomainError::Playback(e.to_string()))
    }

    async fn get_state(&self) -> Result<AudioPlayerState, DomainError> {
        let guard = self.state.read().await;
        Ok(guard.clone())
    }

    fn set_app_handle(&self, app_handle: AppHandle) {
        if let Ok(mut slot) = self.app_handle_slot.write() {
            *slot = Some(app_handle);
        }
    }
}
