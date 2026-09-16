import React, { useState } from 'react';
import type { Playlist } from '../../../entities/playlist/model/types';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import { usePlayer } from '../../../entities/player/model/player-context';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useTranslation } from '../../../shared/lib/i18n';
import { useArtist } from '../../../entities/artist/model/artist-context';
import { entityCache } from '../../../shared/lib/entity-cache';
import { PlaylistCover } from './PlaylistCover';

interface PlaylistCardProps {
  playlist: Playlist;
  onOpenDetails: (playlist: Playlist) => void;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({ playlist, onOpenDetails }) => {
  const { isPlaylistSaved, savePlaylist, removeSavedPlaylist } = usePlaylists();
  const { playTrack } = usePlayer();
  const { messages } = useTranslation();
  const { openArtist } = useArtist();
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
        const cached = entityCache.getCachedPlaylist(playlist.id);
        if (cached && cached.tracks && cached.tracks.length > 0) {
          tracks = cached.tracks;
        } else {
          const details = await tauriApi.getPlaylistDetails(playlist.id);
          tracks = details.tracks || [];
          entityCache.setCachedPlaylist(playlist.id, {
            ...details,
            tracks,
          });
        }
      }
      if (tracks && tracks.length > 0) {
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
      className="neu-card group relative flex flex-col p-3.5 cursor-pointer select-none rounded-2xl"
    >
      {/* Artwork Container in Recessed Frame */}
      <div className="neu-inset relative aspect-square w-full mb-3 overflow-hidden">
        <PlaylistCover playlist={playlist} />


        {/* Action buttons overlay on hover */}
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
          {/* Play button */}
          <button
            type="button"
            onClick={handlePlayNow}
            disabled={isPlayingLoading}
            className="neu-button-primary w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-50"
            title="Слушать прямо сейчас"
          >
            {isPlayingLoading ? (
              <i className="ri-loader-4-line text-xl animate-spin"></i>
            ) : (
              <i className="ri-play-fill text-2xl ml-0.5"></i>
            )}
          </button>

          {/* Bookmark / Save button */}
          <button
            type="button"
            onClick={handleToggleSave}
            className={`neu-button w-9 h-9 rounded-full flex items-center justify-center ${
              isSaved
                ? 'text-amber-300 border-amber-400/40 bg-amber-950/40'
                : 'text-white'
            }`}
            title={isSaved ? 'Удалить из медиатеки' : 'Сохранить в медиатеку'}
          >
            <i className={`text-base ${isSaved ? 'ri-bookmark-fill' : 'ri-bookmark-line'}`}></i>
          </button>
        </div>

        {/* Track count indicator */}
        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-black/85 backdrop-blur-md rounded-md text-[10px] font-mono text-zinc-300 border border-white/5">
          {playlist.track_count} {messages.library.tracks_count || 'треков'}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 min-w-0 px-0.5">
        <h3 className="font-headline-sm text-sm font-semibold text-white truncate group-hover:text-amber-300 transition-colors duration-200" title={playlist.title}>
          {playlist.title}
        </h3>
        {playlist.author ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openArtist(playlist.author);
            }}
            className="font-body-sm text-xs text-zinc-400 hover:text-white hover:underline truncate text-left w-fit max-w-full transition-colors focus:outline-none"
            title={`Карточка артиста: ${playlist.author}`}
          >
            {playlist.author}
          </button>
        ) : null}
        <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500 font-mono">
          <span>{formattedDuration()}</span>
          <span>•</span>
          <span>{playlist.track_count} треков</span>
        </div>
      </div>
    </div>
  );
};
