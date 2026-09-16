import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { AudioSource, Track } from '../../track/model/types';
import { useCache } from '../../track/model/cache-context';
import { AudioEngine } from '../lib/audio-engine';
import { tauriApi } from '../../../shared/api/tauri-client';
import { recordTrackListen, recordTrackSkip } from '../../track/lib/taste-graph';
import { generateWaveBatch } from '../../track/lib/wave-algorithm';
import { useLikes } from '../../track/model/likes-context';
import { PlayerContext, type PlayerContextValue, type RepeatMode } from './player-context';
import {
  TRAY_COMMAND_EVENT,
  TRAY_STATE_EVENT,
  type TrayPlayerCommand,
  type TrayPlayerState,
} from './tray-sync';

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

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const durationRef = useRef<number>(duration);
  durationRef.current = duration;

  const trackStartTimeRef = useRef<number>(Date.now());
  const isRefillingWaveRef = useRef<boolean>(false);
  // History of played indices for prev-track in shuffle mode
  const shuffleHistoryRef = useRef<number[]>([]);
  const lastPrevClickTimeRef = useRef<number>(0);
  const lastBroadcastSecRef = useRef<number>(-1);
  const lastStateUpdateTimeRef = useRef<number>(0);

  const { isLiked, toggleLike } = useLikes();
  const isLikedRef = useRef(isLiked);
  isLikedRef.current = isLiked;
  const toggleLikeRef = useRef(toggleLike);
  toggleLikeRef.current = toggleLike;

  // Cached tray broadcast helper to prevent dynamic imports inside hot loops
  const broadcastTrayState = useCallback((cur: number, dur: number) => {
    if (!tauriApi.isTauri()) return;
    import('@tauri-apps/api/event').then(({ emit }) => {
      const track = currentTrackRef.current;
      const state: TrayPlayerState = {
        track: track
          ? {
              id: track.id,
              title: track.title,
              artist: track.artist || '',
              artwork_url: track.artwork_url,
              duration_ms: track.duration_ms,
            }
          : null,
        isPlaying: isPlayingRef.current,
        currentTime: cur,
        duration: dur,
        isLiked: track ? isLikedRef.current(track.id) : false,
      };
      emit(TRAY_STATE_EVENT, state).catch(() => {});
    }).catch(() => {});
  }, []);

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
    return (withCrossfade = false) => {
      const q = queueRef.current;
      if (q.length === 0) return;

      if (repeatModeRef.current === 'track' && currentIndexRef.current >= 0) {
        // Replay current track
        engineRef.current?.seek(0);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        engineRef.current?.play();
        return;
      }

      // Save current index into history for previous track navigation
      if (currentIndexRef.current >= 0) {
        shuffleHistoryRef.current.push(currentIndexRef.current);
        if (shuffleHistoryRef.current.length > 100) {
          shuffleHistoryRef.current.shift();
        }
      }

      let nextIdx = currentIndexRef.current + 1;
      if (isShuffleRef.current && q.length > 1) {
        // Pick random index different from current
        do {
          nextIdx = Math.floor(Math.random() * q.length);
        } while (nextIdx === currentIndexRef.current && q.length > 1);
      } else if (nextIdx >= q.length) {
        if (repeatModeRef.current === 'queue') {
          nextIdx = 0;
        } else {
          return;
        }
      }

      const nextItem = q[nextIdx];
      if (nextItem) {
        playTrackInternal(nextItem, q, nextIdx, withCrossfade);
      }
    };
  }, []);

  const handlePrevTrack = useMemo(() => {
    return () => {
      const now = Date.now();
      const isQuickRepeatedClick = (now - lastPrevClickTimeRef.current) < 1500;
      lastPrevClickTimeRef.current = now;

      const engine = engineRef.current;
      const currentPos = engine?.getCurrentTime() ?? currentTimeRef.current;

      // If played more than 3 seconds and NOT a quick second click, rewind current track to start
      if (currentPos > 3 && !isQuickRepeatedClick) {
        engine?.seek(0);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        if (isPlayingRef.current) {
          engine?.play();
        }
        return;
      }

      const q = queueRef.current;
      if (q.length === 0) {
        engine?.seek(0);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        return;
      }

      if (q.length === 1) {
        engine?.seek(0);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        if (isPlayingRef.current) {
          engine?.play();
        }
        return;
      }

      let prevIdx = -1;

      // 1. If shuffle is active, retrieve from shuffle history
      if (isShuffleRef.current && shuffleHistoryRef.current.length > 0) {
        while (shuffleHistoryRef.current.length > 0) {
          const candidate = shuffleHistoryRef.current.pop()!;
          if (candidate >= 0 && candidate < q.length && candidate !== currentIndexRef.current) {
            prevIdx = candidate;
            break;
          }
        }
      }

      // 2. If no valid shuffle history index or shuffle is disabled:
      if (prevIdx === -1) {
        if (currentIndexRef.current > 0) {
          prevIdx = currentIndexRef.current - 1;
        } else if (repeatModeRef.current === 'queue') {
          // Wrap around to end of queue
          prevIdx = q.length - 1;
        } else {
          // At the start of queue and repeat is off: rewind to start
          engine?.seek(0);
          setCurrentTime(0);
          currentTimeRef.current = 0;
          if (isPlayingRef.current) {
            engine?.play();
          }
          return;
        }
      }

      const prevItem = q[prevIdx];
      if (prevItem) {
        playTrackInternal(prevItem, q, prevIdx, false);
      }
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.setListeners({
      onTimeUpdate: (cur, dur) => {
        currentTimeRef.current = cur;
        durationRef.current = dur;

        // Throttle React state updates to 250ms (4fps) for smooth scrub slider without cascading re-renders
        const now = Date.now();
        if (now - lastStateUpdateTimeRef.current >= 250 || cur === 0) {
          lastStateUpdateTimeRef.current = now;
          setCurrentTime(cur);
          setDuration(dur);
        }

        // Broadcast to system tray once per second
        if (Math.floor(cur) !== Math.floor(lastBroadcastSecRef.current)) {
          lastBroadcastSecRef.current = cur;
          broadcastTrayState(cur, dur);
        }
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
        handleNextTrack(false);
      },
      onApproachingEnd: () => {
        handleNextTrack(true);
      },
    });

    return () => {
      engine.destroy();
    };
  }, [handleNextTrack]);

  // Broadcast player state to Tray Widget and listen for incoming commands
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const broadcast = async () => {
      if (!tauriApi.isTauri()) return;
      try {
        const { emit } = await import('@tauri-apps/api/event');
        const track = currentTrackRef.current;
        const state: TrayPlayerState = {
          track: track
            ? {
                id: track.id,
                title: track.title,
                artist: track.artist || '',
                artwork_url: track.artwork_url,
                duration_ms: track.duration_ms,
              }
            : null,
          isPlaying: isPlayingRef.current,
          currentTime: currentTimeRef.current,
          duration: durationRef.current,
          isLiked: track ? isLikedRef.current(track.id) : false,
        };
        await emit(TRAY_STATE_EVENT, state);
      } catch (err) {
        console.warn('[TraySync] Failed to emit tray state:', err);
      }
    };

    broadcast();

    if (tauriApi.isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<TrayPlayerCommand>(TRAY_COMMAND_EVENT, (event) => {
          const cmd = event.payload;
          if (!cmd) return;
          switch (cmd.action) {
            case 'toggle-play':
              togglePlayPause();
              break;
            case 'next':
              handleNextTrack(false);
              break;
            case 'previous':
              handlePrevTrack();
              break;
            case 'toggle-like':
              if (currentTrackRef.current) {
                toggleLikeRef.current(currentTrackRef.current);
              }
              break;
            case 'seek':
              if (typeof cmd.payload === 'number') {
                seekTo(cmd.payload);
              }
              break;
            case 'open-app':
              tauriApi.showMainWindow();
              break;
            case 'request-sync':
              broadcast();
              break;
          }
        }).then((fn) => {
          unlisten = fn;
        });
      });
    }

    return () => {
      unlisten?.();
    };
  }, [currentTrack?.id, isPlaying, handleNextTrack, handlePrevTrack]);

  // Broadcast player state to Discord RPC
  useEffect(() => {
    if (!tauriApi.isTauri()) return;

    if (!currentTrack) {
      tauriApi.clearDiscordRpc().catch(() => {});
      return;
    }

    const durSec = duration > 0 ? Math.round(duration) : Math.round((currentTrack.duration_ms || 0) / 1000);
    const curSec = Math.round(currentTimeRef.current);

    tauriApi.updateDiscordRpc({
      title: currentTrack.title,
      artist: currentTrack.artist || 'SoundCloud',
      artwork_url: currentTrack.artwork_url,
      permalink_url: currentTrack.permalink_url,
      is_playing: isPlaying,
      current_time_sec: curSec,
      duration_sec: durSec,
    }).catch((err) => {
      console.warn('[DiscordRPC] Failed to update Discord status:', err);
    });
  }, [currentTrack?.id, isPlaying, duration]);

  // Sync initial Discord RPC setting from localStorage
  useEffect(() => {
    if (tauriApi.isTauri()) {
      const enabled = localStorage.getItem('discord_rpc_enabled') !== 'false';
      tauriApi.setDiscordRpcEnabled(enabled).catch(() => {});
    }
  }, []);

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

  // Infinite Wave / Autoplay Mode: auto-replenish queue with batch when approaching the end
  useEffect(() => {
    const isAutoplayActive = isWaveMode || localStorage.getItem('freakcloud_autoplay_wave') !== 'false';
    if (!isAutoplayActive) return;
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
            batchSize: 10,
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
  }, [isWaveMode, queue.length, currentIndex, currentTrack?.id]);

  const playTrackInternal = async (
    track: Track,
    queueList?: Track[],
    index?: number,
    enableCrossfade = false
  ) => {
    try {
      if (currentTrackRef.current && currentTrackRef.current.id !== track.id) {
        recordCurrentTrackBehavior();
      }
      trackStartTimeRef.current = Date.now();

      setIsBuffering(true);
      setCurrentTrack(track);
      currentTrackRef.current = track;

      if (queueList) {
        setQueue(queueList);
        queueRef.current = queueList;
        const idx = index !== undefined ? index : queueList.findIndex((t) => t.id === track.id);
        setCurrentIndex(idx);
        currentIndexRef.current = idx;
      }

      // Resolve stream URL using Cache-First strategy from Rust backend
      const source = await tauriApi.getTrackStream(track.id);
      setAudioSource(source);

      const playableUrl = tauriApi.resolveAudioUrl(source);
      await engineRef.current?.load(playableUrl, true, enableCrossfade);
    } catch (err) {
      console.error('Failed to play track:', err);
      setIsBuffering(false);
      setIsPlaying(false);
    }
  };

  const playTrack = async (track: Track, newQueue?: Track[]) => {
    if (newQueue) {
      const autoplayPref = localStorage.getItem('freakcloud_autoplay_wave') !== 'false';
      if (!autoplayPref) {
        setWaveMode(false);
      }
      shuffleHistoryRef.current = [];
    } else if (currentIndexRef.current >= 0) {
      shuffleHistoryRef.current.push(currentIndexRef.current);
    }
    await playTrackInternal(track, newQueue || (queue.length > 0 ? queue : [track]), undefined, false);
  };

  const playTrackAtIndex = async (idx: number) => {
    const q = queueRef.current;
    if (idx < 0 || idx >= q.length) return;
    const target = q[idx];
    if (!target) return;
    if (currentIndexRef.current >= 0 && currentIndexRef.current !== idx) {
      shuffleHistoryRef.current.push(currentIndexRef.current);
    }
    await playTrackInternal(target, q, idx, false);
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
    currentTimeRef.current = seconds;
    lastStateUpdateTimeRef.current = Date.now();
    setCurrentTime(seconds);
    if (tauriApi.isTauri() && currentTrackRef.current) {
      const track = currentTrackRef.current;
      const durSec = durationRef.current > 0 ? Math.round(durationRef.current) : Math.round((track.duration_ms || 0) / 1000);
      tauriApi.updateDiscordRpc({
        title: track.title,
        artist: track.artist || 'SoundCloud',
        artwork_url: track.artwork_url,
        permalink_url: track.permalink_url,
        is_playing: isPlayingRef.current,
        current_time_sec: Math.round(seconds),
        duration_sec: durSec,
      }).catch(() => {});
    }
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
    playTrackAtIndex,
    togglePlayPause,
    nextTrack: () => handleNextTrack(false),
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
