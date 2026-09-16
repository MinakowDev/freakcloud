import React, { useState, useEffect, useMemo } from 'react';
import type { Track } from '../../../entities/track/model/types';
import type { Playlist } from '../../../entities/playlist/model/types';
import { TrackTable } from '../../../widgets/track-list/ui/TrackTable';
import { PlaylistCard } from '../../../widgets/playlist-card/ui/PlaylistCard';
import { PlaylistDetailModal } from '../../../widgets/playlist-detail/ui/PlaylistDetailModal';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useTranslation } from '../../../shared/lib/i18n';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { loadTasteGraph } from '../../../entities/track/lib/taste-graph';
import { useDragScroll } from '../../../shared/lib/use-drag-scroll';

interface SearchPageProps {
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
  onSelectQuery?: (query: string) => void;
}

type SearchTab = 'all' | 'tracks' | 'albums' | 'playlists';

const SearchSlider: React.FC<{
  items: Playlist[];
  onOpenDetails: (p: Playlist) => void;
  title: string;
  icon: string;
  iconColor?: string;
  viewAllText?: string;
  onViewAll?: () => void;
}> = ({ items, onOpenDetails, title, icon, iconColor = 'text-white', viewAllText = 'Смотреть все', onViewAll }) => {
  const { sliderRef, isDragging, scrollLeft, scrollRight, dragEvents } = useDragScroll();

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <i className={`${icon} ${iconColor} text-base`} />
          <h2 className="font-headline-sm text-base font-bold text-white tracking-tight">{title}</h2>
          <span className="text-xs text-zinc-500 font-mono">({items.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {onViewAll && items.length > 4 && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-1 mr-1"
            >
              <span>{viewAllText}</span>
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
          )}
          <button
            type="button"
            onClick={scrollLeft}
            className="neu-button w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white"
            title="Назад"
          >
            <i className="ri-arrow-left-s-line text-base" />
          </button>
          <button
            type="button"
            onClick={scrollRight}
            className="neu-button w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white"
            title="Вперед"
          >
            <i className="ri-arrow-right-s-line text-base" />
          </button>
        </div>
      </div>

      <div
        ref={sliderRef}
        {...dragEvents}
        className={`flex items-stretch gap-4 overflow-x-auto scroll-smooth py-1 px-0.5 select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item) => (
          <div key={item.id} className="w-[185px] sm:w-[210px] shrink-0">
            <PlaylistCard playlist={item} onOpenDetails={onOpenDetails} />
          </div>
        ))}
      </div>
    </section>
  );
};

const RECENT_SEARCHES_KEY = 'freakcloud_recent_searches';

const CURATED_DISCOVERY_VIBES = [
  { label: 'Future Garage', icon: 'ri-radar-line', query: 'Future Garage' },
  { label: 'Witch House', icon: 'ri-moon-clear-line', query: 'Witch House' },
  { label: 'Ambient Jungle', icon: 'ri-leaf-line', query: 'Ambient Jungle' },
  { label: 'Deconstructed Club', icon: 'ri-sound-module-line', query: 'Deconstructed Club' },
  { label: 'Phonk', icon: 'ri-fire-line', query: 'Phonk' },
  { label: 'Hyperpop', icon: 'ri-sparkling-line', query: 'Hyperpop' },
  { label: 'Deep House', icon: 'ri-headphone-line', query: 'Deep House' },
  { label: 'Breakcore', icon: 'ri-pulse-line', query: 'Breakcore' },
];

export const SearchPage: React.FC<SearchPageProps> = ({
  searchQuery,
  searchResults,
  isSearching,
  onSelectQuery,
}) => {
  const { messages } = useTranslation();
  const { likedTracks } = useLikes();
  const { cachedTracks } = useCache();

  const [searchTab, setSearchTab] = useState<SearchTab>('all');
  const [playlistResults, setPlaylistResults] = useState<Playlist[]>([]);
  const [isSearchingPlaylists, setIsSearchingPlaylists] = useState(false);
  const [albumResults, setAlbumResults] = useState<Playlist[]>([]);
  const [isSearchingAlbums, setIsSearchingAlbums] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Recent Searches from localStorage
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveRecentSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save recent search:', e);
      }
      return next;
    });
  };

  const removeRecentSearch = (e: React.MouseEvent, query: string) => {
    e.stopPropagation();
    setRecentSearches((prev) => {
      const next = prev.filter((q) => q !== query);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to update recent searches:', err);
      }
      return next;
    });
  };

  const clearAllRecent = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (e) {
      console.warn('Failed to clear recent searches:', e);
    }
  };

  // Debounced search for playlists and albums (350ms)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setPlaylistResults([]);
      setAlbumResults([]);
      return;
    }

    let isMounted = true;
    setIsSearchingPlaylists(true);
    setIsSearchingAlbums(true);

    const timer = setTimeout(() => {
      Promise.all([
        tauriApi.searchPlaylists(trimmed).catch((err) => {
          console.error('Failed to search playlists:', err);
          return [] as Playlist[];
        }),
        tauriApi.searchAlbums(trimmed).catch((err) => {
          console.error('Failed to search albums:', err);
          return [] as Playlist[];
        }),
      ])
        .then(([playlists, albums]) => {
          if (!isMounted) return;
          setPlaylistResults(playlists);
          setAlbumResults(albums);
          saveRecentSearch(trimmed);
        })
        .finally(() => {
          if (isMounted) {
            setIsSearchingPlaylists(false);
            setIsSearchingAlbums(false);
          }
        });
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Compute Personalized Vibes based on Taste Graph, Likes and Cache
  const personalVibes = useMemo(() => {
    const suggestions: { label: string; icon: string; query: string; type: 'artist' | 'genre' }[] = [];
    const seen = new Set<string>();

    try {
      const taste = loadTasteGraph();

      // Top artists from taste graph
      const topTasteArtists = Object.entries(taste.artists || {})
        .filter(([name, node]) => name.trim().length > 1 && (node.weight > 0.5 || node.listenCount > 0))
        .sort((a, b) => b[1].weight - a[1].weight)
        .slice(0, 4);

      for (const [artist] of topTasteArtists) {
        const clean = artist.trim();
        if (!seen.has(clean.toLowerCase())) {
          seen.add(clean.toLowerCase());
          suggestions.push({ label: clean, icon: 'ri-user-star-line', query: clean, type: 'artist' });
        }
      }

      // Top genres from taste graph
      const topTasteGenres = Object.entries(taste.genres || {})
        .filter(([genre, node]) => genre.trim().length > 1 && (node.weight > 0.4 || node.listenCount > 0))
        .sort((a, b) => b[1].weight - a[1].weight)
        .slice(0, 3);

      for (const [genre] of topTasteGenres) {
        const clean = genre.trim();
        if (!seen.has(clean.toLowerCase())) {
          seen.add(clean.toLowerCase());
          suggestions.push({ label: clean, icon: 'ri-disc-line', query: clean, type: 'genre' });
        }
      }
    } catch (e) {
      console.warn('Failed to load taste graph for search suggestions:', e);
    }

    // Complement with liked tracks artists
    for (const track of likedTracks.slice(0, 15)) {
      if (suggestions.length >= 8) break;
      const clean = track.artist.trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        suggestions.push({ label: clean, icon: 'ri-heart-3-line', query: clean, type: 'artist' });
      }
    }

    // Complement with cached tracks artists
    for (const track of cachedTracks.slice(0, 10)) {
      if (suggestions.length >= 8) break;
      const clean = track.artist.trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        suggestions.push({ label: clean, icon: 'ri-hard-drive-2-line', query: clean, type: 'artist' });
      }
    }

    return suggestions;
  }, [likedTracks, cachedTracks]);

  const handleOpenDetails = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setIsModalOpen(true);
  };

  const isCurrentSearching = isSearching || isSearchingPlaylists || isSearchingAlbums;
  const hasQuery = Boolean(searchQuery.trim());
  const hasResults = searchResults.length > 0 || playlistResults.length > 0 || albumResults.length > 0;

  return (
    <div className="flex flex-col gap-space-xl max-w-6xl w-full">
      {/* Header with Title, Tabs & Scanner Indicator */}
      {hasQuery && (
        <div className="animate-cascade flex flex-col gap-3 pb-space-sm border-b border-zinc-900" style={{ animationDelay: '0ms' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h1 className="font-headline-md text-xl sm:text-2xl font-bold text-white tracking-tight">
                {messages.search.results_title}: <span className="text-[#f7e479]">«{searchQuery}»</span>
              </h1>

              {isCurrentSearching && (
                <div className="flex items-center gap-1 h-3.5 px-2 bg-zinc-900/80 rounded-full border-none" title="Сканирование SoundCloud...">
                  <span className="w-1 h-2 bg-[#f7e479] animate-pulse" />
                  <span className="w-1 h-3.5 bg-[#f7e479] animate-pulse" style={{ animationDuration: '0.4s' }} />
                  <span className="w-1 h-1.5 bg-[#f7e479] animate-pulse" style={{ animationDuration: '0.7s' }} />
                  <span className="text-[10px] text-zinc-400 font-mono ml-1">SCANNING</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              {searchResults.length > 0 && <span>{searchResults.length} треков</span>}
              {searchResults.length > 0 && (albumResults.length > 0 || playlistResults.length > 0) && <span>•</span>}
              {albumResults.length > 0 && <span>{albumResults.length} альбомов</span>}
              {albumResults.length > 0 && playlistResults.length > 0 && <span>•</span>}
              {playlistResults.length > 0 && <span>{playlistResults.length} плейлистов</span>}
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSearchTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                searchTab === 'all'
                  ? 'neu-button text-white bg-zinc-800/90 border-zinc-600'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {messages.search?.tab_all || 'Все'}
            </button>

            <button
              type="button"
              onClick={() => setSearchTab('tracks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                searchTab === 'tracks'
                  ? 'neu-button text-white bg-zinc-800/90 border-zinc-600'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <i className="ri-music-2-line text-xs" />
              <span>{messages.search?.tracks_section || 'Треки'}</span>
              <span className="font-mono text-[10px] opacity-75">({searchResults.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchTab('albums')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                searchTab === 'albums'
                  ? 'neu-button text-amber-300 bg-zinc-800/90 border-amber-600/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <i className="ri-disc-line text-xs text-amber-400" />
              <span>{messages.search?.albums_section || 'Альбомы'}</span>
              <span className="font-mono text-[10px] opacity-75">({albumResults.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchTab('playlists')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                searchTab === 'playlists'
                  ? 'neu-button text-white bg-zinc-800/90 border-zinc-600'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <i className="ri-play-list-2-line text-xs text-[#f7e479]" />
              <span>{messages.search?.playlists_section || 'Плейлисты'}</span>
              <span className="font-mono text-[10px] opacity-75">({playlistResults.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. START SCREEN (when search query is empty) */}
      {!hasQuery && (
        <div className="animate-cascade flex flex-col items-center justify-center py-8 px-4 gap-8" style={{ animationDelay: '40ms' }}>
          {/* Hero text */}
          <div className="flex flex-col items-center text-center gap-2 max-w-lg">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/[0.06] backdrop-blur-xl text-[#f7e479] shadow-lg mb-2">
              <i className="ri-compass-3-line text-2xl"></i>
            </div>
            <h2 className="font-headline-md text-2xl font-bold text-white tracking-tight">
              {messages.search.explore_title}
            </h2>
            <p className="font-body-sm text-sm text-zinc-400 leading-relaxed">
              {messages.search.explore_desc}
            </p>
          </div>

          {/* Section: Recent Searches (if any) */}
          {recentSearches.length > 0 && (
            <div className="flex flex-col items-center gap-2.5 w-full max-w-2xl">
              <div className="flex items-center justify-between w-full px-2">
                <span className="text-xs font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                  <i className="ri-history-line text-xs"></i>
                  <span>{messages.search.recent_searches}</span>
                </span>
                <button
                  type="button"
                  onClick={clearAllRecent}
                  className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {messages.search.clear_history}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                {recentSearches.map((item) => (
                  <div
                    key={item}
                    onClick={() => onSelectQuery?.(item)}
                    className="group px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] backdrop-blur-md text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-2 transition-all cursor-pointer select-none"
                  >
                    <i className="ri-search-line text-zinc-500 text-xs"></i>
                    <span>{item}</span>
                    <button
                      type="button"
                      onClick={(e) => removeRecentSearch(e, item)}
                      className="text-zinc-500 hover:text-white transition-colors ml-0.5"
                      title="Удалить из истории"
                    >
                      <i className="ri-close-line text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Based on your tastes (Personalized) */}
          {personalVibes.length > 0 && (
            <div className="flex flex-col items-center gap-2.5 w-full max-w-2xl">
              <span className="text-xs font-mono uppercase tracking-widest text-[#f7e479]/80 flex items-center gap-1.5">
                <i className="ri-sparkling-fill text-xs text-[#f7e479]"></i>
                <span>{messages.search.based_on_tastes}</span>
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {personalVibes.map((vibe) => (
                  <button
                    key={vibe.query}
                    type="button"
                    onClick={() => onSelectQuery?.(vibe.query)}
                    className="px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.12] backdrop-blur-md text-zinc-200 hover:text-white text-xs font-medium flex items-center gap-2 transition-all group"
                  >
                    <i className={`${vibe.icon} text-[#f7e479] text-xs transition-transform group-hover:scale-110`}></i>
                    <span>{vibe.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section: Featured Vibes (Discovery) */}
          <div className="flex flex-col items-center gap-2.5 w-full max-w-2xl">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">
              {messages.search.trending_vibes}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {CURATED_DISCOVERY_VIBES.map((vibe) => (
                <button
                  key={vibe.label}
                  type="button"
                  onClick={() => onSelectQuery?.(vibe.query)}
                  className="px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] backdrop-blur-md text-zinc-400 hover:text-zinc-100 text-xs font-medium flex items-center gap-2 transition-all group"
                >
                  <i className={`${vibe.icon} text-zinc-500 group-hover:text-[#f7e479] text-xs transition-colors`}></i>
                  <span>{vibe.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. HYBRID SEARCH RESULTS (both Playlists & Tracks) */}
      {hasQuery && (
        <div className="flex flex-col gap-space-xl animate-cascade" style={{ animationDelay: '40ms' }}>
          {/* Case: No Results at all */}
          {!isCurrentSearching && !hasResults && (
            <div className="py-24 flex flex-col items-center justify-center text-center text-zinc-400 gap-3">
              <i className="ri-search-eye-line text-4xl text-zinc-600"></i>
              <p className="font-headline-sm text-base text-white font-semibold">
                {messages.search.no_results}
              </p>
              <p className="font-body-sm text-xs max-w-sm text-zinc-500">
                По запросу «{searchQuery}» не найдено подходящих треков или плейлистов. Попробуйте скорректировать формулировку.
              </p>
            </div>
          )}

          {/* TAB: ALL (Tracks first, then compact horizontal drag-pull sliders for albums and playlists) */}
          {searchTab === 'all' && (
            <>
              {/* SECTION 1: TRACKS (Rendered FIRST!) */}
              {(isSearching || searchResults.length > 0) && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <i className="ri-music-2-line text-[#f7e479] text-base" />
                      <h2 className="font-headline-sm text-base font-bold text-white tracking-tight">
                        {messages.search.tracks_section}
                      </h2>
                      <span className="text-xs text-zinc-500 font-mono">({searchResults.length})</span>
                    </div>
                  </div>

                  {isSearching && searchResults.length === 0 ? (
                    <div className="py-12 flex items-center justify-center text-zinc-500 gap-2">
                      <i className="ri-loader-4-line text-xl animate-spin text-[#f7e479]" />
                      <span className="font-mono text-xs text-zinc-400">Поиск треков...</span>
                    </div>
                  ) : (
                    <TrackTable tracks={searchResults} emptyMessage={messages.search.no_results} />
                  )}
                </section>
              )}

              {/* SECTION 2: ALBUMS (Compact Drag-pull Slider) */}
              {(isSearchingAlbums || albumResults.length > 0) && (
                <SearchSlider
                  items={albumResults}
                  onOpenDetails={handleOpenDetails}
                  title={messages.search.albums_section || 'Альбомы'}
                  icon="ri-disc-line"
                  iconColor="text-amber-400"
                  viewAllText={messages.search?.view_all || 'Смотреть все'}
                  onViewAll={() => setSearchTab('albums')}
                />
              )}

              {/* SECTION 3: PLAYLISTS (Compact Drag-pull Slider) */}
              {(isSearchingPlaylists || playlistResults.length > 0) && (
                <SearchSlider
                  items={playlistResults}
                  onOpenDetails={handleOpenDetails}
                  title={messages.search.playlists_section || 'Плейлисты'}
                  icon="ri-play-list-2-line"
                  iconColor="text-[#f7e479]"
                  viewAllText={messages.search?.view_all || 'Смотреть все'}
                  onViewAll={() => setSearchTab('playlists')}
                />
              )}
            </>
          )}

          {/* TAB: TRACKS */}
          {searchTab === 'tracks' && (
            <section className="flex flex-col gap-3">
              {isSearching && searchResults.length === 0 ? (
                <div className="py-12 flex items-center justify-center text-zinc-500 gap-2">
                  <i className="ri-loader-4-line text-xl animate-spin text-[#f7e479]" />
                  <span className="font-mono text-xs text-zinc-400">Поиск треков...</span>
                </div>
              ) : (
                <TrackTable tracks={searchResults} emptyMessage={messages.search.no_results} />
              )}
            </section>
          )}

          {/* TAB: ALBUMS */}
          {searchTab === 'albums' && (
            <section className="flex flex-col gap-3">
              {isSearchingAlbums && albumResults.length === 0 ? (
                <div className="py-12 flex items-center justify-center text-zinc-500 gap-2">
                  <i className="ri-loader-4-line text-xl animate-spin text-amber-400" />
                  <span className="font-mono text-xs text-zinc-400">Поиск альбомов...</span>
                </div>
              ) : albumResults.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">Альбомы не найдены</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {albumResults.map((al) => (
                    <PlaylistCard key={al.id} playlist={al} onOpenDetails={handleOpenDetails} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* TAB: PLAYLISTS */}
          {searchTab === 'playlists' && (
            <section className="flex flex-col gap-3">
              {isSearchingPlaylists && playlistResults.length === 0 ? (
                <div className="py-12 flex items-center justify-center text-zinc-500 gap-2">
                  <i className="ri-loader-4-line text-xl animate-spin text-[#f7e479]" />
                  <span className="font-mono text-xs text-zinc-400">Поиск плейлистов...</span>
                </div>
              ) : playlistResults.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">Плейлисты не найдены</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {playlistResults.map((pl) => (
                    <PlaylistCard key={pl.id} playlist={pl} onOpenDetails={handleOpenDetails} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Playlist Details Modal */}
      <PlaylistDetailModal
        playlist={selectedPlaylist}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
