import React, { useEffect, useRef, useState, useMemo, useCallback, useReducer } from 'react';
import type { AudioSource, Track } from '../../track/model/types';
import { useCache } from '../../track/model/cache-context';
import { AudioEngine } from '../lib/audio-engine';
import { getTrackLoudnessGain, LOUDNESS_NORM_EVENT } from '../lib/loudness';
import { windowsMediaControls } from '../lib/windows-media-controls';
import { tauriApi } from '../../../shared/api/tauri-client';
import {
  recordTrackListen,
  recordTrackSkip,
  blacklistNode,
  extractGenresFromTrack,
  loadTasteGraph,
} from '../../track/lib/taste-graph';
import { useLikes } from '../../track/model/likes-context';
import {
  PlayerContext,
  PlayerProgressContext,
  type PlayerContextValue,
  type PlayerProgressContextValue,
  type RepeatMode,
} from './player-context';
import {
  STORAGE_KEYS,
  PLAYER_CONFIG,
  WAVE_CONFIG,
} from '../../../shared/config';
import {
  TRAY_COMMAND_EVENT,
  TRAY_STATE_EVENT,
  type TrayPlayerCommand,
  type TrayPlayerState,
} from './tray-sync';
import {
  playerTransition,
  initialPlayerState,
  isPlayingState,
  isBufferingState,
  getPlaybackError,
} from './player-state-machine';

const getStoredVolume = (): number => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PLAYER_VOLUME);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
  } catch {}
  return PLAYER_CONFIG.DEFAULT_INITIAL_VOLUME;
};

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [playerState, dispatchPlayer] = useReducer(playerTransition, initialPlayerState);

  // Derived state directly from the deterministic State Machine
  const currentTrack = playerState.track;
  const isPlaying = isPlayingState(playerState);
  const isBuffering = isBufferingState(playerState);
  const playbackError = getPlaybackError(playerState);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState<number>(getStoredVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [audioSource, setAudioSource] = useState<AudioSource | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isWaveMode, setWaveMode] = useState(false);

  const clearPlaybackError = useCallback(() => dispatchPlayer({ type: 'CLEAR_ERROR' }), []);

  const engineRef = useRef<AudioEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new AudioEngine(getStoredVolume());
  }

  // Ensure restored volume is propagated on mount
  const volumeRef = useRef<number>(volume);
  volumeRef.current = volume;

  const trackGainRef = useRef<number>(1.0);

  const applyEngineVolume = useCallback((baseVolume: number, gain: number) => {
    const effective = Math.max(0, Math.min(baseVolume * gain, 2.0));
    engineRef.current?.setVolume(effective);
  }, []);

  useEffect(() => {
    const initVol = getStoredVolume();
    applyEngineVolume(initVol, trackGainRef.current);
  }, [applyEngineVolume]);

  // React to loudness normalization preference toggles
  useEffect(() => {
    const handleNormChange = async () => {
      const curTrack = currentTrackRef.current;
      const gain = curTrack ? await getTrackLoudnessGain(curTrack.waveform_url) : 1.0;
      trackGainRef.current = gain;
      applyEngineVolume(volumeRef.current, gain);
    };

    window.addEventListener(LOUDNESS_NORM_EVENT, handleNormChange);
    return () => window.removeEventListener(LOUDNESS_NORM_EVENT, handleNormChange);
  }, [applyEngineVolume]);

  // Synchronize global shortcuts and tray widget setting with Rust backend on mount
  useEffect(() => {
    if (tauriApi.isTauri()) {
      const shortcutsEnabled = localStorage.getItem(STORAGE_KEYS.GLOBAL_SHORTCUTS) !== 'false';
      tauriApi.setGlobalShortcutsEnabled(shortcutsEnabled).catch(() => {});

      const trayWidgetEnabled = localStorage.getItem(STORAGE_KEYS.TRAY_WIDGET_ENABLED) !== 'false';
      tauriApi.setTrayWidgetEnabled(trayWidgetEnabled).catch(() => {});
    }
  }, []);

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

  const { isLiked, toggleLike, likedTracks } = useLikes();
  const isLikedRef = useRef(isLiked);
  isLikedRef.current = isLiked;
  const likedTracksRef = useRef(likedTracks);
  likedTracksRef.current = likedTracks;
  const toggleLikeRef = useRef(toggleLike);
  toggleLikeRef.current = toggleLike;
  const isWaveModeRef = useRef(isWaveMode);
  isWaveModeRef.current = isWaveMode;
  const startWaveRef = useRef<(vibe?: string) => Promise<void>>(() => Promise.resolve());
  const failedTrackIdsRef = useRef<Set<number>>(new Set());
  const consecutiveErrorsRef = useRef<number>(0);
  const activeRefillPromiseRef = useRef<Promise<Track[]> | null>(null);
  const playTrackInternalRef = useRef<(track: Track, queueList?: Track[], index?: number) => Promise<void>>(() => Promise.resolve());
  const togglePlayPauseRef = useRef<() => void>(() => {});
  const handleNextTrackRef = useRef<(forceSkipRepeat?: boolean | unknown) => void>(() => {});
  const handlePrevTrackRef = useRef<() => void>(() => {});
  const seekToRef = useRef<(sec: number) => void>(() => {});
  const toggleShuffleRef = useRef<() => void>(() => {});
  const toggleRepeatRef = useRef<() => void>(() => {});

  // Centralized wave batch replenishment (shared between background useEffect and urgent on-demand skips)
  const refillWaveBatch = useCallback(async (): Promise<Track[]> => {
    if (activeRefillPromiseRef.current) {
      return activeRefillPromiseRef.current;
    }

    const promise = (async () => {
      isRefillingWaveRef.current = true;
      try {
        const tasteGraph = loadTasteGraph();
        const dislikedGenres = tasteGraph.blacklist?.genres || [];
        const dislikedArtists = tasteGraph.blacklist?.artists || [];
        const excludeTrackIds = Array.from(
          new Set([
            ...queueRef.current.map((t) => t.id),
            ...Array.from(failedTrackIdsRef.current),
            ...tasteGraph.recentPlayedIds,
          ])
        );
        const seedTrackIds = (likedTracksRef.current || [])
          .slice(0, WAVE_CONFIG.SEED_REPLENISH_LIMIT)
          .map((t) => t.id);

        const freshBatch = await tauriApi.generateWaveBatch({
          vibe: 'discover',
          current_track_id: currentTrackRef.current?.id,
          seed_track_ids: seedTrackIds,
          exclude_track_ids: excludeTrackIds,
          disliked_genres: dislikedGenres,
          disliked_artists: dislikedArtists,
          limit: WAVE_CONFIG.REPLENISH_BATCH_SIZE,
        });

        if (freshBatch && freshBatch.length > 0) {
          const filtered = freshBatch.filter((t) => !failedTrackIdsRef.current.has(t.id));
          return filtered;
        }
        return [];
      } catch (err) {
        console.error('[Player] Failed to generate wave batch:', err);
        return [];
      } finally {
        isRefillingWaveRef.current = false;
        activeRefillPromiseRef.current = null;
      }
    })();

    activeRefillPromiseRef.current = promise;
    return promise;
  }, []);

  // Cached tray broadcast helper to prevent dynamic imports inside hot loops
  const broadcastTrayState = useCallback((cur: number, dur: number, overrideTrack?: Track | null) => {
    if (!tauriApi.isTauri()) return;
    const track = overrideTrack !== undefined ? overrideTrack : currentTrackRef.current;
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
      duration: dur > 0 ? dur : (track?.duration_ms ? track.duration_ms / 1000 : 0),
      isLiked: track ? isLikedRef.current(track.id) : false,
      isWaveMode: isWaveModeRef.current,
      isShuffle: isShuffleRef.current,
      repeatMode: repeatModeRef.current,
    };
    try {
      localStorage.setItem(STORAGE_KEYS.TRAY_STATE, JSON.stringify(state));
    } catch {}
    import('@tauri-apps/api/event').then(({ emit }) => {
      emit(TRAY_STATE_EVENT, state).catch(() => {});
    }).catch(() => {});
  }, []);

  const recordCurrentTrackBehavior = () => {
    const track = currentTrackRef.current;
    if (!track) return;

    const playedSec = currentTimeRef.current;
    const durSec = durationRef.current > 0 ? durationRef.current : (track.duration_ms || PLAYER_CONFIG.FALLBACK_TRACK_DURATION_MS) / 1000;

    // Substantial listen (>= 30s or >= 50% of track)
    if (playedSec >= PLAYER_CONFIG.MIN_LISTEN_RECORD_SECONDS || (durSec > 0 && playedSec >= durSec * PLAYER_CONFIG.MIN_LISTEN_RECORD_RATIO)) {
      recordTrackListen(track, playedSec, durSec);
    } else if (playedSec < PLAYER_CONFIG.SKIP_RECORD_THRESHOLD_SECONDS && durSec > PLAYER_CONFIG.SKIP_RECORD_MIN_DURATION_SECONDS) {
      // Rapid skip
      recordTrackSkip(track, playedSec);
    }
  };

  // Actions
  const handleNextTrack = useMemo(() => {
    return async (forceSkipRepeat: boolean | unknown = false) => {
      const q = queueRef.current;
      if (q.length === 0) return;

      const shouldForceSkipRepeat = typeof forceSkipRepeat === 'boolean' ? forceSkipRepeat : false;
      if (!shouldForceSkipRepeat && repeatModeRef.current === 'track' && currentIndexRef.current >= 0) {
        // Replay current track
        const curTrack = q[currentIndexRef.current];
        trackStartTimeRef.current = Date.now();
        setCurrentTime(0);
        currentTimeRef.current = 0;
        try {
          await engineRef.current?.replay();
          dispatchPlayer({ type: 'PLAY' });
          broadcastTrayState(0, durationRef.current, curTrack);
          windowsMediaControls.updatePositionState(0, durationRef.current, true);
          windowsMediaControls.updatePlaybackState(true);
        } catch (err) {
          console.warn('[PlayerProvider] Replay via engine failed, falling back to full reload:', err);
          if (curTrack) {
            await playTrackInternalRef.current(curTrack, q, currentIndexRef.current);
          }
        }
        return;
      }

      // Save current index into history for previous track navigation
      if (currentIndexRef.current >= 0) {
        shuffleHistoryRef.current.push(currentIndexRef.current);
        if (shuffleHistoryRef.current.length > PLAYER_CONFIG.MAX_SHUFFLE_HISTORY_LENGTH) {
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
          const isAutoplayActive = isWaveModeRef.current || localStorage.getItem(STORAGE_KEYS.AUTOPLAY_WAVE) !== 'false';
          if (isAutoplayActive) {
            // Urgent replenishment when reaching the end of queue in wave / autoplay mode
            dispatchPlayer({ type: 'REPLENISH_START' });
            const freshBatch = await refillWaveBatch();
            if (freshBatch && freshBatch.length > 0) {
              const currentQ = queueRef.current;
              const targetIdx = currentQ.length;
              const updatedQueue = [...currentQ, ...freshBatch];
              setQueue(updatedQueue);
              queueRef.current = updatedQueue;
              await playTrackInternalRef.current(freshBatch[0], updatedQueue, targetIdx);
              return;
            }
            dispatchPlayer({ type: 'REPLENISH_FAILED' });
          }
          return;
        }
      }

      const nextItem = q[nextIdx];
      if (nextItem) {
        await playTrackInternalRef.current(nextItem, q, nextIdx);
      }
    };
  }, [refillWaveBatch]);

  const handlePrevTrack = useMemo(() => {
    return () => {
      const now = Date.now();
      const isQuickRepeatedClick = (now - lastPrevClickTimeRef.current) < PLAYER_CONFIG.QUICK_DOUBLE_CLICK_THRESHOLD_MS;
      lastPrevClickTimeRef.current = now;

      const engine = engineRef.current;
      const currentPos = engine?.getCurrentTime() ?? currentTimeRef.current;

      // If played more than 3 seconds and NOT a quick second click, rewind current track to start
      if (currentPos > PLAYER_CONFIG.PREV_TRACK_REWIND_THRESHOLD_SECONDS && !isQuickRepeatedClick) {
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
        playTrackInternalRef.current(prevItem, q, prevIdx);
      }
    };
  }, []);
  handleNextTrackRef.current = handleNextTrack;
  handlePrevTrackRef.current = handlePrevTrack;

  const dislikeTrack = useCallback(
    (track: Track) => {
      if (!track) return;
      const genres = extractGenresFromTrack(track);
      if (track.genre && track.genre.trim()) {
        const clean = track.genre.trim().toLowerCase();
        if (!genres.includes(clean)) {
          genres.push(clean);
        }
      }

      // Blacklist detected genres so they are omitted in future wave recommendations
      genres.forEach((genre) => {
        blacklistNode('genre', genre);
      });

      // Record skip penalty
      recordTrackSkip(track, 0);

      // Filter upcoming tracks of this genre from queue
      setQueue((prev) => {
        const curIdx = currentIndexRef.current;
        return prev.filter((t, idx) => {
          if (idx <= curIdx) return true;
          const tGenres = extractGenresFromTrack(t);
          if (t.genre) tGenres.push(t.genre.trim().toLowerCase());
          const hasDisliked = tGenres.some((g) => genres.includes(g));
          return !hasDisliked;
        });
      });

      // Skip current track (forcing skip even if repeat track is enabled)
      handleNextTrack(true);
    },
    [handleNextTrack]
  );

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.setListeners({
      onTimeUpdate: (cur, dur) => {
        currentTimeRef.current = cur;
        durationRef.current = dur;

        // Throttle React state updates for smooth scrub slider without cascading re-renders
        const now = Date.now();
        if (now - lastStateUpdateTimeRef.current >= PLAYER_CONFIG.TIME_UPDATE_THROTTLE_MS || cur === 0) {
          lastStateUpdateTimeRef.current = now;
          setCurrentTime(cur);
          setDuration(dur);
          windowsMediaControls.updatePositionState(cur, dur);
        }

        // Broadcast to system tray once per interval
        if (Math.floor(cur / PLAYER_CONFIG.TRAY_BROADCAST_INTERVAL_SEC) !== Math.floor(lastBroadcastSecRef.current / PLAYER_CONFIG.TRAY_BROADCAST_INTERVAL_SEC)) {
          lastBroadcastSecRef.current = cur;
          broadcastTrayState(cur, dur);
        }
      },
      onStatusChange: (status) => {
        if (status === 'playing') {
          dispatchPlayer({ type: 'TRACK_READY' });
          consecutiveErrorsRef.current = 0;
        } else if (status === 'paused' || status === 'ended') {
          dispatchPlayer({ type: 'PAUSE' });
        } else if (status === 'buffering') {
          dispatchPlayer({ type: 'BUFFERING_START' });
        }
      },
      onTrackEnded: () => {
        const track = currentTrackRef.current;
        if (track) {
          const durSec = durationRef.current > 0 ? durationRef.current : (track.duration_ms || PLAYER_CONFIG.FALLBACK_TRACK_DURATION_MS) / 1000;
          recordTrackListen(track, durSec, durSec);
        }
        handleNextTrack();
      },
    });

    return () => {
      engine.destroy();
    };
  }, [handleNextTrack]);

  // Broadcast player state to Tray Widget on track/playback changes
  useEffect(() => {
    broadcastTrayState(currentTimeRef.current, durationRef.current, currentTrack);
  }, [currentTrack, isPlaying, isShuffle, repeatMode, isWaveMode, broadcastTrayState]);

  // Synchronize Windows Media Controls (SMTC) metadata and playback state
  useEffect(() => {
    windowsMediaControls.updateMetadata(currentTrack);
  }, [currentTrack]);

  useEffect(() => {
    windowsMediaControls.updatePlaybackState(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    windowsMediaControls.setCallbacks({
      onPlay: () => {
        if (!isPlayingRef.current) {
          togglePlayPauseRef.current?.();
        }
      },
      onPause: () => {
        if (isPlayingRef.current) {
          togglePlayPauseRef.current?.();
        }
      },
      onPrevious: () => {
        handlePrevTrackRef.current?.();
      },
      onNext: () => {
        handleNextTrackRef.current?.(true);
      },
      onSeek: (positionSec) => {
        seekToRef.current?.(positionSec);
      },
    });

    return () => {
      windowsMediaControls.destroy();
    };
  }, []);

  // Listen for incoming commands from system tray (mounts once, stable)
  useEffect(() => {
    if (!tauriApi.isTauri()) return;
    let unlisten: (() => void) | undefined;

    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<TrayPlayerCommand>(TRAY_COMMAND_EVENT, (event) => {
        const cmd = event.payload;
        if (!cmd) return;
        switch (cmd.action) {
          case 'toggle-play':
            togglePlayPauseRef.current?.();
            break;
          case 'play':
            if (!isPlayingRef.current) {
              togglePlayPauseRef.current?.();
            }
            break;
          case 'pause':
          case 'stop':
            if (isPlayingRef.current) {
              togglePlayPauseRef.current?.();
            }
            break;
          case 'next':
            handleNextTrackRef.current?.(true);
            break;
          case 'previous':
            handlePrevTrackRef.current?.();
            break;
          case 'toggle-like':
            if (currentTrackRef.current) {
              toggleLikeRef.current(currentTrackRef.current);
            }
            break;
          case 'toggle-shuffle':
            toggleShuffleRef.current?.();
            break;
          case 'toggle-repeat':
            toggleRepeatRef.current?.();
            break;
          case 'seek':
            if (typeof cmd.payload === 'number') {
              seekToRef.current?.(cmd.payload);
            }
            break;
          case 'open-app':
            tauriApi.showMainWindow();
            break;
          case 'start-wave':
            startWaveRef.current();
            break;
          case 'request-sync':
            broadcastTrayState(currentTimeRef.current, durationRef.current, currentTrackRef.current);
            break;
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      unlisten?.();
    };
  }, [broadcastTrayState]);

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
      const enabled = localStorage.getItem(STORAGE_KEYS.DISCORD_RPC_ENABLED) !== 'false';
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

  // Predictive Pre-caching: cache next track in queue when current track has played for >= 5s
  const lastPrecachedTrackIdRef = useRef<number | null>(null);

  useEffect(() => {
    const precacheEnabled = localStorage.getItem(STORAGE_KEYS.PREDICTIVE_PRECACHE) !== 'false';
    if (!precacheEnabled || !isPlaying || !currentTrack) return;
    if (currentIndex < 0 || currentIndex >= queue.length - 1) return;

    const nextTrack = queue[currentIndex + 1];
    if (!nextTrack || !nextTrack.id) return;
    if (lastPrecachedTrackIdRef.current === nextTrack.id) return;

    const remainingSec = Math.max(0, PLAYER_CONFIG.PRECACHE_TRIGGER_SECONDS - currentTimeRef.current);
    const timer = setTimeout(() => {
      if (lastPrecachedTrackIdRef.current === nextTrack.id) return;
      if (!isCached(nextTrack.id) && !isManuallyRemoved(nextTrack.id)) {
        lastPrecachedTrackIdRef.current = nextTrack.id;
        cacheTrack(nextTrack).catch((err) => {
          console.warn('[Player] Predictive pre-caching failed for track:', nextTrack.title, err);
        });
      }
    }, remainingSec * 1000);

    return () => clearTimeout(timer);
  }, [isPlaying, currentTrack?.id, currentIndex, queue, isCached, isManuallyRemoved, cacheTrack]);

  // Infinite Wave / Autoplay Mode: auto-replenish queue with batch when approaching the end
  useEffect(() => {
    const isAutoplayActive = isWaveMode || localStorage.getItem(STORAGE_KEYS.AUTOPLAY_WAVE) !== 'false';
    if (!isAutoplayActive) return;
    if (queue.length === 0) return;

    const remaining = queue.length - currentIndex;
    if (remaining <= WAVE_CONFIG.REPLENISH_THRESHOLD && !isRefillingWaveRef.current) {
      refillWaveBatch().then((freshBatch) => {
        if (freshBatch && freshBatch.length > 0) {
          setQueue((prev) => {
            const nextQueue = [...prev, ...freshBatch];
            queueRef.current = nextQueue;
            return nextQueue;
          });
        }
      });
    }
  }, [isWaveMode, queue.length, currentIndex, currentTrack?.id, refillWaveBatch]);

  const playTrackInternal = async (
    track: Track,
    queueList?: Track[],
    index?: number
  ) => {
    try {
      if (currentTrackRef.current && currentTrackRef.current.id !== track.id) {
        recordCurrentTrackBehavior();
      }
      trackStartTimeRef.current = Date.now();

      dispatchPlayer({ type: 'LOAD_TRACK', track });
      currentTrackRef.current = track;
      broadcastTrayState(0, (track.duration_ms || 0) / 1000, track);

      if (queueList) {
        setQueue(queueList);
        queueRef.current = queueList;
        const idx = index !== undefined ? index : queueList.findIndex((t) => t.id === track.id);
        setCurrentIndex(idx);
        currentIndexRef.current = idx;
      }

      // Resolve stream URL using Cache-First strategy from Rust backend
      const source = await tauriApi.getTrackStream(track.id, track.source, track.external_id);
      setAudioSource(source);

      // Compute loudness normalization gain and apply to engine
      getTrackLoudnessGain(track.waveform_url).then((gain) => {
        trackGainRef.current = gain;
        applyEngineVolume(volumeRef.current, gain);
      });

      const playableUrl = source.is_local && source.file_path ? source.file_path : source.url;
      await engineRef.current?.load(playableUrl, source.is_local);
    } catch (err) {
      console.error('Failed to play track:', err);
      const errMsg = err ? String(err) : '';
      const isDrm = errMsg.toLowerCase().includes('drm') || errMsg.toLowerCase().includes('encrypted');
      const errorType = isDrm ? 'drm' : 'stream';

      // Track failed track ID so wave recommendations never suggest it again in current session
      failedTrackIdsRef.current.add(track.id);
      consecutiveErrorsRef.current += 1;

      const isAutoplayActive = isWaveModeRef.current || localStorage.getItem(STORAGE_KEYS.AUTOPLAY_WAVE) !== 'false';
      const hasNextInQueue = currentIndexRef.current < queueRef.current.length - 1;
      const canAutoSkip = isWaveModeRef.current || isAutoplayActive || hasNextInQueue;
      const willAutoRecover = canAutoSkip && consecutiveErrorsRef.current <= PLAYER_CONFIG.MAX_CONSECUTIVE_STREAM_ERRORS;

      dispatchPlayer({
        type: 'STREAM_ERROR',
        errorType,
        message: errMsg,
        canAutoRecover: willAutoRecover,
        attempt: consecutiveErrorsRef.current,
      });

      if (willAutoRecover) {
        setTimeout(() => {
          dispatchPlayer({ type: 'RECOVER_NEXT' });
          handleNextTrackRef.current?.(true);
        }, PLAYER_CONFIG.STREAM_ERROR_RECOVERY_DELAY_MS);
      }
    }
  };
  playTrackInternalRef.current = playTrackInternal;

  const playTrack = useCallback(async (track: Track, newQueue?: Track[]) => {
    if (newQueue) {
      const autoplayPref = localStorage.getItem(STORAGE_KEYS.AUTOPLAY_WAVE) !== 'false';
      if (!autoplayPref) {
        setWaveMode(false);
      }
      shuffleHistoryRef.current = [];
    } else if (currentIndexRef.current >= 0) {
      shuffleHistoryRef.current.push(currentIndexRef.current);
    }
    const currentQ = queueRef.current;
    await playTrackInternalRef.current(track, newQueue || (currentQ.length > 0 ? currentQ : [track]), undefined);
  }, []);

  const startWave = useCallback(async (vibe: string = 'discover') => {
    try {
      dispatchPlayer({ type: 'REPLENISH_START' });
      const tasteGraph = loadTasteGraph();
      const dislikedGenres = tasteGraph.blacklist?.genres || [];
      const dislikedArtists = tasteGraph.blacklist?.artists || [];
      const seedTrackIds = (likedTracksRef.current || []).slice(0, WAVE_CONFIG.SEED_TRACKS_LIMIT).map((t) => t.id);
      const excludeTrackIds = Array.from(
        new Set([...tasteGraph.recentPlayedIds, ...Array.from(failedTrackIdsRef.current)])
      );

      const waveTracks = await tauriApi.generateWaveBatch({
        vibe,
        seed_track_ids: seedTrackIds,
        exclude_track_ids: excludeTrackIds,
        disliked_genres: dislikedGenres,
        disliked_artists: dislikedArtists,
        limit: WAVE_CONFIG.INITIAL_BATCH_SIZE,
      });

      if (waveTracks && waveTracks.length > 0) {
        const filtered = waveTracks.filter((t) => !failedTrackIdsRef.current.has(t.id));
        if (filtered.length > 0) {
          await playTrackInternalRef.current(filtered[0], filtered, 0);
          setWaveMode(true);
          isWaveModeRef.current = true;
          return;
        }
      }
      dispatchPlayer({ type: 'REPLENISH_FAILED' });
    } catch (err) {
      console.error('[PlayerProvider] Failed to start wave:', err);
      dispatchPlayer({ type: 'REPLENISH_FAILED' });
    }
  }, []);
  startWaveRef.current = startWave;

  const playTrackAtIndex = useCallback(async (idx: number) => {
    const q = queueRef.current;
    if (idx < 0 || idx >= q.length) return;
    const target = q[idx];
    if (!target) return;
    if (currentIndexRef.current >= 0 && currentIndexRef.current !== idx) {
      shuffleHistoryRef.current.push(currentIndexRef.current);
    }
    await playTrackInternalRef.current(target, q, idx);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!engineRef.current) return;
    if (isPlayingRef.current) {
      engineRef.current.pause();
      dispatchPlayer({ type: 'PAUSE' });
    } else {
      engineRef.current.play();
      dispatchPlayer({ type: 'PLAY' });
    }
  }, []);
  togglePlayPauseRef.current = togglePlayPause;

  const seekTo = useCallback((seconds: number) => {
    engineRef.current?.seek(seconds);
    currentTimeRef.current = seconds;
    lastStateUpdateTimeRef.current = Date.now();
    setCurrentTime(seconds);
    windowsMediaControls.updatePositionState(seconds, durationRef.current, true);
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
  }, []);
  seekToRef.current = seekTo;

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(val, 1));
    setVolumeState(clamped);
    applyEngineVolume(clamped, trackGainRef.current);
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYER_VOLUME, String(clamped));
    } catch {}
    if (clamped > 0) {
      setIsMuted((prev) => {
        if (prev) {
          engineRef.current?.setMuted(false);
          return false;
        }
        return prev;
      });
    }
  }, [applyEngineVolume]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => !prev);
  }, []);
  toggleShuffleRef.current = toggleShuffle;

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'queue';
      if (prev === 'queue') return 'track';
      return 'off';
    });
  }, []);
  toggleRepeatRef.current = toggleRepeat;

  const addToQueue = useCallback((track: Track) => {
    setQueue((prev) => [...prev, track]);
    if (!currentTrackRef.current) {
      playTrackInternalRef.current(track, [track], 0);
    }
  }, []);

  const playNext = useCallback((track: Track) => {
    if (!currentTrackRef.current) {
      playTrackInternalRef.current(track, [track], 0);
      return;
    }
    setQueue((prev) => {
      const nextIdx = currentIndexRef.current + 1;
      const next = [...prev];
      next.splice(nextIdx, 0, track);
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (index < currentIndexRef.current) {
        setCurrentIndex((idx) => Math.max(0, idx - 1));
      }
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setWaveMode(false);
    setQueue((prev) => {
      if (currentTrackRef.current && currentIndexRef.current >= 0 && currentIndexRef.current < prev.length) {
        return [prev[currentIndexRef.current]!];
      }
      return [];
    });
    setCurrentIndex(0);
  }, []);

  const toggleQueueOpen = useCallback(() => {
    setIsQueueOpen((prev) => !prev);
  }, []);

  const toggleLyricsOpen = useCallback(() => {
    setIsLyricsOpen((prev) => !prev);
  }, []);

  const setLyricsOpen = useCallback((open: boolean) => {
    setIsLyricsOpen(open);
  }, []);

  // Global 'L' hotkey for lyrics toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInput) return;

      if ((e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        toggleLyricsOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleLyricsOpen]);

  const progressValue = useMemo<PlayerProgressContextValue>(
    () => ({
      currentTime,
      duration,
    }),
    [currentTime, duration]
  );

  const playerValue = useMemo<PlayerContextValue>(
    () => ({
      playerStatus: playerState.status,
      currentTrack,
      isPlaying,
      isBuffering,
      volume,
      isMuted,
      isShuffle,
      repeatMode,
      audioSource,
      queue,
      currentIndex,
      isQueueOpen,
      isLyricsOpen,
      isWaveMode,
      setWaveMode,
      startWave,
      playTrack,
      playTrackAtIndex,
      togglePlayPause,
      nextTrack: handleNextTrack,
      previousTrack: handlePrevTrack,
      dislikeTrack,
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
      toggleLyricsOpen,
      setLyricsOpen,
      playbackError,
      clearPlaybackError,
    }),
    [
      playerState.status,
      currentTrack,
      isPlaying,
      isBuffering,
      volume,
      isMuted,
      isShuffle,
      repeatMode,
      audioSource,
      queue,
      currentIndex,
      isQueueOpen,
      isLyricsOpen,
      isWaveMode,
      setWaveMode,
      startWave,
      playTrack,
      playTrackAtIndex,
      togglePlayPause,
      handleNextTrack,
      handlePrevTrack,
      dislikeTrack,
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
      toggleLyricsOpen,
      setLyricsOpen,
      playbackError,
      clearPlaybackError,
    ]
  );

  return (
    <PlayerContext.Provider value={playerValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {children}
      </PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  );
};
