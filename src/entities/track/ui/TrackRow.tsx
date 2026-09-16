import React from 'react';
import type { Track } from '../model/types';
import { formatDurationMs } from '../lib/format-time';
import { usePlayer } from '../../player/model/player-context';
import { useCache } from '../model/cache-context';
import { useLikes } from '../model/likes-context';
import { useArtist } from '../../artist/model/artist-context';
import { usePlaylists } from '../../playlist/model/playlist-context';

interface TrackRowProps {
  track: Track;
  index: number;
  queueList?: Track[];
  onRemove?: () => void;
}

export const TrackRow: React.FC<TrackRowProps> = React.memo(({ track, index, queueList, onRemove }) => {
  const { currentTrack, isPlaying, playTrack, togglePlayPause, addToQueue } = usePlayer();
  const { isCached, isDownloading, cacheTrack, removeCachedTrack } = useCache();
  const { isLiked, toggleLike } = useLikes();
  const { openArtist } = useArtist();
  const { openAddToPlaylist } = usePlaylists();

  const isCurrent = currentTrack?.id === track.id;
  const cached = isCached(track.id);
  const downloading = isDownloading(track.id);
  const liked = isLiked(track.id);

  const handleRowClick = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      playTrack(track, queueList);
    }
  };

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(track);
  };

  const handleAddToPlaylistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openAddToPlaylist(track);
  };

  const handleCacheClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cached) {
      removeCachedTrack(track.id);
    } else {
      cacheTrack(track);
    }
  };

  const handleQueueClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToQueue(track);
  };

  return (
    <div
      onClick={handleRowClick}
      style={{ animationDelay: `${Math.min(index * 24, 400)}ms` }}
      className={`track-row-virtualized animate-cascade grid grid-cols-[40px_1fr_auto_64px] items-center px-space-md py-2 rounded-md transition-colors group cursor-pointer w-full select-none gap-2 ${
        isCurrent
          ? 'bg-zinc-800 text-white font-medium'
          : 'hover:bg-zinc-900/90 text-zinc-300'
      }`}
    >
      {/* 1. Fixed Slot: Number / Play Indicator (40px) */}
      <div className="flex items-center justify-center font-label-md text-label-md text-zinc-500 w-10">
        {isCurrent ? (
          isPlaying ? (
            <>
              <i className="ri-volume-up-line text-white text-[16px] group-hover:hidden animate-pulse"></i>
              <i className="ri-pause-fill text-white text-[18px] hidden group-hover:block"></i>
            </>
          ) : (
            <>
              <i className="ri-play-fill text-zinc-400 text-[18px] group-hover:hidden"></i>
              <i className="ri-play-fill text-white text-[18px] hidden group-hover:block"></i>
            </>
          )
        ) : (
          <>
            <span className="group-hover:hidden">{(index + 1).toString().padStart(2, '0')}</span>
            <i className="ri-play-fill text-white text-[18px] hidden group-hover:block"></i>
          </>
        )}
      </div>

      {/* 2. Flexible Slot: Title & Artist & Artwork (1fr) */}
      <div className="flex items-center gap-space-md min-w-0 pr-space-sm">
        <div className="w-9 h-9 rounded bg-zinc-900 overflow-hidden flex-shrink-0 flex items-center justify-center border border-zinc-800">
          {track.artwork_url ? (
            <img src={track.artwork_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <i className="ri-music-2-line text-zinc-600 text-[18px]"></i>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className={`font-body-md text-body-md truncate ${isCurrent ? 'text-white' : 'text-zinc-200'}`}>
            {track.title}
          </span>
          {track.artist ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openArtist(track.artist);
              }}
              className="font-body-sm text-body-sm text-zinc-500 hover:text-white hover:underline truncate text-left w-fit max-w-full transition-colors focus:outline-none"
              title={`Открыть карточку артиста: ${track.artist}`}
            >
              {track.artist}
            </button>
          ) : null}
        </div>
      </div>

      {/* 3. Fixed Slot: Actions (Like + Playlist + Queue + Cache) (124px) */}
      <div className="flex items-center justify-center gap-1.5 w-[124px]">
        <button
          type="button"
          onClick={handleLikeClick}
          title={liked ? "Удалить из понравившихся" : "Нравится"}
          className={`transition-all w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 ${
            liked ? 'text-red-500 hover:text-red-400' : 'opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white'
          }`}
        >
          <i className={`${liked ? 'ri-heart-3-fill' : 'ri-heart-3-line'} text-[16px]`}></i>
        </button>

        <button
          type="button"
          onClick={handleAddToPlaylistClick}
          title="Добавить в плейлист"
          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white transition-all w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800"
        >
          <i className="ri-folder-add-line text-base"></i>
        </button>

        <button
          type="button"
          onClick={handleQueueClick}
          title="Добавить в очередь"
          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white transition-all w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800"
        >
          <i className="ri-play-list-add-line text-base"></i>
        </button>

        {downloading ? (
          <i className="ri-loader-4-line text-zinc-400 text-[18px] animate-spin" title="Скачивание..."></i>
        ) : cached ? (
          <button
            type="button"
            onClick={handleCacheClick}
            title="Сохранено офлайн (нажмите для удаления)"
            className="text-white hover:text-zinc-300 transition-colors w-6 h-6 flex items-center justify-center"
          >
            <i className="ri-checkbox-circle-fill text-[18px]"></i>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCacheClick}
            title="Сохранить для офлайн"
            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white transition-all w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800"
          >
            <i className="ri-download-2-line text-[18px]"></i>
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Удалить из плейлиста"
            className="opacity-0 group-hover:opacity-100 text-red-400/70 hover:text-red-400 transition-all w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10"
          >
            <i className="ri-delete-bin-line text-[16px]" />
          </button>
        )}
      </div>

      {/* 4. Fixed Slot: Duration (64px) */}
      <div className="flex items-center justify-end font-label-md text-label-md text-zinc-400 w-16">
        <span>{formatDurationMs(track.duration_ms)}</span>
      </div>
    </div>
  );
});

TrackRow.displayName = 'TrackRow';
