import React, { useState } from 'react';
import type { Playlist } from '../../../entities/playlist/model/types';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import { usePlayer } from '../../../entities/player/model/player-context';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useTranslation } from '../../../shared/lib/i18n';

interface PlaylistCardProps {
  playlist: Playlist;
  onOpenDetails: (playlist: Playlist) => void;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({ playlist, onOpenDetails }) => {
  const { isPlaylistSaved, savePlaylist, removeSavedPlaylist } = usePlaylists();
  const { playTrack } = usePlayer();
  const { messages } = useTranslation();
  const [isPlayingLoading, setIsPlayingLoading] = useState(false);

  const isSaved = isPlaylistSaved(playlist.id);

  const handleToggleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (isSaved) {
        await removeSavedPlaylist(playlist.id);
      } else {
        await savePlaylist(playlist);
      }
    } catch (err) {
      console.error('Failed to toggle save playlist:', err);
    }
  };

  const handlePlayNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsPlayingLoading(true);
      let tracks = playlist.tracks;
      if (!tracks || tracks.length === 0) {
        const details = await tauriApi.getPlaylistDetails(playlist.id);
        tracks = details.tracks || [];
      }
      if (tracks.length > 0) {
        await playTrack(tracks[0], tracks);
      }
    } catch (err) {
      console.error('Failed to play playlist:', err);
    } finally {
      setIsPlayingLoading(false);
    }
  };

  const formattedDuration = () => {
    const totalSeconds = Math.floor(playlist.duration_ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes} мин`;
  };

  return (
    <div
      onClick={() => onOpenDetails(playlist)}
      className="group relative flex flex-col p-3 bg-zinc-950/80 hover:bg-zinc-900/90 border border-zinc-900 hover:border-zinc-700/60 transition-all duration-300 cursor-pointer select-none"
    >
      {/* Artwork Container */}
      <div className="relative aspect-square w-full bg-zinc-900 overflow-hidden mb-3">
        {playlist.artwork_url ? (
          <img
            src={playlist.artwork_url.replace('-large.', '-t500x500.')}
            alt={playlist.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-700">
            <i className="ri-play-list-2-line text-4xl"></i>
          </div>
        )}

        {/* Badge: Плейлист */}
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/75 backdrop-blur-md text-[10px] font-semibold uppercase tracking-wider text-zinc-300 border border-white/10">
          {messages.library.playlist_badge || 'Плейлист'}
        </div>

        {/* Action buttons overlay on hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
          {/* Play button */}
          <button
            type="button"
            onClick={handlePlayNow}
            disabled={isPlayingLoading}
            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform duration-200"
            title="Воспроизвести всё"
          >
            {isPlayingLoading ? (
              <i className="ri-loader-4-line animate-spin text-xl"></i>
            ) : (
              <i className="ri-play-fill text-2xl ml-0.5"></i>
            )}
          </button>

          {/* Bookmark / Save button */}
          <button
            type="button"
            onClick={handleToggleSave}
            className={`w-9 h-9 rounded-full backdrop-blur-md flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ${
              isSaved
                ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                : 'bg-black/60 text-white border border-white/20 hover:border-white/40'
            }`}
            title={isSaved ? 'Удалить из медиатеки' : 'Сохранить в медиатеку'}
          >
            <i className={`text-base ${isSaved ? 'ri-bookmark-fill' : 'ri-bookmark-line'}`}></i>
          </button>
        </div>

        {/* Track count indicator */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 backdrop-blur-sm text-[10px] font-mono text-zinc-300">
          {playlist.track_count} {messages.library.tracks_count || 'треков'}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <h3 className="font-headline-sm text-sm font-semibold text-white truncate group-hover:text-zinc-100 transition-colors" title={playlist.title}>
          {playlist.title}
        </h3>
        <p className="font-body-sm text-xs text-zinc-400 truncate" title={playlist.author}>
          {playlist.author}
        </p>
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-500 font-mono">
          <span>{formattedDuration()}</span>
          <span>•</span>
          <span>{playlist.track_count} треков</span>
        </div>
      </div>
    </div>
  );
};
