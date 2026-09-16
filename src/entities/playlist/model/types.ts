import type { Track } from '../../track/model/types';

export interface Playlist {
  id: number;
  title: string;
  author: string;
  author_id?: number;
  duration_ms: number;
  artwork_url?: string;
  track_count: number;
  permalink_url?: string;
  is_album: boolean;
  tracks?: Track[];
}
