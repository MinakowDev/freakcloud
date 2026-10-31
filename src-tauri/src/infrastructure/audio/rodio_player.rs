use std::{
    fs::File,
    io::{BufReader, Cursor},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

use aes::Aes128;
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use async_trait::async_trait;
use rodio::{Decoder, OutputStream, Sink, Source};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, RwLock as TokioRwLock};

type Aes128CbcDec = cbc::Decryptor<Aes128>;

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

                #[derive(Clone)]
                enum ActiveSource {
                    Bytes(Vec<u8>),
                    File(PathBuf),
                }

                let mut current_duration = 0.0;
                let mut target_volume = 0.8f32;
                let mut is_muted = false;
                let mut has_track = false;
                let mut active_seq = 0u64;
                let is_playing = Arc::new(AtomicBool::new(false));
                let mut active_source: Option<ActiveSource> = None;

                let recreate_sink_from_source = |stream_handle: &rodio::OutputStreamHandle,
                                                 src: &ActiveSource,
                                                 target_vol: f32,
                                                 muted: bool,
                                                 seek_to: Option<Duration>|
                 -> Result<(Sink, f64), String> {
                    let new_sink = Sink::try_new(stream_handle)
                        .map_err(|e| format!("Sink creation error: {:?}", e))?;
                    let duration = match src {
                        ActiveSource::Bytes(data) => {
                            let cursor = BufReader::new(Cursor::new(data.clone()));
                            let source = Decoder::new(cursor)
                                .map_err(|e| format!("Decode error: {:?}", e))?;
                            let dur = source
                                .total_duration()
                                .map(|d| d.as_secs_f64())
                                .unwrap_or(0.0);
                            new_sink.append(source);
                            dur
                        }
                        ActiveSource::File(path) => {
                            let file = File::open(path)
                                .map_err(|e| format!("File open error: {:?}", e))?;
                            let source = Decoder::new(BufReader::new(file))
                                .map_err(|e| format!("Decode error: {:?}", e))?;
                            let dur = source
                                .total_duration()
                                .map(|d| d.as_secs_f64())
                                .unwrap_or(0.0);
                            new_sink.append(source);
                            dur
                        }
                    };
                    let eff_vol = if muted { 0.0 } else { target_vol };
                    new_sink.set_volume(eff_vol);
                    if let Some(pos) = seek_to {
                        if pos > Duration::ZERO {
                            let _ = new_sink.try_seek(pos);
                        }
                    }
                    Ok((new_sink, duration))
                };

                sink.set_volume(target_volume);
                let mut last_time_emit = Instant::now();

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

                                let len = bytes.len();
                                let audio_data = if bytes.starts_with(b"ID3") {
                                    log::info!("[RodioPlayer] Stripping ID3v2.4 header ({})", 10);
                                    bytes[10..].to_vec()
                                } else {
                                    bytes.clone()
                                };
                                let src = ActiveSource::Bytes(audio_data);
                                match recreate_sink_from_source(&stream_handle, &src, target_volume, is_muted, None) {
                                    Ok((new_sink, dur)) => {
                                        sink = new_sink;
                                        current_duration = dur;
                                        sink.play();
                                        has_track = true;
                                        is_playing.store(true, Ordering::SeqCst);
                                        active_source = Some(src);
                                        let _ = reply.send(Ok(()));
                                    }
                                    Err(err) => {
                                        has_track = false;
                                        active_source = None;
                                        is_playing.store(false, Ordering::SeqCst);
                                        log::error!("[RodioPlayer] Decode error for {} bytes: {}", len, err);
                                        let _ = reply.send(Err(err));
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

                                let src = ActiveSource::File(path);
                                match recreate_sink_from_source(&stream_handle, &src, target_volume, is_muted, None) {
                                    Ok((new_sink, dur)) => {
                                        sink = new_sink;
                                        current_duration = dur;
                                        sink.play();
                                        has_track = true;
                                        is_playing.store(true, Ordering::SeqCst);
                                        active_source = Some(src);
                                        let _ = reply.send(Ok(()));
                                    }
                                    Err(err) => {
                                        has_track = false;
                                        active_source = None;
                                        is_playing.store(false, Ordering::SeqCst);
                                        log::error!("[RodioPlayer] File open/decode error: {}", err);
                                        let _ = reply.send(Err(err));
                                    }
                                }
                            }
                            AudioWorkerCommand::Play => {
                                if has_track && !sink.empty() {
                                    sink.play();
                                    is_playing.store(true, Ordering::SeqCst);
                                } else if let Some(ref src) = active_source {
                                    sink.stop();
                                    if let Ok((new_sink, dur)) = recreate_sink_from_source(&stream_handle, src, target_volume, is_muted, None) {
                                        sink = new_sink;
                                        current_duration = dur;
                                        sink.play();
                                        has_track = true;
                                        is_playing.store(true, Ordering::SeqCst);
                                    }
                                }
                            }
                            AudioWorkerCommand::Pause => {
                                sink.pause();
                                is_playing.store(false, Ordering::SeqCst);
                            }
                            AudioWorkerCommand::Seek(sec) => {
                                let d = Duration::from_secs_f64(sec.max(0.0));
                                let was_playing = is_playing.load(Ordering::SeqCst);
                                let mut seek_success = false;

                                if has_track && !sink.empty() {
                                    if sink.try_seek(d).is_ok() {
                                        seek_success = true;
                                    }
                                }

                                if !seek_success {
                                    if let Some(ref src) = active_source {
                                        sink.stop();
                                        if let Ok((new_sink, dur)) = recreate_sink_from_source(&stream_handle, src, target_volume, is_muted, Some(d)) {
                                            sink = new_sink;
                                            current_duration = dur;
                                            has_track = true;
                                            if was_playing {
                                                sink.play();
                                            } else {
                                                sink.pause();
                                            }
                                        }
                                    }
                                }
                            }
                            AudioWorkerCommand::SetVolume(v) => {
                                target_volume = v.clamp(0.0, 2.0);
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
                                active_source = None;
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

                    // Broadcast time update to frontend (throttled to ~250ms for smooth UI without IPC overload)
                    if playing_now && last_time_emit.elapsed() >= Duration::from_millis(250) {
                        last_time_emit = Instant::now();
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
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(5))
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
            log::info!("[RodioPlayer] load_and_play url={}", &url_or_path[..url_or_path.len().min(120)]);
            let resp = self
                .http
                .get(&url_or_path)
                .send()
                .await
                .map_err(|e| DomainError::Network(format!("Failed to stream track: {}", e)))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                log::error!("[RodioPlayer] Initial fetch HTTP {} body={:?}", status, &body[..body.len().min(200)]);
                return Err(DomainError::Network(format!(
                    "Failed to stream track, HTTP status: {}",
                    status
                )));
            }

            let mut audio_bytes = resp
                .bytes()
                .await
                .map_err(|e| DomainError::Network(format!("Failed to read stream bytes: {}", e)))?
                .to_vec();

            log::info!("[RodioPlayer] Downloaded {} bytes, starts_with={:?}", audio_bytes.len(), &audio_bytes[..audio_bytes.len().min(16)]);

            // Handle HLS playlist (.m3u8) by downloading and (optionally) decrypting segments
            if audio_bytes.starts_with(b"#EXTM3U") || audio_bytes.starts_with(b"#EXT-X") {
                let mut current_playlist_url = url_or_path.clone();
                let mut m3u8_text = String::from_utf8_lossy(&audio_bytes).to_string();
                log::info!("[RodioPlayer] Detected HLS playlist, {} chars, preview={:?}",
                    m3u8_text.len(),
                    &m3u8_text[..m3u8_text.len().min(800)]
                );

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

                // Parse AES-128 encryption key from #EXT-X-KEY tag if present
                // Format: #EXT-X-KEY:METHOD=AES-128,URI="https://...",IV=0x...
                let aes_key: Option<[u8; 16]> = {
                    let mut key_bytes: Option<[u8; 16]> = None;
                    for line in m3u8_text.lines() {
                        let line = line.trim();
                        if line.starts_with("#EXT-X-KEY:") && line.contains("METHOD=AES-128") {
                            // Extract URI
                            let uri = line.split(',').find_map(|part| {
                                let part = part.trim();
                                if part.starts_with("URI=") {
                                    Some(part.trim_start_matches("URI=").trim_matches('"').to_string())
                                } else {
                                    None
                                }
                            });
                            if let Some(key_uri) = uri {
                                let resolved_key_url = if key_uri.starts_with("http://") || key_uri.starts_with("https://") {
                                    key_uri
                                } else if let Ok(base) = reqwest::Url::parse(&current_playlist_url) {
                                    base.join(&key_uri).map(|u| u.to_string()).unwrap_or(key_uri)
                                } else {
                                    key_uri
                                };
                                if let Ok(key_resp) = self.http.get(&resolved_key_url).send().await {
                                    if key_resp.status().is_success() {
                                        if let Ok(key_data) = key_resp.bytes().await {
                                            if key_data.len() == 16 {
                                                let mut arr = [0u8; 16];
                                                arr.copy_from_slice(&key_data);
                                                key_bytes = Some(arr);
                                                log::info!("[RodioPlayer] AES-128 key fetched OK from {}", resolved_key_url);
                                            } else {
                                                log::warn!("[RodioPlayer] AES key wrong length: {} (expected 16)", key_data.len());
                                            }
                                        }
                                    }
                                }
                            }
                            break;
                        }
                    }
                    key_bytes
                };

                // Detect real DRM in m3u8 before wasting time on segments.
                // METHOD=SAMPLE-AES + KEYFORMAT="com.apple.streamingkeydelivery" = FairPlay DRM
                // These cannot be decrypted without Apple's CDM license server.
                let has_fairplay_drm = m3u8_text.lines().any(|l| {
                    let l = l.trim();
                    l.starts_with("#EXT-X-KEY:") && l.contains("METHOD=SAMPLE-AES") &&
                    (l.contains("com.apple.streamingkeydelivery") || l.contains("com.microsoft.playready") || l.contains("skd://"))
                });
                if has_fairplay_drm {
                    log::warn!("[RodioPlayer] m3u8 has FairPlay/SAMPLE-AES DRM — cannot decrypt");
                    return Err(DomainError::DrmProtected(
                        "Трек защищен DRM (FairPlay/SAMPLE-AES) и недоступен для стороннего воспроизведения".to_string()
                    ));
                }

                // Parse #EXT-X-MAP (init segment required for fMP4/CMAF delivery)
                // Must be prepended to combined segments buffer for symphonia to decode correctly
                let mut init_segment: Vec<u8> = Vec::new();
                for line in m3u8_text.lines() {
                    let line = line.trim();
                    if line.starts_with("#EXT-X-MAP:") {
                        // Extract URI from #EXT-X-MAP:URI="..."
                        // Cannot split by comma because URL may contain commas; search for URI= directly
                        let map_url_opt = if let Some(uri_start) = line.find("URI=\"") {
                            let after = &line[uri_start + 5..]; // skip URI="
                            after.find('"').map(|end| after[..end].to_string())
                        } else if let Some(uri_start) = line.find("URI=") {
                            let after = &line[uri_start + 4..];
                            let end = after.find(|c: char| c == ',' || c.is_whitespace()).unwrap_or(after.len());
                            Some(after[..end].to_string())
                        } else {
                            None
                        };

                        if let Some(map_path) = map_url_opt {
                            let map_url = if map_path.starts_with("http://") || map_path.starts_with("https://") {
                                map_path
                            } else if let Ok(base) = reqwest::Url::parse(&current_playlist_url) {
                                base.join(&map_path).map(|u| u.to_string()).unwrap_or(map_path)
                            } else {
                                map_path
                            };
                            log::info!("[RodioPlayer] Fetching EXT-X-MAP init segment from {}", &map_url[..map_url.len().min(120)]);
                            match self.http.get(&map_url).send().await {
                                Ok(r) if r.status().is_success() => {
                                    match r.bytes().await {
                                        Ok(b) => {
                                            log::info!("[RodioPlayer] Init segment {} bytes, first={:?}", b.len(), &b[..b.len().min(8)]);
                                            init_segment = b.to_vec();
                                        }
                                        Err(e) => log::warn!("[RodioPlayer] Init segment read error: {}", e),
                                    }
                                }
                                Ok(r) => log::warn!("[RodioPlayer] Init segment HTTP {}", r.status()),
                                Err(e) => log::warn!("[RodioPlayer] Init segment fetch error: {}", e),
                            }
                        }
                        break;
                    }
                }

                // Parse segments with per-segment IV from #EXT-X-KEY or sequence number
                struct SegmentEntry {
                    url: String,
                    iv: Option<[u8; 16]>,
                }

                let mut segment_entries: Vec<SegmentEntry> = Vec::new();
                let mut current_iv: Option<[u8; 16]> = None;
                let mut seg_seq: u64 = 0; // absolute media sequence counter for IV derivation

                for line in m3u8_text.lines() {
                    let line = line.trim();
                    if line.starts_with("#EXT-X-MEDIA-SEQUENCE:") {
                        if let Ok(n) = line.trim_start_matches("#EXT-X-MEDIA-SEQUENCE:").parse::<u64>() {
                            seg_seq = n;
                        }
                    } else if line.starts_with("#EXT-X-KEY:") {
                        // Update IV from key tag (IV may change per key block)
                        let iv_hex = line.split(',').find_map(|part| {
                            let part = part.trim();
                            if part.starts_with("IV=") {
                                Some(part.trim_start_matches("IV=").trim_start_matches("0x").trim_start_matches("0X").to_string())
                            } else {
                                None
                            }
                        });
                        if let Some(hex) = iv_hex {
                            if hex.len() == 32 {
                                let decoded: Vec<u8> = (0..16)
                                    .filter_map(|i| u8::from_str_radix(&hex[i*2..i*2+2], 16).ok())
                                    .collect();
                                if decoded.len() == 16 {
                                    let mut arr = [0u8; 16];
                                    arr.copy_from_slice(&decoded);
                                    current_iv = Some(arr);
                                }
                            }
                        }
                    } else if !line.is_empty() && !line.starts_with('#') {
                        let seg_url = if line.starts_with("http://") || line.starts_with("https://") {
                            line.to_string()
                        } else if let Ok(base) = reqwest::Url::parse(&current_playlist_url) {
                            base.join(line).map(|u| u.to_string()).unwrap_or_else(|_| line.to_string())
                        } else {
                            line.to_string()
                        };

                        // If no explicit IV in key tag, use segment sequence number as IV (RFC 8216 §4.3.2.4)
                        let iv = current_iv.or_else(|| {
                            if aes_key.is_some() {
                                let mut arr = [0u8; 16];
                                arr[8..].copy_from_slice(&seg_seq.to_be_bytes());
                                Some(arr)
                            } else {
                                None
                            }
                        });

                        segment_entries.push(SegmentEntry { url: seg_url, iv });
                        seg_seq += 1;
                    }
                }

                if !segment_entries.is_empty() {
                    log::info!("[RodioPlayer] Downloading {} segments, aes_key={}, init_segment={} bytes",
                        segment_entries.len(), aes_key.is_some(), init_segment.len());
                    let mut combined = Vec::new();
                    // Prepend init segment if present (required for fMP4/CMAF)
                    if !init_segment.is_empty() {
                        combined.extend_from_slice(&init_segment);
                    }
                    for (i, entry) in segment_entries.into_iter().enumerate() {
                        if self.seq.load(Ordering::SeqCst) != current_seq {
                            return Ok(());
                        }
                        match self.http.get(&entry.url).send().await {
                            Ok(seg_resp) if seg_resp.status().is_success() => {
                                match seg_resp.bytes().await {
                                    Ok(seg_chunk) => {
                                        let seg_data = seg_chunk.to_vec();
                                        if i == 0 {
                                            log::info!("[RodioPlayer] Seg 0 first bytes={:?} (0x47=TS, 0x00=fMP4, else=encrypted?)",
                                                &seg_data[..seg_data.len().min(8)]);
                                        }
                                        let decrypted = if let (Some(key), Some(iv)) = (aes_key, entry.iv) {
                                            match Aes128CbcDec::new(&key.into(), &iv.into())
                                                .decrypt_padded_vec_mut::<Pkcs7>(&seg_data)
                                            {
                                                Ok(plain) => { log::info!("[RodioPlayer] Seg {} decrypted {} -> {} bytes", i, seg_data.len(), plain.len()); plain }
                                                Err(e) => { log::warn!("[RodioPlayer] Seg {} decrypt error: {:?}, using raw {} bytes", i, e, seg_data.len()); seg_data }
                                            }
                                        } else {
                                            seg_data
                                        };
                                        combined.extend_from_slice(&decrypted);
                                    }
                                    Err(e) => log::warn!("[RodioPlayer] Seg {} bytes read error: {}", i, e),
                                }
                            }
                            Ok(seg_resp) => log::warn!("[RodioPlayer] Seg {} HTTP {}", i, seg_resp.status()),
                            Err(e) => log::warn!("[RodioPlayer] Seg {} fetch error: {}", i, e),
                        }
                    }
                    if !combined.is_empty() {
                        log::info!("[RodioPlayer] Combined {} bytes total, sending to decoder", combined.len());
                        audio_bytes = combined;
                    } else {
                        log::error!("[RodioPlayer] Combined buffer empty after downloading all segments");
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
