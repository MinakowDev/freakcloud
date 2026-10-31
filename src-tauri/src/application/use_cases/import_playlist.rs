use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::{
    domain::{
        errors::DomainError,
        models::{Playlist, Track},
        ports::{PlaylistRepository, SoundCloudGateway},
    },
    infrastructure::importer::{ExternalImporter, ExternalPlaylistMeta, ExternalTrackMeta},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProgressPayload {
    pub current: usize,
    pub total: usize,
    pub matched: usize,
    pub current_track: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub playlist_id: Option<u64>,
    pub title: String,
    pub total_tracks: usize,
    pub matched_tracks: usize,
    pub unmatched: Vec<ExternalTrackMeta>,
    #[serde(default)]
    pub cancelled: bool,
}

pub struct ImportPlaylistUseCase {
    importer: Arc<ExternalImporter>,
    gateway: Arc<dyn SoundCloudGateway>,
    repo: Arc<dyn PlaylistRepository>,
    cancelled: Arc<AtomicBool>,
}

impl ImportPlaylistUseCase {
    pub fn new(
        importer: Arc<ExternalImporter>,
        gateway: Arc<dyn SoundCloudGateway>,
        repo: Arc<dyn PlaylistRepository>,
    ) -> Self {
        Self {
            importer,
            gateway,
            repo,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    /// Быстрый предпросмотр содержимого плейлиста без поиска в SoundCloud
    pub async fn preview(
        &self,
        input: &str,
        custom_title: Option<String>,
    ) -> Result<ExternalPlaylistMeta, DomainError> {
        self.importer.parse_input(input, custom_title).await
    }

    /// Полноценный импорт: поиск треков в SoundCloud, отправка прогресса и сохранение
    pub async fn execute(
        &self,
        app: &AppHandle,
        meta: ExternalPlaylistMeta,
    ) -> Result<ImportSummary, DomainError> {
        self.cancelled.store(false, Ordering::Relaxed);
        let total = meta.tracks.len();
        let mut matched_tracks: Vec<Track> = Vec::new();
        let mut unmatched: Vec<ExternalTrackMeta> = Vec::new();

        for (idx, target_track) in meta.tracks.iter().enumerate() {
            if self.cancelled.load(Ordering::Relaxed) {
                log::info!("[Import] Import cancelled by user at track {}/{}", idx + 1, total);
                break;
            }

            let current_desc = if target_track.artist.is_empty() {
                target_track.title.clone()
            } else {
                format!("{} - {}", target_track.artist, target_track.title)
            };

            // Эмитим текущий прогресс на фронтенд
            let _ = app.emit(
                "import:progress",
                ImportProgressPayload {
                    current: idx + 1,
                    total,
                    matched: matched_tracks.len(),
                    current_track: current_desc.clone(),
                },
            );

            // Поиск в SoundCloud
            let best_match = self.find_best_match(target_track).await;

            match best_match {
                Some(track) => {
                    // Избегаем добавления дубликатов одного и того же трека
                    if !matched_tracks.iter().any(|t| t.id == track.id) {
                        matched_tracks.push(track);
                    }
                }
                None => {
                    unmatched.push(target_track.clone());
                }
            }

            // Проверяем отмену перед паузой
            if self.cancelled.load(Ordering::Relaxed) {
                log::info!("[Import] Import cancelled by user right after track {}", idx + 1);
                break;
            }

            // Небольшая пауза между запросами к SoundCloud, чтобы избежать 429
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        let was_cancelled = self.cancelled.load(Ordering::Relaxed);

        let playlist_id = if !matched_tracks.is_empty() {
            let id = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            let cover = meta.cover_url.clone().or_else(|| {
                matched_tracks
                    .first()
                    .and_then(|t| t.artwork_url.clone())
            });

            let total_dur: u32 = matched_tracks.iter().map(|t| t.duration_ms).sum();

            let service_author = match meta.service.as_str() {
                "spotify" => "Вы (Spotify)",
                "yandex" => "Вы (Яндекс Музыка)",
                _ => "Вы (Импорт)",
            };

            let playlist = Playlist {
                id,
                title: meta.title.clone(),
                author: service_author.to_string(),
                author_id: None,
                duration_ms: total_dur,
                artwork_url: cover,
                track_count: matched_tracks.len() as u32,
                permalink_url: Some(format!("{}:import", meta.service)),
                is_album: false,
                tracks: Some(matched_tracks.clone()),
                source: Some(meta.service.clone()),
            };

            self.repo.save(playlist).await?;
            Some(id)
        } else {
            None
        };

        // Финальное событие завершения или отмены
        let final_status = if was_cancelled {
            "Отменено".to_string()
        } else {
            "Завершено".to_string()
        };

        let _ = app.emit(
            "import:progress",
            ImportProgressPayload {
                current: if was_cancelled { matched_tracks.len() } else { total },
                total,
                matched: matched_tracks.len(),
                current_track: final_status,
            },
        );

        Ok(ImportSummary {
            playlist_id,
            title: meta.title,
            total_tracks: total,
            matched_tracks: matched_tracks.len(),
            unmatched,
            cancelled: was_cancelled,
        })
    }

    async fn find_best_match(&self, target: &ExternalTrackMeta) -> Option<Track> {
        let clean_title = clean_track_title(&target.title);
        let query = if target.artist.trim().is_empty() {
            clean_title.clone()
        } else {
            format!("{} {}", target.artist.trim(), clean_title)
        };

        let candidates = self.gateway.search_tracks(&query, 5, 0).await.ok()?;
        if candidates.is_empty() {
            // Если ничего не найдено по полному запросу, пробуем поискать только по названию
            let fallback_candidates = self.gateway.search_tracks(&clean_title, 5, 0).await.ok()?;
            return score_and_select(target, &fallback_candidates);
        }

        score_and_select(target, &candidates)
    }
}

/// Очистка названий треков от шумовых маркеров
fn clean_track_title(title: &str) -> String {
    let mut s = title.to_string();
    let noises = [
        "(Official Video)",
        "[Official Video]",
        "(Official Music Video)",
        "[Official Music Video]",
        "(Official Audio)",
        "[Official Audio]",
        "(Audio)",
        "[Audio]",
        "(Lyric Video)",
        "[Lyric Video]",
        "(Lyrics)",
        "[Lyrics]",
        "(Visualizer)",
        "[Visualizer]",
        "(Remastered)",
        "[Remastered]",
        "(HD)",
        "[HD]",
        "(4K)",
        "[4K]",
    ];

    for noise in noises {
        s = s.replace(noise, " ");
    }

    s.trim().to_string()
}

/// Нормализация текста: перевод в нижний регистр и удаление пунктуации
fn normalize_str(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Оценка кандидатов и выбор наиболее подходящего трека
fn score_and_select(target: &ExternalTrackMeta, candidates: &[Track]) -> Option<Track> {
    let target_title_norm = normalize_str(&clean_track_title(&target.title));
    let target_artist_norm = normalize_str(&target.artist);

    let target_words: HashSet<&str> = target_title_norm.split_whitespace().collect();
    let artist_words: HashSet<&str> = target_artist_norm.split_whitespace().collect();

    let mut best_track: Option<Track> = None;
    let mut best_score = -100i32;

    for cand in candidates {
        let cand_title_norm = normalize_str(&clean_track_title(&cand.title));
        let cand_user_norm = normalize_str(&cand.artist);

        let cand_words: HashSet<&str> = cand_title_norm.split_whitespace().collect();

        let mut score = 0i32;

        // 1. Точное или подстрочное совпадение названий
        if cand_title_norm == target_title_norm {
            score += 50;
        } else if cand_title_norm.contains(&target_title_norm) || target_title_norm.contains(&cand_title_norm) {
            score += 30;
        } else {
            // Пересечение слов в названии
            let common_words = target_words.intersection(&cand_words).count();
            if !target_words.is_empty() {
                let ratio = (common_words as f32) / (target_words.len() as f32);
                score += (ratio * 30.0) as i32;
            }
        }

        // 2. Совпадение исполнителя
        if !target_artist_norm.is_empty() {
            if cand_user_norm.contains(&target_artist_norm) || target_artist_norm.contains(&cand_user_norm) {
                score += 30;
            } else if cand_title_norm.contains(&target_artist_norm) {
                // Часто имя исполнителя в SoundCloud находится внутри названия трека
                score += 25;
            } else {
                let cand_all_words: HashSet<&str> = cand_title_norm
                    .split_whitespace()
                    .chain(cand_user_norm.split_whitespace())
                    .collect();
                let common_artist = artist_words.intersection(&cand_all_words).count();
                if !artist_words.is_empty() {
                    let ratio = (common_artist as f32) / (artist_words.len() as f32);
                    score += (ratio * 20.0) as i32;
                }
            }
        } else {
            score += 10;
        }

        // 3. Проверка длительности трека (если доступна)
        if let Some(target_dur_ms) = target.duration_ms {
            let target_secs = (target_dur_ms / 1000) as i64;
            let cand_secs = (cand.duration_ms / 1000) as i64;
            let diff = (target_secs - cand_secs).abs();

            if diff <= 6 {
                score += 30; // Практически идеальное совпадение длительности
            } else if diff <= 15 {
                score += 20;
            } else if diff <= 30 {
                score += 10;
            } else if diff > 90 {
                // Большая разница: вероятно, это часовой микс или чужой кавер
                score -= 35;
            }
        }

        if score > best_score {
            best_score = score;
            best_track = Some(cand.clone());
        }
    }

    // Минимальный порог качества для включения в плейлист
    if best_score >= 30 {
        best_track
    } else {
        None
    }
}
