import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { isTauri, tauriApi } from '../../../shared/api/tauri-client';
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
  const [state, setState] = useState<TrayPlayerState>({
    track: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLiked: false,
  });

  const sendCommand = useCallback(async (cmd: TrayPlayerCommand) => {
    if (!isTauri()) return;
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit(TRAY_COMMAND_EVENT, cmd);
    } catch (err) {
      console.warn('[TrayWidget] Failed to send command:', err);
    }
  }, []);

  const handleClose = async () => {
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().hide();
    } catch (err) {
      console.warn('[TrayWidget] Failed to hide window:', err);
    }
  };

  const handleOpenApp = async () => {
    await tauriApi.showMainWindow();
  };

  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';

    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<TrayPlayerState>(TRAY_STATE_EVENT, (event) => {
        if (event.payload) {
          setState(event.payload);
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });

    // Request initial state from main window
    sendCommand({ action: 'request-sync' });

    return () => {
      unlisten?.();
    };
  }, [sendCommand]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const total = state.duration > 0 ? state.duration : (state.track?.duration_ms || 0) / 1000;
    if (total <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = percent * total;
    sendCommand({ action: 'seek', payload: targetSec });
    setState((prev) => ({ ...prev, currentTime: targetSec }));
  };

  const totalDuration = state.duration > 0 ? state.duration : (state.track?.duration_ms || 0) / 1000;
  const progressPercent = totalDuration > 0 ? Math.min(100, (state.currentTime / totalDuration) * 100) : 0;

  return (
    <div className="w-screen h-screen p-2.5 box-border select-none bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl text-white flex flex-col justify-between overflow-hidden font-sans">
      {!state.track ? (
        // Empty State: No active track playing
        <div className="flex flex-col justify-between h-full p-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="ri-music-2-fill text-zinc-400 text-lg"></i>
              <span className="text-xs font-semibold text-zinc-300">freakcloud</span>
            </div>
            <button
              onClick={handleClose}
              className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title={messages.player.close_widget}
            >
              <i className="ri-close-line text-sm"></i>
            </button>
          </div>

          <div className="text-center my-auto">
            <p className="text-xs text-zinc-400 mb-2">{messages.player.not_playing}</p>
            <button
              onClick={handleOpenApp}
              className="px-3 py-1.5 rounded-full bg-white text-black text-xs font-medium hover:bg-zinc-200 transition-colors shadow-sm inline-flex items-center gap-1.5"
            >
              <i className="ri-external-link-line"></i>
              <span>{messages.player.open_app}</span>
            </button>
          </div>
        </div>
      ) : (
        // Active Track Playing State
        <>
          {/* Top Row: Artwork + Track Info + Top Actions */}
          <div className="flex items-center gap-2.5">
            {/* Artwork */}
            <div className="w-12 h-12 rounded-xl bg-zinc-800 overflow-hidden flex-shrink-0 shadow-md border border-white/5 flex items-center justify-center">
              {state.track.artwork_url ? (
                <img
                  src={state.track.artwork_url}
                  alt={state.track.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <i className="ri-music-2-fill text-zinc-500 text-xl"></i>
              )}
            </div>

            {/* Track metadata */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <span className="text-[13px] font-semibold text-zinc-100 truncate leading-snug">
                {state.track.title}
              </span>
              <span className="text-[11px] text-zinc-400 truncate mt-0.5">
                {state.track.artist}
              </span>
            </div>

            {/* Actions: Like, Open App, Close */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => sendCommand({ action: 'toggle-like' })}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                  state.isLiked ? 'text-red-500 hover:text-red-400' : 'text-zinc-400 hover:text-white'
                } hover:bg-white/5`}
                title={state.isLiked ? messages.player.unlike : messages.player.like}
              >
                <i className={`${state.isLiked ? 'ri-heart-3-fill' : 'ri-heart-3-line'} text-[15px]`}></i>
              </button>

              <button
                onClick={handleOpenApp}
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                title={messages.player.open_app}
              >
                <i className="ri-external-link-line text-[15px]"></i>
              </button>

              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                title={messages.player.close_widget}
              >
                <i className="ri-close-line text-[16px]"></i>
              </button>
            </div>
          </div>

          {/* Middle: Progress Bar and Time */}
          <div className="my-1">
            <div
              onClick={handleSeek}
              className="h-1.5 w-full bg-zinc-800 rounded-full cursor-pointer relative group overflow-hidden"
            >
              <div
                className="h-full bg-white group-hover:bg-amber-400 transition-colors rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-zinc-400 mt-1 font-mono">
              <span>{formatTime(state.currentTime)}</span>
              <span>{formatTime(totalDuration)}</span>
            </div>
          </div>

          {/* Bottom: Playback Controls */}
          <div className="flex items-center justify-center gap-3">
            {/* Prev Track */}
            <button
              onClick={() => sendCommand({ action: 'previous' })}
              className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/5 rounded-full transition-colors"
              title={messages.player.previous}
            >
              <i className="ri-skip-back-fill text-[16px]"></i>
            </button>

            {/* Play/Pause */}
            <button
              onClick={() => sendCommand({ action: 'toggle-play' })}
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-all shadow-md active:scale-95"
              title={state.isPlaying ? messages.player.pause : messages.player.play}
            >
              <i className={`${state.isPlaying ? 'ri-pause-fill' : 'ri-play-fill ml-0.5'} text-[18px]`}></i>
            </button>

            {/* Next Track */}
            <button
              onClick={() => sendCommand({ action: 'next' })}
              className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/5 rounded-full transition-colors"
              title={messages.player.next}
            >
              <i className="ri-skip-forward-fill text-[16px]"></i>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
