import React from 'react';
import { usePlayer } from '../../../entities/player/model/player-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { useLikes } from '../../../entities/track/model/likes-context';
import { formatTime } from '../../../entities/track/lib/format-time';
import { useTranslation } from '../../../shared/lib/i18n';

export const PlayerBar: React.FC = () => {
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
    queue,
    currentIndex,
    isQueueOpen,
    togglePlayPause,
    nextTrack,
    previousTrack,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    toggleQueueOpen,
  } = usePlayer();

  const { isCached, cacheTrack, removeCachedTrack, isDownloading } = useCache();
  const { isLiked, toggleLike } = useLikes();
  const { messages } = useTranslation();

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const cached = currentTrack ? isCached(currentTrack.id) : false;
  const downloading = currentTrack ? isDownloading(currentTrack.id) : false;
  const liked = currentTrack ? isLiked(currentTrack.id) : false;

  const upcomingCount = currentIndex >= 0 ? Math.max(0, queue.length - currentIndex - 1) : queue.length;

  const handleLikeClick = () => {
    if (!currentTrack) return;
    toggleLike(currentTrack);
  };

  const handleCacheClick = () => {
    if (!currentTrack) return;
    if (cached) {
      removeCachedTrack(currentTrack.id);
    } else {
      cacheTrack(currentTrack);
    }
  };

  return (
    <footer className="w-full h-[72px] bg-black border-t border-zinc-800 flex-shrink-0 px-space-lg flex items-center justify-between select-none">
        {/* 1. Track Info (Left) */}
        <div className="flex items-center gap-space-md w-1/4 min-w-[200px]">
          <div className="w-12 h-12 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
            {currentTrack?.artwork_url ? (
              <img src={currentTrack.artwork_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <i className="ri-disc-line text-zinc-600 text-[24px]"></i>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-headline-sm text-body-lg text-white truncate font-medium">
              {currentTrack ? currentTrack.title : messages.player.not_playing}
            </span>
            <span className="font-body-sm text-body-sm text-zinc-400 truncate">
              {currentTrack ? currentTrack.artist : 'freackcloud'}
            </span>
          </div>
          {currentTrack && (
            <div className="flex items-center gap-1.5 ml-space-xs flex-shrink-0">
              <button
                type="button"
                onClick={handleLikeClick}
                className={`transition-colors flex items-center justify-center w-7 h-7 rounded-full hover:bg-zinc-800/80 ${
                  liked ? 'text-red-500 hover:text-red-400' : 'text-zinc-400 hover:text-white'
                }`}
                title={liked ? messages.player.unlike : messages.player.like}
              >
                <i className={`${liked ? 'ri-heart-3-fill' : 'ri-heart-3-line'} text-[19px]`}></i>
              </button>
              <button
                type="button"
                onClick={handleCacheClick}
                className="text-zinc-400 hover:text-white transition-colors flex items-center justify-center w-7 h-7 rounded-full hover:bg-zinc-800/80"
                title={cached ? messages.cache.remove_offline : messages.cache.save_offline}
              >
                {downloading ? (
                  <i className="ri-loader-4-line text-[19px] animate-spin"></i>
                ) : cached ? (
                  <i className="ri-checkbox-circle-fill text-[19px] text-white"></i>
                ) : (
                  <i className="ri-download-2-line text-[19px]"></i>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 2. Controls & Scrubber (Center) */}
        <div className="flex flex-col items-center gap-space-xs w-2/4 max-w-xl">
          <div className="flex items-center gap-space-lg">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              className={`transition-colors flex items-center justify-center ${
                isShuffle ? 'text-white' : 'text-zinc-500 hover:text-white'
              }`}
              title={messages.player.shuffle}
            >
              <i className="ri-shuffle-line text-[18px]"></i>
            </button>

            {/* Previous */}
            <button
              onClick={previousTrack}
              className="text-zinc-400 hover:text-white transition-colors flex items-center justify-center"
              title={messages.player.previous}
            >
              <i className="ri-skip-back-fill text-[20px]"></i>
            </button>

            {/* Play / Pause */}
            <button
              onClick={togglePlayPause}
              disabled={!currentTrack}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title={isPlaying ? messages.player.pause : messages.player.play}
            >
              {isBuffering ? (
                <i className="ri-loader-4-line text-[20px] animate-spin"></i>
              ) : isPlaying ? (
                <i className="ri-pause-fill text-[22px]"></i>
              ) : (
                <i className="ri-play-fill text-[22px] ml-0.5"></i>
              )}
            </button>

            {/* Next */}
            <button
              onClick={nextTrack}
              className="text-zinc-400 hover:text-white transition-colors flex items-center justify-center"
              title={messages.player.next}
            >
              <i className="ri-skip-forward-fill text-[20px]"></i>
            </button>

            {/* Repeat */}
            <button
              onClick={toggleRepeat}
              className={`transition-colors flex items-center justify-center ${
                repeatMode !== 'off' ? 'text-white' : 'text-zinc-500 hover:text-white'
              }`}
              title={messages.player.repeat}
            >
              {repeatMode === 'track' ? (
                <i className="ri-repeat-one-line text-[18px]"></i>
              ) : (
                <i className="ri-repeat-line text-[18px]"></i>
              )}
            </button>
          </div>

          {/* Timeline Scrubber */}
          <div className="flex items-center gap-space-sm w-full">
            <span className="font-label-sm text-label-sm text-zinc-400 w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <div className="relative flex-1 h-1 bg-zinc-800 rounded-full cursor-pointer group flex items-center">
              {/* Filled bar */}
              <div
                className="h-full bg-zinc-300 rounded-full group-hover:bg-white transition-colors"
                style={{ width: `${progressPercent}%` }}
              ></div>
              {/* Native slider input overlay */}
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
            <span className="font-label-sm text-label-sm text-zinc-500 w-10">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* 3. Queue & Volume (Right) */}
        <div className="flex items-center justify-end gap-3 w-1/4 min-w-[200px]">
          {/* Queue toggle button */}
          <button
            type="button"
            onClick={toggleQueueOpen}
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isQueueOpen
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
            title={messages.player.queue}
          >
            <i className="ri-play-list-2-line text-lg"></i>
            {upcomingCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center leading-none">
                {upcomingCount}
              </span>
            )}
          </button>

          {/* Volume with percentage label */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="text-zinc-400 hover:text-white transition-colors flex items-center justify-center"
              title={isMuted ? messages.player.unmute : messages.player.mute}
            >
              {isMuted || volume === 0 ? (
                <i className="ri-volume-mute-line text-[18px]"></i>
              ) : volume < 0.5 ? (
                <i className="ri-volume-down-line text-[18px]"></i>
              ) : (
                <i className="ri-volume-up-line text-[18px]"></i>
              )}
            </button>

            <div className="relative w-20 sm:w-24 h-1 bg-zinc-800 rounded-full cursor-pointer group flex items-center">
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

            <span className="font-label-sm text-[11px] text-zinc-400 w-7 text-right tabular-nums">
              {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
            </span>
          </div>
        </div>
      </footer>
  );
};
