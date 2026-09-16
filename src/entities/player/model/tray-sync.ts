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
}

export type TrayPlayerCommand =
  | { action: 'toggle-play' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'toggle-like' }
  | { action: 'seek'; payload: number }
  | { action: 'open-app' }
  | { action: 'request-sync' };

export const TRAY_STATE_EVENT = 'tray-player-state';
export const TRAY_COMMAND_EVENT = 'tray-player-command';
