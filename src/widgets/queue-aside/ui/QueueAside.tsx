import React from 'react';
import { usePlayer } from '../../../entities/player/model/player-context';
import { useTranslation } from '../../../shared/lib/i18n';
import { formatDurationMs } from '../../../entities/track/lib/format-time';
import { useArtist } from '../../../entities/artist/model/artist-context';

export const QueueAside: React.FC = () => {
  const {
    currentTrack,
    queue,
    currentIndex,
    isQueueOpen,
    toggleQueueOpen,
    playTrackAtIndex,
    removeFromQueue,
    clearQueue,
    isPlaying,
  } = usePlayer();

  const { messages } = useTranslation();
  const { openArtist } = useArtist();

  const pastTracks = currentIndex > 0 ? queue.slice(0, currentIndex) : [];
  const upcomingStartIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
  const upcomingTracks = queue.slice(upcomingStartIndex);

  return (
    <aside
      className={`h-full bg-black flex flex-col flex-shrink-0 select-none overflow-hidden transition-all duration-300 ease-in-out z-20 ${
        isQueueOpen
          ? 'w-80 border-l border-zinc-900/80 opacity-100'
          : 'w-0 border-l-0 opacity-0 pointer-events-none'
      }`}
      aria-label="Queue Aside"
    >
      <div className="w-80 h-full flex flex-col flex-shrink-0">
        {/* Header (matches Header/Sidebar h-14 height) */}
        <div className="h-14 px-space-md border-b border-zinc-900/80 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <i className="ri-play-list-2-line text-white text-base flex-shrink-0"></i>
            <span className="font-headline-sm text-sm text-white font-semibold truncate">
              {messages.player.queue}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {upcomingTracks.length > 0 && (
              <button
                type="button"
                onClick={clearQueue}
                className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                title={messages.player.clear_queue}
              >
                <i className="ri-delete-bin-line text-sm"></i>
              </button>
            )}

            <button
              type="button"
              onClick={toggleQueueOpen}
              className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
              title="Закрыть"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-space-md flex flex-col gap-space-lg">
          {/* Now Playing Section */}
          {currentTrack && (
            <div className="flex flex-col gap-1.5">
              <span className="font-label-sm text-[11px] text-zinc-500 uppercase tracking-wider px-1">
                {messages.player.now_playing}
              </span>
              <div className="flex items-center gap-3 p-2 bg-[#0c0c0e] rounded-[4px] border border-zinc-900">
                <div className="w-10 h-10 rounded-[2px] overflow-hidden bg-zinc-900 flex-shrink-0 flex items-center justify-center">
                  {currentTrack.artwork_url ? (
                    <img
                      src={currentTrack.artwork_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <i className="ri-music-2-line text-zinc-500 text-lg"></i>
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-body-md text-xs text-white truncate font-medium">
                    {currentTrack.title}
                  </span>
                  {currentTrack.artist ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openArtist(currentTrack.artist);
                      }}
                      className="font-body-sm text-[11px] text-zinc-400 hover:text-white hover:underline truncate text-left w-fit max-w-full transition-colors focus:outline-none"
                      title={`Открыть карточку артиста: ${currentTrack.artist}`}
                    >
                      {currentTrack.artist}
                    </button>
                  ) : null}
                </div>
                <div className="pr-1 text-zinc-400">
                  {isPlaying ? (
                    <i className="ri-volume-up-line text-sm text-white animate-pulse"></i>
                  ) : (
                    <i className="ri-pause-line text-sm"></i>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Up Next List */}
          <div className="flex flex-col gap-1.5">
            <span className="font-label-sm text-[11px] text-zinc-500 uppercase tracking-wider px-1">
              {messages.player.up_next}
            </span>

            {upcomingTracks.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-zinc-600">
                <i className="ri-play-list-line text-2xl text-zinc-700"></i>
                <span className="font-body-sm text-xs text-zinc-500">
                  {messages.player.empty_queue}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {upcomingTracks.map((t, idx) => {
                  const actualQueueIndex = upcomingStartIndex + idx;
                  return (
                    <div
                      key={`${t.id}-${actualQueueIndex}`}
                      className="flex items-center gap-2.5 p-1.5 rounded hover:bg-[#121214] transition-colors group cursor-pointer"
                      onClick={() => playTrackAtIndex(actualQueueIndex)}
                    >
                      <span className="font-label-sm text-[11px] text-zinc-600 w-4 text-center group-hover:hidden">
                        {idx + 1}
                      </span>
                      <i className="ri-play-fill text-xs text-white hidden group-hover:block w-4 text-center"></i>

                      <div className="w-8 h-8 rounded-[2px] overflow-hidden bg-zinc-900 flex-shrink-0 flex items-center justify-center">
                        {t.artwork_url ? (
                          <img
                            src={t.artwork_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <i className="ri-disc-line text-zinc-600 text-sm"></i>
                        )}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-body-md text-xs text-zinc-200 group-hover:text-white truncate">
                          {t.title}
                        </span>
                        {t.artist ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openArtist(t.artist);
                            }}
                            className="font-body-sm text-[11px] text-zinc-500 hover:text-white hover:underline truncate text-left w-fit max-w-full transition-colors focus:outline-none"
                            title={`Открыть карточку артиста: ${t.artist}`}
                          >
                            {t.artist}
                          </button>
                        ) : null}
                      </div>

                      <span className="font-label-sm text-[10px] text-zinc-500 tabular-nums">
                        {formatDurationMs(t.duration_ms)}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(actualQueueIndex);
                        }}
                        className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Удалить из очереди"
                      >
                        <i className="ri-close-line text-sm"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past Tracks Section */}
          {pastTracks.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-900/60">
              <div className="flex items-center justify-between px-1">
                <span className="font-label-sm text-[11px] text-zinc-500 uppercase tracking-wider">
                  {messages.player.previously_played || 'Ранее играли'} ({pastTracks.length})
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {pastTracks.map((t, pastIdx) => (
                  <div
                    key={`past-${t.id}-${pastIdx}`}
                    className="flex items-center gap-2.5 p-1.5 rounded hover:bg-[#121214] transition-colors group cursor-pointer opacity-75 hover:opacity-100"
                    onClick={() => playTrackAtIndex(pastIdx)}
                    title="Слушать снова"
                  >
                    <span className="font-label-sm text-[11px] text-zinc-600 w-4 text-center group-hover:hidden">
                      {pastIdx + 1}
                    </span>
                    <i className="ri-play-fill text-xs text-white hidden group-hover:block w-4 text-center"></i>

                    <div className="w-8 h-8 rounded-[2px] overflow-hidden bg-zinc-900 flex-shrink-0 flex items-center justify-center">
                      {t.artwork_url ? (
                        <img
                          src={t.artwork_url}
                          alt=""
                          className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0"
                        />
                      ) : (
                        <i className="ri-disc-line text-zinc-600 text-sm"></i>
                      )}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-body-md text-xs text-zinc-300 group-hover:text-white truncate">
                        {t.title}
                      </span>
                      {t.artist ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openArtist(t.artist);
                          }}
                          className="font-body-sm text-[11px] text-zinc-500 hover:text-white hover:underline truncate text-left w-fit max-w-full transition-colors focus:outline-none"
                          title={`Открыть карточку артиста: ${t.artist}`}
                        >
                          {t.artist}
                        </button>
                      ) : null}
                    </div>

                    <span className="font-label-sm text-[10px] text-zinc-500 tabular-nums">
                      {formatDurationMs(t.duration_ms)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
