use std::{collections::HashSet, sync::Arc, time::Duration};
use serde::Deserialize;
use tokio::time::timeout;

use crate::domain::{
    errors::DomainError,
    models::Track,
    ports::SoundCloudGateway,
};

#[derive(Debug, Clone, Deserialize)]
pub struct GenerateWaveBatchInput {
    pub vibe: Option<String>,
    pub current_track_id: Option<u64>,
    #[serde(default)]
    pub seed_track_ids: Vec<u64>,
    #[serde(default)]
    pub exclude_track_ids: Vec<u64>,
    #[serde(default)]
    pub disliked_genres: Vec<String>,
    #[serde(default)]
    pub disliked_artists: Vec<String>,
    pub limit: Option<u32>,
}

pub struct GenerateWaveBatchUseCase {
    gateway: Arc<dyn SoundCloudGateway>,
}

impl GenerateWaveBatchUseCase {
    pub fn new(gateway: Arc<dyn SoundCloudGateway>) -> Self {
        Self { gateway }
    }

    pub async fn execute(&self, input: GenerateWaveBatchInput) -> Result<Vec<Track>, DomainError> {
        let limit = input.limit.unwrap_or(12) as usize;
        let mut exclude_set: HashSet<u64> = input.exclude_track_ids.into_iter().collect();
        if let Some(cur_id) = input.current_track_id {
            exclude_set.insert(cur_id);
        }

        let mut candidate_tracks: Vec<Track> = Vec::new();
        let mut seen_ids: HashSet<u64> = HashSet::new();

        // 1. Сбор треков с трек-станции текущего трека (с защитным таймаутом 6 секунд)
        if let Some(current_id) = input.current_track_id {
            let gw = self.gateway.clone();
            if let Ok(Ok(tracks)) = timeout(Duration::from_secs(6), gw.get_related_tracks(current_id, 20)).await {
                for t in tracks {
                    if !exclude_set.contains(&t.id)
                        && !seen_ids.contains(&t.id)
                        && !Self::is_disliked(&t, &input.disliked_artists, &input.disliked_genres)
                    {
                        seen_ids.insert(t.id);
                        candidate_tracks.push(t);
                    }
                }
            }
        }

        // 2. Сбор треков по случайным сид-трекам пользователя (до 2 сидов)
        let mut seeds = input.seed_track_ids.clone();
        if seeds.len() > 2 {
            use std::collections::hash_map::RandomState;
            use std::hash::{BuildHasher, Hasher};
            let seed_idx = (RandomState::new().build_hasher().finish() as usize) % seeds.len();
            let selected_seed = seeds.remove(seed_idx);
            let mut selected = vec![selected_seed];
            if !seeds.is_empty() {
                let second_idx = (RandomState::new().build_hasher().finish() as usize) % seeds.len();
                selected.push(seeds.remove(second_idx));
            }
            seeds = selected;
        }

        for seed_id in seeds {
            if candidate_tracks.len() >= 30 {
                break;
            }
            let gw = self.gateway.clone();
            if let Ok(Ok(tracks)) = timeout(Duration::from_secs(6), gw.get_related_tracks(seed_id, 16)).await {
                for t in tracks {
                    if !exclude_set.contains(&t.id)
                        && !seen_ids.contains(&t.id)
                        && !Self::is_disliked(&t, &input.disliked_artists, &input.disliked_genres)
                    {
                        seen_ids.insert(t.id);
                        candidate_tracks.push(t);
                    }
                }
            }
        }

        // 3. Дополнительный fallback по вайбу, если треков недостаточно
        if candidate_tracks.len() < limit {
            let vibe_genre = match input.vibe.as_deref() {
                Some("energetic") => Some("electronic"),
                Some("calm") => Some("ambient"),
                Some("familiar") => None,
                _ => None,
            };

            let gw = self.gateway.clone();
            if let Ok(Ok(trending)) = timeout(Duration::from_secs(6), gw.get_trending(vibe_genre, 20)).await {
                for t in trending {
                    if !exclude_set.contains(&t.id)
                        && !seen_ids.contains(&t.id)
                        && !Self::is_disliked(&t, &input.disliked_artists, &input.disliked_genres)
                    {
                        seen_ids.insert(t.id);
                        candidate_tracks.push(t);
                    }
                }
            }
        }

        // 4. Общий fallback трендов, если всё ещё меньше 4 треков
        if candidate_tracks.len() < 4 {
            let gw = self.gateway.clone();
            if let Ok(Ok(fallback)) = timeout(Duration::from_secs(6), gw.get_trending(None, 20)).await {
                for t in fallback {
                    if !exclude_set.contains(&t.id)
                        && !seen_ids.contains(&t.id)
                        && !Self::is_disliked(&t, &input.disliked_artists, &input.disliked_genres)
                    {
                        seen_ids.insert(t.id);
                        candidate_tracks.push(t);
                    }
                }
            }
        }

        // 5. DJ smoothing: чередование авторов без повторяющихся подряд артистов
        let smoothed = Self::smooth_shuffle(candidate_tracks);
        let result: Vec<Track> = smoothed.into_iter().take(limit).collect();

        Ok(result)
    }

    fn is_disliked(track: &Track, disliked_artists: &[String], disliked_genres: &[String]) -> bool {
        let artist_lower = track.artist.trim().to_lowercase();
        for da in disliked_artists {
            let da_clean = da.trim().to_lowercase();
            if !da_clean.is_empty() && (artist_lower == da_clean || artist_lower.contains(&da_clean)) {
                return true;
            }
        }

        let genre_lower = track.genre.as_deref().unwrap_or("").trim().to_lowercase();
        let title_lower = track.title.trim().to_lowercase();
        for dg in disliked_genres {
            let dg_clean = dg.trim().to_lowercase();
            if !dg_clean.is_empty() {
                if !genre_lower.is_empty() && (genre_lower == dg_clean || genre_lower.contains(&dg_clean)) {
                    return true;
                }
                if title_lower.contains(&dg_clean) {
                    return true;
                }
            }
        }

        false
    }

    fn smooth_shuffle(mut tracks: Vec<Track>) -> Vec<Track> {
        if tracks.len() <= 2 {
            return tracks;
        }

        // Простая псевдослучайная перестановка пула
        use std::collections::hash_map::RandomState;
        use std::hash::{BuildHasher, Hasher};
        let seed = RandomState::new().build_hasher().finish() as usize;
        for i in (1..tracks.len()).rev() {
            let j = (seed.wrapping_mul(i + 13)) % (i + 1);
            tracks.swap(i, j);
        }

        let mut pool = tracks;
        let mut result = Vec::with_capacity(pool.len());

        while !pool.is_empty() {
            let last_artist = result.last().map(|t: &Track| t.artist.trim().to_lowercase());
            let candidate_idx = if let Some(ref la) = last_artist {
                pool.iter().position(|t| t.artist.trim().to_lowercase() != *la)
            } else {
                Some(0)
            };

            if let Some(idx) = candidate_idx {
                result.push(pool.remove(idx));
            } else {
                result.push(pool.remove(0));
            }
        }

        result
    }
}
