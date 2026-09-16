import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { Playlist } from '../../../entities/playlist/model/types';
import type { Track } from '../../../entities/track/model/types';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import { usePlayer } from '../../../entities/player/model/player-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { TrackTable } from '../../track-list/ui/TrackTable';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useArtist } from '../../../entities/artist/model/artist-context';
import { entityCache } from '../../../shared/lib/entity-cache';
import { useTranslation } from '../../../shared/lib/i18n';
import { PlaylistCover } from '../../playlist-card/ui/PlaylistCover';
import { formatDurationMs } from '../../../entities/track/lib/format-time';

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
  const {
    isPlaylistSaved,
    savePlaylist,
    removeSavedPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    updatePlaylistTitle,
    deleteCustomPlaylist,
  } = usePlaylists();
  const { playTrack } = usePlayer();
  const { cacheTrack } = useCache();
  const { openArtist } = useArtist();
  const { t } = useTranslation();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isCachingAll, setIsCachingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom playlist modes
  const [activeTab, setActiveTab] = useState<'tracks' | 'add_tracks'>('tracks');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [searchTrackQuery, setSearchTrackQuery] = useState('');
  const [isSearchingTracks, setIsSearchingTracks] = useState(false);
  const [searchTrackResults, setSearchTrackResults] = useState<Track[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playlistId = playlist?.id;
  const isSaved = playlistId ? isPlaylistSaved(playlistId) : false;
  const isCustom = Boolean(playlist && !playlist.is_album && (playlist.author === 'Вы' || isSaved));

  useEffect(() => {
    if (!isOpen || !playlist) {
      setTracks([]);
      setError(null);
      setActiveTab('tracks');
      setIsEditingTitle(false);
      setSearchTrackQuery('');
      setSearchTrackResults([]);
      return;
    }

    setCustomTitle(playlist.title);

    // 1. If playlist prop already has tracks, use them & update cache
    if (playlist.tracks && playlist.tracks.length > 0) {
      setTracks(playlist.tracks);
      entityCache.setCachedPlaylist(playlist.id, playlist);
      return;
    }

    // 2. Check in-memory entity cache (0ms lookup)
    const cached = entityCache.getCachedPlaylist(playlist.id);
    if (cached && cached.tracks && cached.tracks.length > 0) {
      setTracks(cached.tracks);
      return;
    }

    // 3. Fallback: load from API
    let isMounted = true;
    setIsLoadingTracks(true);
    setError(null);

    tauriApi
      .getPlaylistDetails(playlist.id)
      .then((details) => {
        if (isMounted) {
          const loadedTracks = details.tracks || [];
          setTracks(loadedTracks);
          entityCache.setCachedPlaylist(playlist.id, {
            ...details,
            tracks: loadedTracks,
          });
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

  // Track search inside playlist
  const handleSearchTracks = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchTrackResults([]);
      return;
    }
    try {
      setIsSearchingTracks(true);
      const results = await tauriApi.searchTracks(trimmed, 20);
      setSearchTrackResults(results);
    } catch (err) {
      console.error('Failed to search tracks for playlist:', err);
    } finally {
      setIsSearchingTracks(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setSearchTrackQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      handleSearchTracks(val);
    }, 350);
  };

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

  const handleSaveTitle = async () => {
    const trimmed = customTitle.trim();
    if (!trimmed || trimmed === playlist.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await updatePlaylistTitle(playlist.id, trimmed);
      setIsEditingTitle(false);
    } catch (err) {
      console.error('Failed to update playlist title:', err);
    }
  };

  const handleRemoveTrack = async (trackId: number) => {
    try {
      await removeTrackFromPlaylist(playlist.id, trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch (err) {
      console.error('Failed to remove track from playlist:', err);
    }
  };

  const handleAddTrack = async (track: Track) => {
    try {
      await addTrackToPlaylist(playlist.id, track);
      setTracks((prev) => {
        if (prev.some((t) => t.id === track.id)) return prev;
        return [...prev, track];
      });
    } catch (err) {
      console.error('Failed to add track to playlist:', err);
    }
  };

  const handleDeletePlaylist = async () => {
    if (window.confirm(t('settings.delete_playlist_confirm'))) {
      try {
        await deleteCustomPlaylist(playlist.id);
        onClose();
      } catch (err) {
        console.error('Failed to delete playlist:', err);
      }
    }
  };

  const totalDurationMinutes = Math.floor(
    (tracks.length > 0
      ? tracks.reduce((acc, t) => acc + (t.duration_ms || 0), 0)
      : playlist.duration_ms) /
    1000 /
    60
  );

  // Dynamic playlist instance with active tracks for cover collage
  const dynamicPlaylist: Playlist = {
    ...playlist,
    title: customTitle,
    tracks,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-in select-none">
      <div className="neu-card-static relative w-full max-w-4xl max-h-[90vh] bg-[#14161a] border border-white/10 flex flex-col overflow-hidden rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-5 min-w-0 flex-1">
            {/* Dynamic Cover Artwork / 2x2 Collage */}
            <div className="neu-inset w-28 h-28 sm:w-36 sm:h-36 rounded-xl shrink-0 overflow-hidden relative border border-white/5">
              <PlaylistCover playlist={dynamicPlaylist} />
            </div>

            {/* Info & Title */}
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-mono">
                  {tracks.length} {t('library.tracks')} • {totalDurationMinutes} мин
                </span>
              </div>

              {/* Title with In-place Edit */}
              {isCustom && isEditingTitle ? (
                <div className="flex items-center gap-2 my-1">
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                    onBlur={handleSaveTitle}
                    autoFocus
                    className="text-xl sm:text-2xl font-bold text-white bg-black/40 px-3 py-1 rounded-lg border border-orange-500/60 focus:outline-none w-full max-w-md"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTitle}
                    className="neu-button w-9 h-9 rounded-lg flex items-center justify-center text-emerald-400 shrink-0"
                    title="Сохранить"
                  >
                    <i className="ri-check-line text-lg" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group/title">
                  <h2
                    onClick={() => isCustom && setIsEditingTitle(true)}
                    className={`font-headline-md text-xl sm:text-2xl font-bold text-white tracking-tight truncate ${isCustom ? 'cursor-pointer hover:text-orange-300 transition-colors' : ''
                      }`}
                    title={isCustom ? 'Нажмите для переименования' : customTitle}
                  >
                    {customTitle}
                  </h2>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(true)}
                      className="opacity-0 group-hover/title:opacity-100 text-zinc-400 hover:text-white transition-opacity p-1"
                      title={t('settings.edit_title')}
                    >
                      <i className="ri-edit-line text-sm" />
                    </button>
                  )}
                </div>
              )}

              {/* Author */}
              {playlist.author && !isCustom ? (
                <p className="font-body-sm text-xs text-zinc-400 truncate flex items-center gap-1.5">
                  <span>Автор:</span>
                  <button
                    type="button"
                    onClick={() => openArtist(playlist.author)}
                    className="text-zinc-200 hover:text-amber-300 hover:underline focus:outline-none transition-colors"
                    title={`Карточка артиста: ${playlist.author}`}
                  >
                    {playlist.author}
                  </button>
                </p>
              ) : null}

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={handlePlayAll}
                  disabled={tracks.length === 0}
                  className="neu-button-primary px-4 py-2 font-semibold text-xs flex items-center gap-2 rounded-xl disabled:opacity-50"
                >
                  <i className="ri-play-fill text-base"></i>
                  <span>Воспроизвести всё</span>
                </button>

                {/* Save icon button for non-custom playlists */}
                {!isCustom && (
                  <button
                    type="button"
                    onClick={handleToggleSave}
                    className={`neu-button w-10 h-10 rounded-xl flex items-center justify-center ${isSaved
                        ? 'text-amber-300 border-amber-400/40 bg-amber-950/40'
                        : 'text-zinc-300 hover:text-white'
                      }`}
                    title={isSaved ? 'В медиатеке' : 'Сохранить'}
                  >
                    <i className={`text-lg ${isSaved ? 'ri-bookmark-fill text-amber-400' : 'ri-bookmark-line'}`}></i>
                  </button>
                )}

                {/* Cache icon button */}
                <button
                  type="button"
                  onClick={handleCacheAll}
                  disabled={isCachingAll || tracks.length === 0}
                  className="neu-button w-10 h-10 rounded-xl flex items-center justify-center text-zinc-300 hover:text-white disabled:opacity-50"
                  title="Скачать все треки (офлайн)"
                >
                  <i className={`text-lg ${isCachingAll ? 'ri-loader-4-line animate-spin text-amber-400' : 'ri-download-2-line'}`}></i>
                </button>

                {/* Delete custom playlist button */}
                {isCustom && (
                  <button
                    type="button"
                    onClick={handleDeletePlaylist}
                    className="neu-button w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition-colors"
                    title={t('settings.delete_playlist')}
                  >
                    <i className="ri-delete-bin-line text-lg" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="neu-button self-start sm:self-auto w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white"
            title="Закрыть (Esc)"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Tab Navigation for Custom Playlist */}
        {isCustom && (
          <div className="flex items-center px-6 pt-3 border-b border-white/5 bg-black/20 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('tracks')}
              className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'tracks'
                  ? 'border-orange-500 text-orange-400'
                  : 'border-transparent text-zinc-400 hover:text-white'
                }`}
            >
              <i className="ri-play-list-line text-sm" />
              <span>Треки в плейлисте ({tracks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('add_tracks')}
              className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'add_tracks'
                  ? 'border-orange-500 text-orange-400'
                  : 'border-transparent text-zinc-400 hover:text-white'
                }`}
            >
              <i className="ri-add-circle-line text-sm" />
              <span>Найти и добавить треки</span>
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[300px]">
          {/* View 1: Track List */}
          {(!isCustom || activeTab === 'tracks') && (
            <>
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
                <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-400 gap-3 bg-black/20 rounded-2xl p-8 border border-white/5">
                  <div className="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/20">
                    <i className="ri-music-2-line text-3xl"></i>
                  </div>
                  <p className="font-semibold text-white text-base">В этом плейлисте пока нет треков</p>
                  <p className="text-xs text-zinc-500 max-w-sm">
                    {isCustom
                      ? 'Используйте поиск треков, чтобы наполнить плейлист любимой музыкой.'
                      : 'Этот плейлист пока пуст.'}
                  </p>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('add_tracks')}
                      className="neu-button-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 mt-2"
                    >
                      <i className="ri-search-line text-sm" />
                      <span>Найти и добавить первые треки</span>
                    </button>
                  )}
                </div>
              ) : (
                <TrackTable
                  tracks={tracks}
                  onRemoveTrack={isCustom ? handleRemoveTrack : undefined}
                />
              )}
            </>
          )}

          {/* View 2: Add Tracks Search (Custom Playlists) */}
          {isCustom && activeTab === 'add_tracks' && (
            <div className="flex flex-col gap-4">
              {/* Search Bar */}
              <div className="flex items-center gap-3 bg-black/40 border border-white/10 p-3 rounded-xl">
                <i className="ri-search-line text-lg text-zinc-400 ml-1" />
                <input
                  type="text"
                  value={searchTrackQuery}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Введите название трека или имя исполнителя..."
                  autoFocus
                  className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none"
                />
                {isSearchingTracks ? (
                  <i className="ri-loader-4-line text-lg animate-spin text-orange-400" />
                ) : searchTrackQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTrackQuery('');
                      setSearchTrackResults([]);
                    }}
                    className="text-zinc-500 hover:text-white"
                  >
                    <i className="ri-close-circle-line text-lg" />
                  </button>
                ) : null}
              </div>

              {/* Search Results List */}
              {searchTrackResults.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-mono text-zinc-500 px-1">
                    Найдено: {searchTrackResults.length} треков
                  </div>
                  {searchTrackResults.map((tItem) => {
                    const alreadyAdded = tracks.some((x) => x.id === tItem.id);
                    return (
                      <div
                        key={tItem.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-3">
                          <img
                            src={
                              tItem.artwork_url ||
                              'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80'
                            }
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover bg-black/40 border border-white/5 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {tItem.title}
                            </p>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">
                              {tItem.artist} • {formatDurationMs(tItem.duration_ms)}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {alreadyAdded ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                              <i className="ri-check-line" />
                              Добавлено
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddTrack(tItem)}
                              className="neu-button-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                            >
                              <i className="ri-add-line" />
                              <span>Добавить</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : searchTrackQuery ? (
                !isSearchingTracks && (
                  <div className="py-16 text-center text-zinc-500 text-xs">
                    По запросу «{searchTrackQuery}» ничего не найдено
                  </div>
                )
              ) : (
                <div className="py-16 text-center text-zinc-500 flex flex-col items-center gap-2">
                  <i className="ri-search-eye-line text-3xl text-zinc-600" />
                  <p className="text-xs">Начните вводить название трека, чтобы добавить его в плейлист</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
