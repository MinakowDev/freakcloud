import React, { useEffect, useState } from 'react';
import type { Playlist } from '../../../entities/playlist/model/types';
import type { Track } from '../../../entities/track/model/types';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import { usePlayer } from '../../../entities/player/model/player-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { TrackTable } from '../../track-list/ui/TrackTable';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useTranslation } from '../../../shared/lib/i18n';

interface PlaylistDetailModalProps {
  playlist: Playlist | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PlaylistDetailModal: React.FC<PlaylistDetailModalProps> = ({
  playlist,
  isOpen,
  onClose,
}) => {
  const { messages } = useTranslation();
  const { isPlaylistSaved, savePlaylist, removeSavedPlaylist } = usePlaylists();
  const { playTrack } = usePlayer();
  const { cacheTrack } = useCache();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isCachingAll, setIsCachingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playlistId = playlist?.id;
  const isSaved = playlistId ? isPlaylistSaved(playlistId) : false;

  useEffect(() => {
    if (!isOpen || !playlist) {
      setTracks([]);
      setError(null);
      return;
    }

    if (playlist.tracks && playlist.tracks.length > 0) {
      setTracks(playlist.tracks);
      return;
    }

    let isMounted = true;
    setIsLoadingTracks(true);
    setError(null);

    tauriApi
      .getPlaylistDetails(playlist.id)
      .then((details) => {
        if (isMounted) {
          setTracks(details.tracks || []);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load playlist tracks:', err);
          setError(String(err));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingTracks(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, playlist]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !playlist) return null;

  const handlePlayAll = async () => {
    if (tracks.length > 0) {
      await playTrack(tracks[0], tracks);
    }
  };

  const handleToggleSave = async () => {
    try {
      if (isSaved) {
        await removeSavedPlaylist(playlist.id);
      } else {
        const fullPlaylist: Playlist = {
          ...playlist,
          tracks,
        };
        await savePlaylist(fullPlaylist);
      }
    } catch (err) {
      console.error('Failed to toggle save:', err);
    }
  };

  const handleCacheAll = async () => {
    if (isCachingAll || tracks.length === 0) return;
    try {
      setIsCachingAll(true);
      for (const track of tracks) {
        await cacheTrack(track);
      }
    } catch (err) {
      console.error('Failed to cache all tracks:', err);
    } finally {
      setIsCachingAll(false);
    }
  };

  const totalDurationMinutes = Math.floor(
    (tracks.length > 0
      ? tracks.reduce((acc, t) => acc + (t.duration_ms || 0), 0)
      : playlist.duration_ms) /
      1000 /
      60
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800/90 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-900 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between bg-zinc-900/30">
          <div className="flex items-center gap-5 min-w-0">
            {/* Artwork */}
            <div className="w-28 h-28 sm:w-36 sm:h-36 bg-zinc-900 shrink-0 overflow-hidden border border-white/5 relative">
              {playlist.artwork_url ? (
                <img
                  src={playlist.artwork_url.replace('-large.', '-t500x500.')}
                  alt={playlist.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-700">
                  <i className="ri-play-list-2-line text-4xl"></i>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-white/10 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                  {messages.library.playlist_badge || 'Плейлист'}
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  {tracks.length > 0 ? tracks.length : playlist.track_count} треков • {totalDurationMinutes} мин
                </span>
              </div>
              <h2 className="font-headline-md text-xl sm:text-2xl font-bold text-white tracking-tight truncate" title={playlist.title}>
                {playlist.title}
              </h2>
              <p className="font-body-sm text-sm text-zinc-400 truncate">
                Автор: <span className="text-zinc-200">{playlist.author}</span>
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePlayAll}
                  disabled={tracks.length === 0}
                  className="px-4 py-2 bg-white text-black font-semibold text-xs flex items-center gap-2 hover:bg-zinc-200 active:scale-95 transition-all disabled:opacity-50"
                >
                  <i className="ri-play-fill text-base"></i>
                  <span>Воспроизвести всё</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleSave}
                  className={`px-3.5 py-2 font-medium text-xs flex items-center gap-1.5 border transition-colors ${
                    isSaved
                      ? 'bg-amber-400/10 text-amber-300 border-amber-400/40 hover:bg-amber-400/20'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <i className={isSaved ? 'ri-bookmark-fill' : 'ri-bookmark-line'}></i>
                  <span>{isSaved ? 'В медиатеке' : 'Сохранить плейлист'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCacheAll}
                  disabled={isCachingAll || tracks.length === 0}
                  className="px-3.5 py-2 font-medium text-xs flex items-center gap-1.5 bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
                  title="Сохранить все треки плейлиста для офлайн-прослушивания"
                >
                  <i className={`text-base ${isCachingAll ? 'ri-loader-4-line animate-spin' : 'ri-download-2-line'}`}></i>
                  <span>{isCachingAll ? 'Скачивание...' : 'Скачать всё'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="self-start sm:self-auto w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Закрыть (Esc)"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Tracks List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[250px]">
          {isLoadingTracks ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-500 gap-3">
              <i className="ri-loader-4-line text-3xl animate-spin text-zinc-400"></i>
              <span className="text-xs font-mono">Загрузка треков плейлиста...</span>
            </div>
          ) : error ? (
            <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-400 gap-2">
              <i className="ri-error-warning-line text-3xl text-red-400"></i>
              <p className="text-sm max-w-md">{error}</p>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-500 gap-2">
              <i className="ri-music-2-line text-3xl text-zinc-700"></i>
              <p className="text-sm">В этом плейлисте пока нет треков</p>
            </div>
          ) : (
            <TrackTable tracks={tracks} />
          )}
        </div>
      </div>
    </div>
  );
};
