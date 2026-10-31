import { createContext, useContext } from 'react';
import type { AudioSource, Track } from '../../track/model/types';
import type { PlayerStatus } from './player-state-machine';

export type RepeatMode = 'off' | 'track' | 'queue';

export interface PlayerProgressContextValue {
  currentTime: number;
  duration: number;
}

export const PlayerProgressContext = createContext<PlayerProgressContextValue>({
  currentTime: 0,
  duration: 0,
});

export const usePlayerProgress = (): PlayerProgressContextValue => {
  return useContext(PlayerProgressContext);
};

export interface PlayerContextValue {
  playerStatus: PlayerStatus;
  currentTrack: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  audioSource: AudioSource | null;
  queue: Track[];
  currentIndex: number;
  isQueueOpen: boolean;
  isLyricsOpen: boolean;
  isWaveMode: boolean;
  setWaveMode: (enabled: boolean) => void;
  startWave: (vibe?: string) => Promise<void>;
  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
  playTrackAtIndex: (index: number) => Promise<void>;
  togglePlayPause: () => void;
  nextTrack: (forceSkipRepeat?: boolean | unknown) => void;
  previousTrack: () => void;
  dislikeTrack: (track: Track) => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggleQueueOpen: () => void;
  toggleLyricsOpen: () => void;
  setLyricsOpen: (open: boolean) => void;
  playbackError: string | null;
  clearPlaybackError: () => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export const usePlayer = (): PlayerContextValue => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};
