export interface TrayTrackInfo {
  id: number;
  title: string;
  artist: string;
  artwork_url?: string;
  duration_ms?: number;
}

export interface TrayPlayerState {
  track: TrayTrackInfo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLiked: boolean;
  isWaveMode: boolean;
  isShuffle?: boolean;
  repeatMode?: 'off' | 'track' | 'queue';
}

export type TrayPlayerCommand =
  | { action: 'toggle-play' }
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'stop' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'toggle-like' }
  | { action: 'toggle-shuffle' }
  | { action: 'toggle-repeat' }
  | { action: 'seek'; payload: number }
  | { action: 'open-app' }
  | { action: 'start-wave' }
  | { action: 'request-sync' };

export const TRAY_STATE_EVENT = 'tray-player-state';
export const TRAY_COMMAND_EVENT = 'tray-player-command';
