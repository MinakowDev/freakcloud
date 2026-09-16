import { createContext, useContext } from 'react';
import type { AudioSource, Track } from '../../track/model/types';

export type RepeatMode = 'off' | 'track' | 'queue';

export interface PlayerContextValue {
  currentTrack: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  audioSource: AudioSource | null;
  queue: Track[];
  currentIndex: number;
  isQueueOpen: boolean;
  isWaveMode: boolean;
  setWaveMode: (enabled: boolean) => void;
  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
  playTrackAtIndex: (index: number) => Promise<void>;
  togglePlayPause: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
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
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export const usePlayer = (): PlayerContextValue => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};
