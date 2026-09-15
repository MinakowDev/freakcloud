import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
import type { AudioSource, Track } from '../../track/model/types';
import { useCache } from '../../track/model/cache-context';
import { AudioEngine } from '../lib/audio-engine';
import { tauriApi } from '../../../shared/api/tauri-client';
import { recordTrackListen, recordTrackSkip } from '../../track/lib/taste-graph';
import { generateWaveBatch } from '../../track/lib/wave-algorithm';

export type RepeatMode = 'off' | 'track' | 'queue';

interface PlayerContextValue {
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

const PlayerContext = createContext<PlayerContextValue | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [audioSource, setAudioSource] = useState<AudioSource | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isWaveMode, setWaveMode] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new AudioEngine();
  }

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const repeatModeRef = useRef(repeatMode);
  repeatModeRef.current = repeatMode;

  const isShuffleRef = useRef(isShuffle);
  isShuffleRef.current = isShuffle;

  const currentTrackRef = useRef<Track | null>(currentTrack);
  currentTrackRef.current = currentTrack;

  const currentTimeRef = useRef<number>(currentTime);
  currentTimeRef.current = currentTime;

  const durationRef = useRef<number>(duration);
  durationRef.current = duration;

  const trackStartTimeRef = useRef<number>(Date.now());
  const isRefillingWaveRef = useRef<boolean>(false);

  const recordCurrentTrackBehavior = () => {
    const track = currentTrackRef.current;
    if (!track) return;

    const playedSec = currentTimeRef.current;
    const durSec = durationRef.current > 0 ? durationRef.current : (track.duration_ms || 180000) / 1000;

    // Substantial listen (>= 30s or >= 50% of track)
    if (playedSec >= 30 || (durSec > 0 && playedSec >= durSec * 0.5)) {
      recordTrackListen(track, playedSec, durSec);
    } else if (playedSec < 15 && durSec > 25) {
      // Rapid skip
      recordTrackSkip(track, playedSec);
    }
  };

  // Actions
  const handleNextTrack = useMemo(() => {
    return () => {
      const q = queueRef.current;
      if (q.length === 0) return;

      if (repeatModeRef.current === 'track' && currentIndexRef.current >= 0) {
        // Replay current track
        engineRef.current?.seek(0);
        engineRef.current?.play();
        return;
      }

      let nextIdx = currentIndexRef.current + 1;
      if (isShuffleRef.current && q.length > 1) {
        nextIdx = Math.floor(Math.random() * q.length);
      } else if (nextIdx >= q.length) {
        if (repeatModeRef.current === 'queue') {
          nextIdx = 0;
        } else {
          return;
        }
      }

      const nextItem = q[nextIdx];
      if (nextItem) {
        playTrackInternal(nextItem, q, nextIdx);
      }
    };
  }, []);

  const handlePrevTrack = useMemo(() => {
    return () => {
      // If played more than 3 seconds, rewind to start
      if (engineRef.current && engineRef.current.getCurrentTime() > 3) {
        engineRef.current.seek(0);
        return;
      }

      const q = queueRef.current;
      if (q.length === 0) return;

      const prevIdx = currentIndexRef.current - 1;
      if (prevIdx >= 0) {
        const prevItem = q[prevIdx];
        if (prevItem) {
          playTrackInternal(prevItem, q, prevIdx);
        }
      } else {
        engineRef.current?.seek(0);
      }
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.setListeners({
      onTimeUpdate: (cur, dur) => {
        setCurrentTime(cur);
        setDuration(dur);
      },
      onStatusChange: (status) => {
        if (status === 'playing') {
          setIsPlaying(true);
          setIsBuffering(false);
        } else if (status === 'paused' || status === 'ended') {
          setIsPlaying(false);
          setIsBuffering(false);
        } else if (status === 'buffering') {
          setIsBuffering(true);
        }
      },
      onTrackEnded: () => {
        const track = currentTrackRef.current;
        if (track) {
          const durSec = durationRef.current > 0 ? durationRef.current : (track.duration_ms || 180000) / 1000;
          recordTrackListen(track, durSec, durSec);
        }
        handleNextTrack();
      },
      onApproachingEnd: () => {
        handleNextTrack();
      },
    });

    return () => {
      engine.destroy();
    };
  }, [handleNextTrack]);

  const { autoCache, isCached, isManuallyRemoved, cacheTrack, cachedTracks } = useCache();
  const cachedTracksRef = useRef(cachedTracks);
  cachedTracksRef.current = cachedTracks;

  // Track the track ID that was evaluated for auto-caching to prevent re-caching when deleted during playback
  const lastAutoCheckedTrackIdRef = useRef<number | null>(null);

  // Auto-cache playing track if setting is enabled and track is not cached yet or manually removed
  useEffect(() => {
    if (!autoCache || !currentTrack) return;
    if (lastAutoCheckedTrackIdRef.current === currentTrack.id) return;
    lastAutoCheckedTrackIdRef.current = currentTrack.id;

    if (!isCached(currentTrack.id) && !isManuallyRemoved(currentTrack.id)) {
      cacheTrack(currentTrack).catch((err) => {
        console.error('Auto-cache track failed:', err);
      });
    }
  }, [currentTrack?.id, autoCache, isCached, isManuallyRemoved, cacheTrack]);

  // Infinite Wave Mode: auto-replenish queue when approaching the end
  useEffect(() => {
    if (!isWaveMode) return;
    if (queue.length === 0) return;

    const remaining = queue.length - currentIndex;
    if (remaining <= 3 && !isRefillingWaveRef.current) {
      isRefillingWaveRef.current = true;
      (async () => {
        try {
          let userLikes: Track[] = [];
          try {
            userLikes = await tauriApi.getMyLikes(50);
          } catch {
            // Ignore if guest or network error
          }
          const excludeIds = new Set(queueRef.current.map((t) => t.id));
          const freshBatch = await generateWaveBatch({
            vibe: 'discover',
            likes: userLikes,
            cached: cachedTracksRef.current,
            excludeIds,
            batchSize: 12,
            currentTrackId: currentTrack?.id,
          });

          if (freshBatch.length > 0) {
            setQueue((prev) => [...prev, ...freshBatch]);
          }
        } catch (err) {
          console.error('[Player] Failed to replenish wave queue:', err);
        } finally {
          isRefillingWaveRef.current = false;
        }
      })();
    }
  }, [isWaveMode, queue.length, currentIndex]);

  const playTrackInternal = async (track: Track, queueList?: Track[], index?: number) => {
    try {
      if (currentTrackRef.current && currentTrackRef.current.id !== track.id) {
        recordCurrentTrackBehavior();
      }
      trackStartTimeRef.current = Date.now();

      setIsBuffering(true);
      setCurrentTrack(track);

      if (queueList) {
        setQueue(queueList);
        const idx = index !== undefined ? index : queueList.findIndex((t) => t.id === track.id);
        setCurrentIndex(idx);
      }

      // Resolve stream URL using Cache-First strategy from Rust backend
      const source = await tauriApi.getTrackStream(track.id);
      setAudioSource(source);

      const playableUrl = tauriApi.resolveAudioUrl(source);
      await engineRef.current?.load(playableUrl, true);
    } catch (err) {
      console.error('Failed to play track:', err);
      setIsBuffering(false);
      setIsPlaying(false);
    }
  };

  const playTrack = async (track: Track, newQueue?: Track[]) => {
    if (newQueue) {
      // Starting a custom playlist resets infinite wave mode unless explicitly set
      setWaveMode(false);
    }
    await playTrackInternal(track, newQueue || (queue.length > 0 ? queue : [track]));
  };

  const togglePlayPause = () => {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.pause();
    } else {
      engineRef.current.play();
    }
  };

  const seekTo = (seconds: number) => {
    engineRef.current?.seek(seconds);
    setCurrentTime(seconds);
  };

  const setVolume = (val: number) => {
    setVolumeState(val);
    engineRef.current?.setVolume(val);
    if (isMuted && val > 0) {
      setIsMuted(false);
      engineRef.current?.setMuted(false);
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    engineRef.current?.setMuted(next);
  };

  const toggleShuffle = () => {
    setIsShuffle((prev) => !prev);
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'queue';
      if (prev === 'queue') return 'track';
      return 'off';
    });
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => [...prev, track]);
    if (!currentTrack) {
      playTrackInternal(track, [track], 0);
    }
  };

  const playNext = (track: Track) => {
    if (!currentTrack) {
      playTrackInternal(track, [track], 0);
      return;
    }
    setQueue((prev) => {
      const nextIdx = currentIndexRef.current + 1;
      const next = [...prev];
      next.splice(nextIdx, 0, track);
      return next;
    });
  };

  const removeFromQueue = (index: number) => {
    setQueue((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (index < currentIndexRef.current) {
        setCurrentIndex((idx) => Math.max(0, idx - 1));
      }
      return next;
    });
  };

  const clearQueue = () => {
    setWaveMode(false);
    setQueue((prev) => {
      if (currentTrack && currentIndexRef.current >= 0 && currentIndexRef.current < prev.length) {
        return [prev[currentIndexRef.current]!];
      }
      return [];
    });
    setCurrentIndex(0);
  };

  const toggleQueueOpen = () => {
    setIsQueueOpen((prev) => !prev);
  };

  const value: PlayerContextValue = {
    currentTrack,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    audioSource,
    queue,
    currentIndex,
    isQueueOpen,
    isWaveMode,
    setWaveMode,
    playTrack,
    togglePlayPause,
    nextTrack: handleNextTrack,
    previousTrack: handlePrevTrack,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    addToQueue,
    playNext,
    removeFromQueue,
    clearQueue,
    toggleQueueOpen,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};

export const usePlayer = (): PlayerContextValue => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};
