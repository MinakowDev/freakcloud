import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useCache } from '../../../entities/track/model/cache-context';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useSession } from '../../../entities/session/model/session-context';
import { usePlaylists } from '../../../entities/playlist/model/playlist-context';
import type { Playlist } from '../../../entities/playlist/model/types';
import { TrackTable } from '../../../widgets/track-list/ui/TrackTable';
import { PlaylistCard } from '../../../widgets/playlist-card/ui/PlaylistCard';
import { PlaylistDetailModal } from '../../../widgets/playlist-detail/ui/PlaylistDetailModal';
import { CreatePlaylistModal } from '../../../widgets/playlist-action/ui/CreatePlaylistModal';
import { ArtistCard } from '../../../widgets/artist-card/ui/ArtistCard';
import { useArtist } from '../../../entities/artist/model/artist-context';
import { loadTasteGraph, getEffectiveWeight } from '../../../entities/track/lib/taste-graph';
import { useTranslation } from '../../../shared/lib/i18n';
import './LibraryGlider.css';

type LibraryTab = 'soundcloud' | 'my-likes' | 'cached' | 'albums' | 'artists' | 'playlists';

export const LibraryPage: React.FC = () => {
  const { cachedTracks, refreshCache } = useCache();
  const {
    likedTracks,
    soundCloudTracks,
    isLoadingSoundCloud,
    isLoadingMoreSoundCloud,
    hasMoreSoundCloud,
    soundCloudError,
    refreshSoundCloud,
    loadMoreSoundCloud,
  } = useLikes();
  const { session, openOAuthModal } = useSession();
  const { savedPlaylists, isLoading: isLoadingPlaylists, refreshSavedPlaylists } = usePlaylists();
  const { messages } = useTranslation();
  const { openArtist } = useArtist();

  const [activeTab, setActiveTab] = useState<LibraryTab>('soundcloud');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Infinite scroll sentinel ref for SoundCloud tab
  const infiniteScrollSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMoreSoundCloud || isLoadingMoreSoundCloud || activeTab !== 'soundcloud') return;

    const sentinel = infiniteScrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreSoundCloud();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreSoundCloud, isLoadingMoreSoundCloud, activeTab, loadMoreSoundCloud]);

  // Artist section state
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [artistSortBy, setArtistSortBy] = useState<'tracks' | 'alphabetical'>('tracks');
  const [artistViewMode, setArtistViewMode] = useState<'grid' | 'list'>('grid');

  const savedAlbums = savedPlaylists.filter((p) => p.is_album);
  const customPlaylists = savedPlaylists.filter((p) => !p.is_album);

  // Aggregate artists from all user collections
  const libraryArtists = useMemo(() => {
    const allTracks = [...likedTracks, ...soundCloudTracks, ...cachedTracks];
    const artistMap = new Map<string, { count: number; avatarUrl?: string; name: string }>();

    allTracks.forEach((t) => {
      if (!t || !t.artist) return;
      const cleanName = t.artist.trim();
      const lower = cleanName.toLowerCase();
      const existing = artistMap.get(lower);
      if (existing) {
        existing.count += 1;
        if (!existing.avatarUrl && t.artwork_url) {
          existing.avatarUrl = t.artwork_url;
        }
      } else {
        artistMap.set(lower, {
          name: cleanName,
          count: 1,
          avatarUrl: t.artwork_url,
        });
      }
    });

    const graph = loadTasteGraph();
    const blacklist = new Set((graph.blacklist?.artists || []).map((a) => a.toLowerCase()));

    return Array.from(artistMap.values())
      .map((item) => {
        const lower = item.name.toLowerCase();
        const node = graph.artists[lower];
        const weight = node ? getEffectiveWeight(node) : 0;
        const isBlacklisted = blacklist.has(lower);
        return {
          ...item,
          weight,
          isBlacklisted,
        };
      })
      .sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        return b.count - a.count;
      });
  }, [likedTracks, soundCloudTracks, cachedTracks]);

  // Filtered & Sorted Artists
  const filteredArtists = useMemo(() => {
    let result = libraryArtists;
    const query = artistSearchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((a) => a.name.toLowerCase().includes(query));
    }
    if (artistSortBy === 'alphabetical') {
      return [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    // Default: 'tracks' (by track count, then weight)
    return [...result].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.weight - a.weight;
    });
  }, [libraryArtists, artistSearchQuery, artistSortBy]);

  // Top spotlight artists (when no search is active and library has >= 5 artists)
  const topSpotlightArtists = useMemo(() => {
    if (artistSearchQuery.trim() || libraryArtists.length < 5) return [];
    return [...libraryArtists].sort((a, b) => b.count - a.count).slice(0, 4);
  }, [libraryArtists, artistSearchQuery]);

  const handleOpenDetails = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setIsModalOpen(true);
  };

  const handleCreateSuccess = (newPlaylist: Playlist) => {
    setSelectedPlaylist(newPlaylist);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-space-lg max-w-6xl w-full">
      {/* Top Bar: Responsive Flex Switcher + Refresh */}
      <div className="animate-cascade flex items-center justify-between gap-3 pb-space-sm border-b border-zinc-900 w-full min-h-[36px]" style={{ animationDelay: '0ms' }}>
        {/* Glass Radio Group with Spring Glider (Order: soundcloud, my-likes, cached, albums, artists, playlists) */}
        <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar py-1">
          <div className="glass-radio-group mx-auto flex-shrink-0">
            {/* 1. SoundCloud */}
            <input
              type="radio"
              name="library-tab"
              id="library-tab-soundcloud"
              checked={activeTab === 'soundcloud'}
              onChange={() => setActiveTab('soundcloud')}
            />
            <label htmlFor="library-tab-soundcloud">
              <i className="ri-soundcloud-line text-xs"></i>
              <span>{messages.library.soundcloud_tab || 'SoundCloud'}</span>
            </label>

            {/* 2. Мои лайки */}
            <input
              type="radio"
              name="library-tab"
              id="library-tab-my-likes"
              checked={activeTab === 'my-likes'}
              onChange={() => setActiveTab('my-likes')}
            />
            <label htmlFor="library-tab-my-likes">
              <i className="ri-heart-3-line text-xs"></i>
              <span>{messages.library.my_likes_tab || 'Мои лайки'}</span>
            </label>

            {/* 3. Сохраненки */}
            <input
              type="radio"
              name="library-tab"
              id="library-tab-cached"
              checked={activeTab === 'cached'}
              onChange={() => setActiveTab('cached')}
            />
            <label htmlFor="library-tab-cached">
              <i className="ri-hard-drive-2-line text-xs"></i>
              <span>{messages.library.saved_tab || messages.library.offline_tab || 'Сохраненки'}</span>
            </label>

            {/* 4. Альбомы */}
            <input
              type="radio"
              name="library-tab"
              id="library-tab-albums"
              checked={activeTab === 'albums'}
              onChange={() => setActiveTab('albums')}
            />
            <label htmlFor="library-tab-albums">
              <i className="ri-disc-line text-xs"></i>
              <span>{messages.library.albums_tab || 'Альбомы'}</span>
            </label>

            {/* 5. Артисты */}
            <input
              type="radio"
              name="library-tab"
              id="library-tab-artists"
              checked={activeTab === 'artists'}
              onChange={() => setActiveTab('artists')}
            />
            <label htmlFor="library-tab-artists">
              <i className="ri-user-voice-line text-xs"></i>
              <span>{messages.library.artists_tab || 'Артисты'}</span>
            </label>

            {/* 6. Плейлисты */}
            <input
              type="radio"
              name="library-tab"
              id="library-tab-playlists"
              checked={activeTab === 'playlists'}
              onChange={() => setActiveTab('playlists')}
            />
            <label htmlFor="library-tab-playlists">
              <i className="ri-play-list-2-line text-xs"></i>
              <span>{messages.library.playlists_tab || 'Плейлисты'}</span>
            </label>

            <div className="glass-glider" />
          </div>
        </div>

        {/* Refresh button */}
        {((activeTab === 'soundcloud' && session.is_authenticated) || activeTab === 'cached' || activeTab === 'playlists') && (
          <div className="flex items-center justify-end shrink-0 min-w-[32px] gap-2">
            {activeTab === 'soundcloud' && session.is_authenticated ? (
              <button
                type="button"
                onClick={refreshSoundCloud}
                disabled={isLoadingSoundCloud}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800/60 transition-colors disabled:opacity-50"
                title="Обновить SoundCloud"
              >
                <i className={`ri-refresh-line text-[16px] ${isLoadingSoundCloud ? 'animate-spin' : ''}`}></i>
              </button>
            ) : activeTab === 'cached' ? (
              <button
                type="button"
                onClick={refreshCache}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800/60 transition-colors"
                title="Обновить кэш"
              >
                <i className="ri-refresh-line text-[16px]"></i>
              </button>
            ) : activeTab === 'playlists' ? (
              <button
                type="button"
                onClick={refreshSavedPlaylists}
                disabled={isLoadingPlaylists}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 border border-zinc-800/60 transition-colors disabled:opacity-50"
                title="Обновить плейлисты"
              >
                <i className={`ri-refresh-line text-[16px] ${isLoadingPlaylists ? 'animate-spin' : ''}`}></i>
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Content Area */}
      {activeTab === 'soundcloud' ? (
        !session.is_authenticated ? (
          /* Guest prompt for SoundCloud */
          <div className="animate-cascade p-8 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col items-center text-center gap-4 my-6 max-w-lg mx-auto" style={{ animationDelay: '60ms' }}>
            <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
              <i className="ri-soundcloud-line text-2xl"></i>
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-headline-sm text-base text-white font-semibold">
                {messages.library.guest_soundcloud_title || messages.library.guest_likes_title}
              </h3>
              <p className="font-body-sm text-xs text-zinc-400 leading-relaxed max-w-sm">
                {messages.library.guest_soundcloud_desc || messages.library.guest_likes_desc}
              </p>
            </div>
            <button
              type="button"
              onClick={openOAuthModal}
              className="mt-2 px-5 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <i className="ri-soundcloud-line text-base"></i>
              <span>{messages.auth.login_btn}</span>
            </button>
          </div>
        ) : isLoadingSoundCloud && soundCloudTracks.length === 0 ? (
          <div className="animate-cascade flex flex-col items-center justify-center py-20 text-zinc-500 gap-3" style={{ animationDelay: '60ms' }}>
            <i className="ri-loader-4-line text-3xl animate-spin text-zinc-400"></i>
            <span className="font-body-sm text-sm">{messages.library.loading_soundcloud || messages.library.loading_likes}</span>
          </div>
        ) : soundCloudError && soundCloudTracks.length === 0 ? (
          <div className="animate-cascade p-4 rounded-xl bg-red-950/30 border border-red-800/50 text-red-300 text-xs flex items-center justify-between" style={{ animationDelay: '60ms' }}>
            <span>{soundCloudError}</span>
            <button
              type="button"
              onClick={refreshSoundCloud}
              className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-medium transition-colors"
            >
              Повторить
            </button>
          </div>
        ) : (
          <div className="flex flex-col w-full">
            <TrackTable tracks={soundCloudTracks} emptyMessage={messages.library.empty_soundcloud || messages.library.empty_likes} />
            {hasMoreSoundCloud && (
              <div
                ref={infiniteScrollSentinelRef}
                className="flex items-center justify-center py-8 text-zinc-500 gap-2"
              >
                {isLoadingMoreSoundCloud ? (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <i className="ri-loader-4-line text-lg animate-spin"></i>
                    <span className="text-xs font-medium">Загрузка ещё треков...</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={loadMoreSoundCloud}
                    className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-medium border border-zinc-800 transition-colors"
                  >
                    Загрузить ещё ({soundCloudTracks.length} загружено)
                  </button>
                )}
              </div>
            )}
          </div>
        )
      ) : activeTab === 'my-likes' ? (
        /* Мои лайки: Freakcloud internal likes */
        <TrackTable tracks={likedTracks} emptyMessage={messages.library.empty_my_likes || messages.library.empty_likes} />
      ) : activeTab === 'cached' ? (
        /* Сохраненки: Offline cached tracks */
        <TrackTable tracks={cachedTracks} emptyMessage={messages.library.empty_saved || messages.library.empty_offline} />
      ) : activeTab === 'albums' ? (
        /* Альбомы */
        <div className="flex flex-col gap-4 animate-cascade" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-base text-white font-semibold">
                {messages.library.albums_title || 'Ваши сохранённые альбомы'}
              </span>
              <span className="text-xs text-zinc-500 font-mono">({savedAlbums.length})</span>
            </div>
          </div>

          {/* Albums Grid or Empty State */}
          {savedAlbums.length === 0 ? (
            <div className="neu-card py-20 flex flex-col items-center justify-center text-center text-zinc-400 gap-3 p-8">
              <i className="ri-disc-line text-4xl text-zinc-600"></i>
              <p className="font-headline-sm text-base text-white font-medium">
                {messages.library.empty_albums_title || 'Нет сохраненных альбомов'}
              </p>
              <p className="font-body-sm text-xs max-w-sm text-zinc-500">
                {messages.library.empty_albums_desc || 'Ищите релизы и альбомы любимых исполнителей через поиск и сохраняйте их в медиатеку в один клик.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {savedAlbums.map((album) => (
                <PlaylistCard
                  key={album.id}
                  playlist={album}
                  onOpenDetails={handleOpenDetails}
                />
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'artists' ? (
        /* Артисты */
        <div className="flex flex-col gap-5 animate-cascade" style={{ animationDelay: '60ms' }}>
          {/* Header & Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-base text-white font-semibold">
                {messages.library.artists_title || 'Исполнители в вашей медиатеке'}
              </span>
              <span className="text-xs text-zinc-500 font-mono">({filteredArtists.length})</span>
            </div>

            {/* Toolbar: Search, Sort, View switcher */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search Filter */}
              <div className="relative flex items-center">
                <i className="ri-search-line absolute left-2.5 text-xs text-zinc-500" />
                <input
                  type="text"
                  value={artistSearchQuery}
                  onChange={(e) => setArtistSearchQuery(e.target.value)}
                  placeholder={messages.library.artists_search_placeholder || 'Поиск исполнителя...'}
                  className="neu-inset pl-8 pr-7 py-1.5 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 w-44 sm:w-52"
                />
                {artistSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setArtistSearchQuery('')}
                    className="absolute right-2 text-zinc-500 hover:text-white text-xs"
                  >
                    <i className="ri-close-line" />
                  </button>
                )}
              </div>

              {/* Sort Switcher */}
              <div className="flex items-center rounded-lg p-0.5 bg-zinc-900/80 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setArtistSortBy('tracks')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    artistSortBy === 'tracks'
                      ? 'bg-zinc-800 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={messages.library.sort_by_tracks || 'По трекам'}
                >
                  <i className="ri-music-2-line mr-1 text-[11px]" />
                  <span>{messages.library.sort_by_tracks || 'По трекам'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setArtistSortBy('alphabetical')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    artistSortBy === 'alphabetical'
                      ? 'bg-zinc-800 text-white font-medium shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={messages.library.sort_by_name || 'По алфавиту'}
                >
                  <i className="ri-sort-alphabet-asc mr-1 text-[11px]" />
                  <span>{messages.library.sort_by_name || 'По алфавиту'}</span>
                </button>
              </div>

              {/* View Mode (Grid / List) */}
              <div className="flex items-center rounded-lg p-0.5 bg-zinc-900/80 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setArtistViewMode('grid')}
                  className={`w-7 h-7 flex items-center justify-center text-xs rounded-md transition-colors ${
                    artistViewMode === 'grid'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={messages.library.view_grid || 'Сетка'}
                >
                  <i className="ri-grid-fill text-sm" />
                </button>
                <button
                  type="button"
                  onClick={() => setArtistViewMode('list')}
                  className={`w-7 h-7 flex items-center justify-center text-xs rounded-md transition-colors ${
                    artistViewMode === 'list'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={messages.library.view_list || 'Список'}
                >
                  <i className="ri-list-check text-sm" />
                </button>
              </div>
            </div>
          </div>

          {/* Top in Library spotlight (when no search query and library has >= 5 artists) */}
          {topSpotlightArtists.length > 0 && (
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                <i className="ri-vip-crown-2-line text-amber-400" />
                <span>{messages.library.top_artists_section || 'Топ в медиатеке'}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {topSpotlightArtists.map((artist, idx) => (
                  <div
                    key={`top-${artist.name}`}
                    onClick={() => openArtist(artist.name)}
                    className="neu-card-static p-3 rounded-xl flex items-center gap-3 cursor-pointer select-none border border-amber-500/20 hover:border-amber-400/50 hover:bg-white/[0.03] transition-colors group"
                  >
                    <div className="relative shrink-0">
                      <div className="neu-inset w-12 h-12 rounded-full flex items-center justify-center overflow-hidden p-0.5">
                        {artist.avatarUrl ? (
                          <img
                            src={artist.avatarUrl.replace('-large.', '-t500x500.')}
                            alt={artist.name}
                            className="w-full h-full object-cover rounded-full"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full flex items-center justify-center bg-zinc-950 text-zinc-600">
                            <i className="ri-user-voice-line text-lg" />
                          </div>
                        )}
                      </div>
                      <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-amber-500 text-black font-bold text-[9px] flex items-center justify-center font-mono shadow">
                        {idx + 1}
                      </div>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-white truncate group-hover:text-amber-300 transition-colors">
                        {artist.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1 mt-0.5">
                        <i className="ri-music-2-line text-[10px]" />
                        {artist.count} {messages.artist?.tracks?.toLowerCase() || 'треков'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section Heading if Top Spotlight is shown */}
          {topSpotlightArtists.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 pt-1">
              <i className="ri-group-line text-zinc-400" />
              <span>{messages.library.all_artists_section || 'Все исполнители'}</span>
            </div>
          )}

          {/* Empty States or Results */}
          {libraryArtists.length === 0 ? (
            <div className="neu-card py-20 flex flex-col items-center justify-center text-center text-zinc-400 gap-3 p-8">
              <i className="ri-user-voice-line text-4xl text-zinc-600" />
              <p className="font-headline-sm text-base text-white font-medium">
                {messages.library.empty_artists_title || 'Артисты не найдены'}
              </p>
              <p className="font-body-sm text-xs max-w-sm text-zinc-500">
                {messages.library.empty_artists_desc || 'Добавляйте понравившиеся треки в любимые или сохраняйте в кэш: их авторы появятся здесь.'}
              </p>
            </div>
          ) : filteredArtists.length === 0 ? (
            <div className="neu-card-static py-16 flex flex-col items-center justify-center text-center text-zinc-400 gap-3 p-8">
              <i className="ri-search-eye-line text-3xl text-zinc-600" />
              <p className="font-headline-sm text-sm text-white font-medium">
                По запросу «{artistSearchQuery}» исполнители не найдены
              </p>
              <button
                type="button"
                onClick={() => setArtistSearchQuery('')}
                className="text-xs text-amber-400 hover:text-amber-300 underline"
              >
                Сбросить фильтр
              </button>
            </div>
          ) : artistViewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {filteredArtists.map((artist) => (
                <ArtistCard
                  key={artist.name}
                  artistName={artist.name}
                  trackCount={artist.count}
                  avatarUrl={artist.avatarUrl}
                  weight={artist.weight}
                  isBlacklisted={artist.isBlacklisted}
                />
              ))}
            </div>
          ) : (
            /* Compact List View */
            <div className="flex flex-col divide-y divide-zinc-900 neu-card-static rounded-xl overflow-hidden border border-zinc-800/60">
              {filteredArtists.map((artist, index) => (
                <div
                  key={artist.name}
                  onClick={() => openArtist(artist.name)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer select-none group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="w-6 text-center text-xs font-mono text-zinc-600">
                      {index + 1}
                    </span>
                    <div className="neu-inset w-10 h-10 rounded-full shrink-0 flex items-center justify-center overflow-hidden p-0.5">
                      {artist.avatarUrl ? (
                        <img
                          src={artist.avatarUrl.replace('-large.', '-t500x500.')}
                          alt={artist.name}
                          className="w-full h-full object-cover rounded-full"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full rounded-full flex items-center justify-center bg-zinc-950 text-zinc-600">
                          <i className="ri-user-voice-line text-sm" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-white group-hover:text-amber-300 transition-colors truncate">
                        {artist.name}
                      </span>
                      {artist.isBlacklisted && (
                        <span className="text-[10px] text-red-400 font-mono">
                          {messages.artist?.blacklisted || 'В чёрном списке'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                      <i className="ri-music-2-line text-zinc-500 text-xs" />
                      <span>{artist.count} {messages.artist?.tracks?.toLowerCase() || 'треков'}</span>
                    </span>
                    <i className="ri-arrow-right-s-line text-zinc-600 group-hover:text-zinc-300 transition-colors text-base" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Плейлисты */
        <div className="flex flex-col gap-4 animate-cascade" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-base text-white font-semibold">
                {messages.library.playlists_title || 'Ваши сохранённые плейлисты'}
              </span>
              <span className="text-xs text-zinc-500 font-mono">({customPlaylists.length})</span>
            </div>

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="neu-button-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <i className="ri-add-line text-sm"></i>
              <span>{messages.library.create_playlist || 'Создать плейлист'}</span>
            </button>
          </div>

          {/* Playlists Grid or Empty State */}
          {customPlaylists.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-400 gap-4 neu-card-static rounded-2xl p-8 border border-white/5 bg-zinc-950/40">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
                <i className="ri-play-list-add-line text-3xl"></i>
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <p className="font-headline-sm text-base text-white font-semibold">
                  {messages.library.empty_playlists_title || 'У вас пока нет плейлистов'}
                </p>
                <p className="font-body-sm text-xs text-zinc-500 leading-relaxed">
                  Создайте свой первый плейлист и собирайте любимую музыку SoundCloud в одном месте.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="neu-button-primary px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"
              >
                <i className="ri-add-line text-sm" />
                <span>Создать свой первый плейлист</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {customPlaylists.map((pl) => (
                <PlaylistCard
                  key={pl.id}
                  playlist={pl}
                  onOpenDetails={handleOpenDetails}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Playlist Modal */}
      <CreatePlaylistModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateSuccess={handleCreateSuccess}
      />

      {/* Playlist Details Modal */}
      <PlaylistDetailModal
        playlist={selectedPlaylist}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
