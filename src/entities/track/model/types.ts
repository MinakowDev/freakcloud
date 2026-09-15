export interface Track {
  id: number;
  title: string;
  artist: string;
  artist_id?: number;
  duration_ms: number;
  artwork_url?: string;
  waveform_url?: string;
  stream_url?: string;
  playback_count?: number;
  likes_count?: number;
  genre?: string;
  permalink_url: string;
  is_cached?: boolean;
}

export interface AudioSource {
  url: string;
  is_local: boolean;
  file_path?: string;
}

export interface CacheStats {
  total_tracks: number;
  total_size_bytes: number;
}
