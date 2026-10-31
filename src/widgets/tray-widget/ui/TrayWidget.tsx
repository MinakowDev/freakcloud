import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { isTauri, tauriApi } from '../../../shared/api/tauri-client';
import { STORAGE_KEYS, TRAY_CONFIG } from '../../../shared/config';
import {
  TRAY_COMMAND_EVENT,
  TRAY_STATE_EVENT,
  type TrayPlayerCommand,
  type TrayPlayerState,
} from '../../../entities/player/model/tray-sync';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const TrayWidget: React.FC = () => {
  const { messages } = useTranslation();
  const [state, setState] = useState<TrayPlayerState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TRAY_STATE);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return {
      track: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isLiked: false,
      isWaveMode: false,
      isShuffle: false,
      repeatMode: 'off',
    };
  });
  const [isPinned, setIsPinned] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isWindowVisible, setIsWindowVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');

  const rawArtwork = state.track?.artwork_url;
  const artworkUrl = rawArtwork
    ? rawArtwork.replace('-large.', '-t300x300.').replace('-t50x50.', '-t300x300.')
    : undefined;

  useEffect(() => {
    setImgError(false);
  }, [artworkUrl]);

  const sendCommand = useCallback(async (cmd: TrayPlayerCommand) => {
    if (!isTauri()) return;
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit(TRAY_COMMAND_EVENT, cmd).catch(() => {});
    } catch (err) {
      console.warn('[TrayWidget] Failed to send command:', err);
    }
  }, []);

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().hide();
    } catch (err) {
      console.warn('[TrayWidget] Failed to hide window:', err);
    }
  };

  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isPinned;
    setIsPinned(next);
    await tauriApi.setTrayPinned(next);
  };

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.isPlaying) {
      tauriApi.playerPause().catch(() => {});
      setState((prev) => ({ ...prev, isPlaying: false }));
      sendCommand({ action: 'pause' });
    } else {
      tauriApi.playerPlay().catch(() => {});
      setState((prev) => ({ ...prev, isPlaying: true }));
      sendCommand({ action: 'play' });
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendCommand({ action: 'previous' });
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendCommand({ action: 'next' });
  };

  const handleTogglePlayMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!state.isShuffle) {
      sendCommand({ action: 'toggle-shuffle' });
    } else {
      sendCommand({ action: 'toggle-shuffle' });
      sendCommand({ action: 'toggle-repeat' });
    }
  };

  const handleStartWave = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendCommand({ action: 'start-wave' });
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const total = state.duration > 0 ? state.duration : (state.track?.duration_ms || 0) / 1000;
    if (total <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetSec = (clickX / rect.width) * total;
    setState((prev) => ({ ...prev, currentTime: targetSec }));
    tauriApi.playerSeek(targetSec).catch(() => {});
    sendCommand({ action: 'seek', payload: targetSec });
  };

  const handleStartDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, [data-interactive="true"]')) {
      return;
    }
    if (isTauri()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging().catch(() => {});
      });
    }
  };

  const handleDragGrip = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isTauri()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging().catch(() => {});
      });
    }
  };

  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';

    if (!isTauri()) return;

    tauriApi.isTrayPinned().then(setIsPinned).catch(() => {});

    const cleanups: Array<() => void> = [];

    // Helper to read and update from localStorage
    const syncFromStorage = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.TRAY_STATE);
        if (saved) {
          const parsed = JSON.parse(saved);
          setState((prev) => {
            if (
              prev.track?.id !== parsed.track?.id ||
              prev.track?.title !== parsed.track?.title ||
              prev.track?.artist !== parsed.track?.artist ||
              prev.track?.artwork_url !== parsed.track?.artwork_url ||
              prev.isPlaying !== parsed.isPlaying ||
              prev.isWaveMode !== parsed.isWaveMode ||
              prev.isShuffle !== parsed.isShuffle ||
              prev.repeatMode !== parsed.repeatMode
            ) {
              return {
                ...prev,
                ...parsed,
              };
            }
            return prev;
          });
        }
      } catch {}
    };

    // 1. Cross-window storage listener for instant sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.TRAY_STATE && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setState((prev) => ({
            ...prev,
            ...parsed,
          }));
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    cleanups.push(() => window.removeEventListener('storage', onStorage));

    // 2. Window focus and visibility listener to refresh state on overlay activation
    const onFocus = () => {
      setIsWindowVisible(true);
      syncFromStorage();
    };
    window.addEventListener('focus', onFocus);
    cleanups.push(() => window.removeEventListener('focus', onFocus));

    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsWindowVisible(visible);
      if (visible) {
        syncFromStorage();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

    // 3. Periodic fallback check (only when visible)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncFromStorage();
      }
    }, TRAY_CONFIG.SYNC_POLL_INTERVAL_MS);
    cleanups.push(() => clearInterval(interval));

    // 4. Tauri event listener (single global listener)
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<TrayPlayerState>(TRAY_STATE_EVENT, (event) => {
        if (event.payload) {
          setState((prev) => ({
            ...prev,
            ...event.payload,
            currentTime: event.payload.currentTime,
          }));
        }
      }).then((fn) => cleanups.push(fn));
    });

    // 5. Audio engine listeners (skip re-renders when overlay is hidden)
    tauriApi.onPlayerTime(({ current_time, duration }) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      setState((prev) => ({
        ...prev,
        currentTime: current_time,
        duration: duration > 0 ? duration : prev.duration,
      }));
    }).then((un) => {
      if (un) cleanups.push(un);
    });

    tauriApi.onPlayerStatus((status) => {
      setState((prev) => ({
        ...prev,
        isPlaying: status === 'playing',
      }));
    }).then((un) => {
      if (un) cleanups.push(un);
    });

    // 6. Request initial state from main window
    sendCommand({ action: 'request-sync' });
    const t1 = setTimeout(() => sendCommand({ action: 'request-sync' }), TRAY_CONFIG.INITIAL_SYNC_DELAY_1_MS);
    const t2 = setTimeout(() => sendCommand({ action: 'request-sync' }), TRAY_CONFIG.INITIAL_SYNC_DELAY_2_MS);
    cleanups.push(() => {
      clearTimeout(t1);
      clearTimeout(t2);
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [sendCommand]);

  const totalDuration = state.duration > 0 ? state.duration : (state.track?.duration_ms || 0) / 1000;
  const progressPercent = totalDuration > 0 ? Math.min(100, Math.max(0, (state.currentTime / totalDuration) * 100)) : 0;

  return (
    <div
      onMouseDown={handleStartDrag}
      data-tauri-drag-region
      className="w-screen h-screen flex flex-col items-center justify-end pb-3 group/he select-none box-border cursor-move"
    >
      {/* Top half of vinyl visible when collapsed, collapses into h-0 on hover */}
      <div
        onMouseDown={handleStartDrag}
        data-tauri-drag-region
        className="relative z-0 h-16 -mb-2 transition-all duration-300 group-hover/he:h-0 overflow-hidden cursor-move"
      >
        <div
          className="vinyl-disc w-32 h-32 rounded-full border-4 border-zinc-700/60 bg-[#0a0b0e] shadow-2xl relative flex items-center justify-center overflow-hidden pointer-events-none"
          style={{ animationPlayState: isWindowVisible && state.isPlaying ? 'running' : 'paused' }}
        >
          {/* Concentric grooves */}
          <div className="absolute inset-2 rounded-full border border-white/5" />
          <div className="absolute inset-4 rounded-full border border-white/5" />
          <div className="absolute inset-6 rounded-full border border-white/5" />
          {/* Gloss shine */}
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_45deg,transparent_0deg,rgba(255,255,255,0.08)_45deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.08)_225deg,transparent_270deg)]" />
          {/* Center record label with artwork expanded to 3rd groove */}
          <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-black/80 shadow-md flex items-center justify-center bg-zinc-800">
            {artworkUrl && !imgError ? (
              <img src={artworkUrl} alt="" onError={() => setImgError(true)} className="w-full h-full object-cover" />
            ) : (
              <i className="ri-disc-line text-orange-400 text-2xl" />
            )}
            <div className="absolute w-3.5 h-3.5 bg-black border-2 rounded-full shadow-inner border-white/40 z-10" />
          </div>
        </div>
      </div>

      {/* Main Card: w-44 h-20 collapsed, expands to w-80 h-44 on hover */}
      <div
        onMouseDown={handleStartDrag}
        data-tauri-drag-region
        className="z-30 relative flex flex-col w-44 h-20 transition-all duration-300 bg-zinc-950/95 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.85)] backdrop-blur-2xl rounded-2xl group-hover/he:h-44 group-hover/he:w-80 p-2.5 justify-between select-none cursor-move"
      >
        {/* Top-Left: Pin button */}
        <button
          type="button"
          data-interactive="true"
          onClick={handleTogglePin}
          className={`absolute top-2 left-2 z-40 w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${
            isPinned ? 'text-orange-400' : 'text-zinc-400 hover:text-white'
          }`}
          title={isPinned ? messages.player.unpin_overlay : messages.player.pin_overlay}
        >
          <i className={isPinned ? 'ri-pushpin-2-fill text-xs' : 'ri-pushpin-2-line text-xs'} />
        </button>

        {/* Top-Right: Close button */}
        <button
          type="button"
          data-interactive="true"
          onClick={handleClose}
          className="absolute top-2 right-2 z-40 w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title={messages.player.close_widget}
        >
          <i className="ri-close-line text-sm" />
        </button>

        {/* Bottom-Left: Drag handle icon */}
        <div
          data-tauri-drag-region
          onMouseDown={handleDragGrip}
          className="absolute bottom-1 left-1.5 z-40 w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-300 cursor-move transition-colors select-none"
          title="Перетащить виджет"
        >
          <i className="ri-draggable text-xs pointer-events-none" />
        </div>

        {/* Row 1: Track Details & Sliding Vinyl (visible on hover) */}
        <div className="flex flex-row items-center w-full h-0 group-hover/he:h-16 transition-all duration-300 overflow-hidden group-hover/he:overflow-visible">
          {/* Vinyl sticking out of top-left */}
          <div className="relative flex items-center justify-center w-16 h-16 group-hover/he:-top-3 group-hover/he:-left-2 opacity-0 group-hover/he:opacity-100 transition-all duration-300 shrink-0 pointer-events-none">
            <div
              className="vinyl-disc w-16 h-16 rounded-full border-2 border-zinc-700/60 bg-[#0a0b0e] shadow-xl relative flex items-center justify-center overflow-hidden"
              style={{ animationPlayState: isWindowVisible && state.isPlaying ? 'running' : 'paused' }}
            >
              <div className="absolute inset-1 rounded-full border border-white/5" />
              <div className="absolute inset-2 rounded-full border border-white/5" />
              <div className="absolute inset-3 rounded-full border border-white/5" />
              <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_45deg,transparent_0deg,rgba(255,255,255,0.08)_45deg,transparent_90deg,transparent_180deg,rgba(255,255,255,0.08)_225deg,transparent_270deg)]" />
              <div className="relative w-10 h-10 rounded-full overflow-hidden border border-black/80 shadow-md flex items-center justify-center bg-zinc-800">
                {artworkUrl && !imgError ? (
                  <img src={artworkUrl} alt="" onError={() => setImgError(true)} className="w-full h-full object-cover" />
                ) : (
                  <i className="ri-disc-line text-orange-400 text-sm" />
                )}
                <div className="absolute w-2 h-2 bg-black border border-white/40 rounded-full shadow-inner z-10" />
              </div>
            </div>
          </div>

          {/* Track metadata: title & artist */}
          <div
            onMouseDown={handleStartDrag}
            data-tauri-drag-region
            className="flex flex-col justify-center flex-1 min-w-0 pl-2 pr-6 overflow-hidden transition-all duration-300 cursor-move"
          >
            <p className="text-sm font-bold text-white truncate leading-tight select-none">
              {state.track?.title || messages.player.not_playing}
            </p>
            <p className="text-xs text-zinc-400 truncate mt-0.5 select-none">
              {state.track?.artist || 'freakcloud'}
            </p>
          </div>
        </div>

        {/* Row 2: Progress Bar with dynamic fill and timestamps */}
        <div
          data-interactive="true"
          className="flex flex-row items-center mx-1 my-1 px-2 bg-zinc-900/90 border border-white/5 rounded-md min-h-5 group-hover/he:mt-0 transition-all duration-300"
        >
          <span className="hidden text-[10px] text-zinc-400 font-mono group-hover/he:inline-block select-none w-7 text-right">
            {formatTime(state.currentTime)}
          </span>
          <div
            onClick={handleSeekClick}
            className="w-20 group-hover/he:w-full flex-grow h-1.5 mx-2 my-auto bg-zinc-800 rounded-full cursor-pointer relative overflow-hidden"
            title="Перемотка"
          >
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-[width] duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="hidden text-[10px] text-zinc-400 font-mono group-hover/he:inline-block select-none w-7">
            {formatTime(totalDuration)}
          </span>
        </div>

        {/* Row 3: 5 Controls matching snippet */}
        <div
          data-interactive="true"
          className="flex flex-row items-center justify-center flex-grow mx-1 space-x-3 shrink-0"
        >
          {/* 1. Play Mode (Repeat / Shuffle) - w-0 collapsed, w-8 on hover */}
          <button
            type="button"
            onClick={handleTogglePlayMode}
            className="flex items-center justify-center w-0 h-full cursor-pointer group-hover/he:w-8 overflow-hidden text-zinc-400 hover:text-white transition-all duration-300"
            title="Повтор / Перемешивание"
          >
            {state.isShuffle ? (
              <i className="ri-shuffle-line text-sm text-orange-400" />
            ) : state.repeatMode === 'track' ? (
              <i className="ri-repeat-one-line text-sm text-orange-400" />
            ) : (
              <i className="ri-repeat-line text-sm" />
            )}
          </button>

          {/* 2. Skip-back */}
          <button
            type="button"
            onClick={handlePrev}
            className="flex items-center justify-center w-8 h-full cursor-pointer text-zinc-300 hover:text-white transition-colors"
            title={messages.player.previous}
          >
            <i className="ri-skip-back-fill text-sm" />
          </button>

          {/* 3. Play / Pause status */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors shadow-md cursor-pointer"
            title={state.isPlaying ? messages.player.pause : messages.player.play}
          >
            <i className={`${state.isPlaying ? 'ri-pause-fill' : 'ri-play-fill ml-0.5'} text-base`} />
          </button>

          {/* 4. Skip-forward */}
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center justify-center w-8 h-8 cursor-pointer text-zinc-300 hover:text-white transition-colors"
            title={messages.player.next}
          >
            <i className="ri-skip-forward-fill text-sm" />
          </button>

          {/* 5. Wave / List - w-0 collapsed, w-8 on hover */}
          <button
            type="button"
            onClick={handleStartWave}
            className={`flex items-center justify-center w-0 h-full cursor-pointer group-hover/he:w-8 overflow-hidden transition-all duration-300 ${
              state.isWaveMode ? 'text-orange-400' : 'text-zinc-400 hover:text-white'
            }`}
            title={state.isWaveMode ? messages.player.wave_active : messages.player.start_wave}
          >
            <i className="ri-radar-line text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
};
