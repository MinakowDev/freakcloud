import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { usePlayer } from '../../../entities/player/model/player-context';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { useArtist } from '../../../entities/artist/model/artist-context';
import { formatTime } from '../../../entities/track/lib/format-time';
import { useTranslation } from '../../../shared/lib/i18n';
import { fetchLyrics, type LyricsResult } from '../../../entities/track/api/lyrics-api';

export const ExpandedPlayerModal: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    isLyricsOpen,
    togglePlayPause,
    nextTrack,
    previousTrack,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    toggleLyricsOpen,
    setLyricsOpen,
  } = usePlayer();

  const { isLiked, toggleLike } = useLikes();
  const { isCached, cacheTrack, removeCachedTrack, isDownloading } = useCache();
  const { openArtist } = useArtist();
  const { messages } = useTranslation();

  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [isMounted, setIsMounted] = useState(isLyricsOpen);
  const [isVisible, setIsVisible] = useState(false);

  // Smooth open and close transition
  useEffect(() => {
    if (isLyricsOpen) {
      setIsMounted(true);
      const timer = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => cancelAnimationFrame(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setIsMounted(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLyricsOpen]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  const stopSmoothScroll = useCallback(() => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }, []);

  const smoothScrollToTarget = useCallback(
    (container: HTMLDivElement, target: number, duration = 400) => {
      stopSmoothScroll();

      const start = container.scrollTop;
      const change = target - start;
      if (Math.abs(change) < 2) return;

      const startTime = performance.now();

      // easeOutCubic: snappy, natural deceleration without sluggishness
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);

        container.scrollTop = start + change * eased;

        if (progress < 1) {
          scrollRafRef.current = requestAnimationFrame(step);
        } else {
          scrollRafRef.current = null;
        }
      };

      scrollRafRef.current = requestAnimationFrame(step);
    },
    [stopSmoothScroll]
  );

  // Clean up RAF on unmount
  useEffect(() => {
    return () => stopSmoothScroll();
  }, [stopSmoothScroll]);

  const cached = currentTrack ? isCached(currentTrack.id) : false;
  const downloading = currentTrack ? isDownloading(currentTrack.id) : false;
  const liked = currentTrack ? isLiked(currentTrack.id) : false;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Fetch lyrics when track changes or modal opens
  useEffect(() => {
    let isCancelled = false;

    if (!isLyricsOpen || !currentTrack) {
      setLyricsData(null);
      setIsLoadingLyrics(false);
      return;
    }

    setIsLoadingLyrics(true);
    fetchLyrics(currentTrack)
      .then((res) => {
        if (!isCancelled) {
          setLyricsData(res);
          setIsLoadingLyrics(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load lyrics:', err);
        if (!isCancelled) {
          setLyricsData(null);
          setIsLoadingLyrics(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentTrack, isLyricsOpen]);

  // Escape key to close modal
  useEffect(() => {
    if (!isLyricsOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLyricsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLyricsOpen, setLyricsOpen]);

  // Compute active lyric line index
  const activeLineIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.isSynced || lyricsData.lines.length === 0) {
      return -1;
    }

    const lines = lyricsData.lines;
    let low = 0;
    let high = lines.length - 1;
    let candidate = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lines[mid].time <= currentTime + 0.15) {
        candidate = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return candidate;
  }, [lyricsData, currentTime]);

  // Auto-scroll to active line unless user is manually scrolling
  useEffect(() => {
    if (isUserScrolling || activeLineIndex < 0) return;

    if (activeLineRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const element = activeLineRef.current;

      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // Exact pixel delta relative to the visible container viewport
      const delta = elementRect.top - containerRect.top;
      const targetScrollTop = Math.max(
        0,
        container.scrollTop + delta - (container.clientHeight * 0.35)
      );

      smoothScrollToTarget(container, targetScrollTop, 400);
    }
  }, [activeLineIndex, isUserScrolling, smoothScrollToTarget]);

  // Detect user manual scroll/drag on lyrics container
  const handleUserInteraction = useCallback(() => {
    stopSmoothScroll();
    setIsUserScrolling(true);
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 2000);
  }, [stopSmoothScroll]);

  const handleLineClick = (time: number) => {
    if (time >= 0) {
      stopSmoothScroll();
      seekTo(time);
      setIsUserScrolling(false);
    }
  };

  const handleArtistClick = () => {
    if (currentTrack?.artist) {
      openArtist(currentTrack.artist);
      setLyricsOpen(false);
    }
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.player.lyrics}
      className={`fixed inset-0 z-50 bg-black/95 flex flex-col text-white select-none transition-all duration-300 ease-out overflow-hidden ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
      }`}
    >
      {/* Ambient Artwork Background Glow (Apple Music / Spotify aura) */}
      {currentTrack?.artwork_url && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className="absolute -inset-24 bg-cover bg-center filter blur-3xl opacity-25 saturate-150 scale-110 transition-all duration-1000 ease-out"
            style={{ backgroundImage: `url(${currentTrack.artwork_url})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black/95" />
        </div>
      )}

      {/* 1. Header Bar */}
      <header className="relative z-10 h-16 px-8 flex items-center justify-between border-b border-zinc-900/80 backdrop-blur-md flex-shrink-0">
        <button
          type="button"
          onClick={toggleLyricsOpen}
          className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus:outline-none"
          title={messages.player.collapse}
        >
          <i className="ri-arrow-down-s-line text-2xl"></i>
        </button>

        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-widest text-zinc-500 font-medium">
            {messages.player.now_playing}
          </span>
          <span className="text-sm text-zinc-300 font-semibold truncate max-w-md">
            {currentTrack?.title || messages.player.not_playing}
          </span>
        </div>

        <div className="w-10"></div>
      </header>

      {/* 2. Main Content: Split Artwork (Left) & Synced Lyrics (Right) */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col lg:flex-row px-6 lg:px-16 py-6 gap-8 lg:gap-12 overflow-hidden items-stretch justify-center">
        {/* Left Column: Track Info & Artwork */}
        <div className="w-full lg:w-5/12 flex flex-col justify-center items-center lg:items-center flex-shrink-0">
          <div className="w-64 sm:w-80 xl:w-96 flex flex-col">
            <div className="w-64 h-64 sm:w-80 sm:h-80 xl:w-96 xl:h-96 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-2xl flex items-center justify-center flex-shrink-0">
              {currentTrack?.artwork_url ? (
                <img
                  src={currentTrack.artwork_url}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover select-none"
                />
              ) : (
                <i className="ri-disc-line text-zinc-700 text-6xl"></i>
              )}
            </div>

            <div className="mt-6 w-full flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold text-white truncate tracking-tight">
                  {currentTrack?.title || messages.player.not_playing}
                </h2>
                {currentTrack?.artist ? (
                  <button
                    type="button"
                    onClick={handleArtistClick}
                    className="mt-1 text-base text-zinc-400 hover:text-white hover:underline truncate text-left focus:outline-none transition-colors font-medium block"
                  >
                    {currentTrack.artist}
                  </button>
                ) : (
                  <span className="mt-1 text-base text-zinc-500 block">freakcloud</span>
                )}
              </div>

              {currentTrack && (
                <div className="flex items-center gap-1.5 flex-shrink-0 pt-1">
                  <button
                    type="button"
                    onClick={() => toggleLike(currentTrack)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      liked ? 'text-red-500 hover:text-red-400' : 'text-zinc-400 hover:text-white'
                    }`}
                    title={liked ? messages.player.unlike : messages.player.like}
                  >
                    <i className={`text-xl ${liked ? 'ri-heart-fill' : 'ri-heart-line'}`}></i>
                  </button>

                  <button
                    type="button"
                    onClick={() => (cached ? removeCachedTrack(currentTrack.id) : cacheTrack(currentTrack))}
                    disabled={downloading}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      cached
                        ? 'text-emerald-400 hover:text-emerald-300'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title={
                      cached
                        ? messages.cache.remove_offline
                        : downloading
                        ? messages.cache.caching
                        : messages.cache.save_offline
                    }
                  >
                    {downloading ? (
                      <i className="ri-loader-4-line text-xl animate-spin text-zinc-300"></i>
                    ) : cached ? (
                      <i className="ri-checkbox-circle-fill text-xl"></i>
                    ) : (
                      <i className="ri-download-2-line text-xl"></i>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Lyrics View */}
        <div className="w-full lg:w-7/12 flex-1 min-h-0 flex flex-col relative overflow-hidden">
          <div
            ref={scrollContainerRef}
            onWheel={handleUserInteraction}
            onPointerDown={handleUserInteraction}
            style={{
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
            }}
            className="flex-1 overflow-y-auto px-4 lg:px-8 py-16 space-y-4 focus:outline-none"
            tabIndex={0}
          >
            {isLoadingLyrics ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-3">
                <i className="ri-loader-4-line text-3xl animate-spin text-zinc-400"></i>
                <span className="text-sm font-medium">{messages.player.buffering}</span>
              </div>
            ) : !lyricsData || lyricsData.lines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-4 text-center px-4">
                <i className="ri-chat-voice-line text-5xl text-zinc-700"></i>
                <p className="text-base text-zinc-400 font-medium max-w-sm">
                  {messages.player.lyrics_not_found}
                </p>
              </div>
            ) : (
              <div className="flex flex-col space-y-3 pb-24">
                {!lyricsData.isSynced && (
                  <div className="mb-4 text-xs text-zinc-500 uppercase tracking-wider font-mono">
                    {messages.player.lyrics_sync_unavailable}
                  </div>
                )}
                {lyricsData.lines.map((line, idx) => {
                  const isActive = lyricsData.isSynced && idx === activeLineIndex;
                  const distance = lyricsData.isSynced && activeLineIndex >= 0 ? Math.abs(idx - activeLineIndex) : 999;
                  const isPast = lyricsData.isSynced && activeLineIndex >= 0 && idx < activeLineIndex;
                  const nextLine = lyricsData.lines[idx + 1];
                  const hasInstrumentalBreak = lyricsData.isSynced && nextLine && (nextLine.time - line.time >= 6);
                  const isBreakActive = hasInstrumentalBreak && currentTime >= line.time + 3 && currentTime < nextLine.time - 0.5;

                  return (
                    <React.Fragment key={`${line.id}-${idx}`}>
                      <div
                        ref={isActive ? activeLineRef : null}
                        onClick={() => lyricsData.isSynced && handleLineClick(line.time)}
                        className={`text-left select-none transition-all duration-300 ease-out py-2.5 px-3 rounded-xl text-xl lg:text-2xl font-bold tracking-tight ${
                          lyricsData.isSynced ? 'cursor-pointer' : 'cursor-default'
                        } ${
                          isActive
                            ? 'text-white opacity-100 drop-shadow-[0_0_14px_rgba(255,255,255,0.25)]'
                            : distance === 1 && !isPast
                            ? 'text-white/60 hover:text-white/90'
                            : isPast
                            ? 'text-white/30 hover:text-white/70'
                            : 'text-white/40 hover:text-white/80'
                        }`}
                      >
                        {line.text}
                      </div>

                      {hasInstrumentalBreak && (
                        <div
                          className={`flex items-center gap-2 py-3 px-3 transition-all duration-300 ${
                            isBreakActive ? 'text-white opacity-90' : 'text-white/20'
                          }`}
                          title="Instrumental break"
                        >
                          <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                          <span className="w-2 h-2 rounded-full bg-current animate-pulse delay-150"></span>
                          <span className="w-2 h-2 rounded-full bg-current animate-pulse delay-300"></span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Bottom Controls */}
      <footer className="relative z-10 h-24 px-8 border-t border-zinc-900/80 backdrop-blur-md flex flex-col items-center justify-center gap-2 flex-shrink-0 bg-black/80">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={toggleShuffle}
            className={`transition-colors flex items-center justify-center ${
              isShuffle ? 'text-white' : 'text-zinc-500 hover:text-white'
            }`}
            title={messages.player.shuffle}
          >
            <i className="ri-shuffle-line text-lg"></i>
          </button>

          <button
            type="button"
            onClick={previousTrack}
            className="text-zinc-400 hover:text-white transition-colors flex items-center justify-center"
            title={messages.player.previous}
          >
            <i className="ri-skip-back-fill text-2xl"></i>
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!currentTrack}
            className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            title={isPlaying ? messages.player.pause : messages.player.play}
          >
            {isBuffering ? (
              <i className="ri-loader-4-line text-2xl animate-spin"></i>
            ) : isPlaying ? (
              <i className="ri-pause-fill text-2xl"></i>
            ) : (
              <i className="ri-play-fill text-2xl ml-0.5"></i>
            )}
          </button>

          <button
            type="button"
            onClick={nextTrack}
            className="text-zinc-400 hover:text-white transition-colors flex items-center justify-center"
            title={messages.player.next}
          >
            <i className="ri-skip-forward-fill text-2xl"></i>
          </button>

          <button
            type="button"
            onClick={toggleRepeat}
            className={`transition-colors flex items-center justify-center ${
              repeatMode !== 'off' ? 'text-white' : 'text-zinc-500 hover:text-white'
            }`}
            title={messages.player.repeat}
          >
            {repeatMode === 'track' ? (
              <i className="ri-repeat-one-line text-lg"></i>
            ) : (
              <i className="ri-repeat-line text-lg"></i>
            )}
          </button>
        </div>

        {/* Scrubber */}
        <div className="flex items-center gap-3 w-full max-w-2xl">
          <span className="font-mono text-xs text-zinc-400 w-12 text-right tabular-nums">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1 h-1.5 bg-zinc-800 rounded-full cursor-pointer group flex items-center">
            <div
              className="h-full bg-zinc-300 rounded-full group-hover:bg-white transition-colors"
              style={{ width: `${progressPercent}%` }}
            ></div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>
          <span className="font-mono text-xs text-zinc-500 w-12 tabular-nums">
            {formatTime(duration)}
          </span>

          {/* Mini Volume */}
          <div className="hidden sm:flex items-center gap-2 ml-4">
            <button
              type="button"
              onClick={toggleMute}
              className="text-zinc-400 hover:text-white transition-colors"
              title={isMuted ? messages.player.unmute : messages.player.mute}
            >
              {isMuted || volume === 0 ? (
                <i className="ri-volume-mute-line text-base"></i>
              ) : (
                <i className="ri-volume-up-line text-base"></i>
              )}
            </button>
            <div className="relative w-16 h-1 bg-zinc-800 rounded-full cursor-pointer group flex items-center">
              <div
                className="h-full bg-zinc-300 rounded-full group-hover:bg-white transition-colors"
                style={{ width: `${isMuted ? 0 : volume * 100}%` }}
              ></div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
