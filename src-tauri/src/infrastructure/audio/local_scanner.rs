use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;

use crate::domain::models::{Track, TrackSource};

const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma"];

/// Recursively scans directory for supported audio files and constructs Track entities
pub fn scan_directory(dir_path: &Path, max_depth: usize) -> Vec<Track> {
    let mut tracks = Vec::new();
    scan_recursive(dir_path, 0, max_depth, &mut tracks);
    tracks
}

fn scan_recursive(current: &Path, current_depth: usize, max_depth: usize, out: &mut Vec<Track>) {
    if current_depth > max_depth {
        return;
    }

    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(err) => {
            log::warn!("[LocalScanner] Cannot read directory {:?}: {:?}", current, err);
            return;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_recursive(&path, current_depth + 1, max_depth, out);
        } else if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if SUPPORTED_EXTENSIONS.iter().any(|&s| s.eq_ignore_ascii_case(ext)) {
                    if let Some(track) = build_track_from_file(&path) {
                        out.push(track);
                    }
                }
            }
        }
    }
}

fn build_track_from_file(path: &Path) -> Option<Track> {
    let file_stem = path.file_stem()?.to_string_lossy().to_string();
    let path_str = path.to_string_lossy().to_string();

    // Generate deterministic hash ID for local file
    let mut hasher = DefaultHasher::new();
    path_str.hash(&mut hasher);
    let raw_hash = hasher.finish();
    // High bit set to distinguish from SoundCloud IDs
    let track_id = 0x8000_0000_0000_0000 | (raw_hash & 0x7FFF_FFFF_FFFF_FFFF);

    // Clean track name and parse "Artist - Title" format
    let clean_stem = strip_track_number_prefix(&file_stem);
    let (artist, title) = if let Some((a, t)) = clean_stem.split_once(" - ") {
        (a.trim().to_string(), t.trim().to_string())
    } else if let Some((a, t)) = clean_stem.split_once(" — ") {
        (a.trim().to_string(), t.trim().to_string())
    } else {
        ("Local Audio".to_string(), clean_stem)
    };

    // Calculate duration estimate (fallback to 180s if metadata probe unavailable)
    let duration_ms = estimate_duration_ms(path);

    Some(Track {
        id: track_id,
        title,
        artist,
        artist_id: None,
        duration_ms,
        artwork_url: None,
        waveform_url: None,
        stream_url: Some(path_str.clone()),
        playback_count: None,
        likes_count: None,
        genre: Some("Local".to_string()),
        permalink_url: path_str.clone(),
        source: TrackSource::Local,
        external_id: path_str,
    })
}

fn strip_track_number_prefix(name: &str) -> String {
    let trimmed = name.trim();
    // Check patterns like "01. Title" or "01 - Title" or "1. Title"
    if let Some(idx) = trimmed.find(|c: char| c == '.' || c == '-') {
        let prefix = &trimmed[..idx];
        if prefix.chars().all(|c| c.is_ascii_digit() || c.is_whitespace()) && idx < 5 {
            let rest = trimmed[idx + 1..].trim();
            if !rest.is_empty() {
                return rest.to_string();
            }
        }
    }
    trimmed.to_string()
}

fn estimate_duration_ms(path: &Path) -> u32 {
    if let Ok(metadata) = fs::metadata(path) {
        let bytes = metadata.len();
        if bytes > 0 {
            // Rough estimation for average 256kbps audio (32 KB/sec)
            let seconds = (bytes / 32_000) as u32;
            if seconds > 5 && seconds < 7200 {
                return seconds * 1000;
            }
        }
    }
    180_000 // 3 minutes default fallback
}
