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

interface SearchPageProps {
  searchQuery: string;
  searchResults: Track[];
  isSearching: boolean;
  onSelectQuery?: (query: string) => void;
}

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

  const [playlistResults, setPlaylistResults] = useState<Playlist[]>([]);
  const [isSearchingPlaylists, setIsSearchingPlaylists] = useState(false);
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

  // Search playlists whenever searchQuery changes
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setPlaylistResults([]);
      return;
    }

    let isMounted = true;
    setIsSearchingPlaylists(true);

    tauriApi
      .searchPlaylists(trimmed)
      .then((res) => {
        if (isMounted) {
          setPlaylistResults(res);
          saveRecentSearch(trimmed);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to search playlists:', err);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSearchingPlaylists(false);
        }
      });

    return () => {
      isMounted = false;
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

  const isCurrentSearching = isSearching || isSearchingPlaylists;
  const hasQuery = Boolean(searchQuery.trim());
  const hasResults = searchResults.length > 0 || playlistResults.length > 0;

  return (
    <div className="flex flex-col gap-space-xl max-w-6xl w-full">
      {/* Header with Title & Scanner Indicator */}
      {hasQuery && (
        <div className="animate-cascade flex items-center justify-between pb-space-sm border-b border-zinc-900" style={{ animationDelay: '0ms' }}>
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
            {playlistResults.length > 0 && <span>{playlistResults.length} плейлистов</span>}
            {playlistResults.length > 0 && searchResults.length > 0 && <span>•</span>}
            {searchResults.length > 0 && <span>{searchResults.length} треков</span>}
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

          {/* SECTION 1: PLAYLISTS (Horizontal row / grid cards) */}
          {(isSearchingPlaylists || playlistResults.length > 0) && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <i className="ri-play-list-2-line text-[#f7e479] text-base"></i>
                  <h2 className="font-headline-sm text-base font-bold text-white tracking-tight">
                    {messages.search.playlists_section}
                  </h2>
                  <span className="text-xs text-zinc-500 font-mono">({playlistResults.length})</span>
                </div>
              </div>

              {isSearchingPlaylists && playlistResults.length === 0 ? (
                <div className="py-8 flex items-center justify-center text-zinc-500 gap-2">
                  <i className="ri-loader-4-line text-xl animate-spin text-[#f7e479]"></i>
                  <span className="font-mono text-xs text-zinc-400">Поиск плейлистов...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {playlistResults.map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      playlist={pl}
                      onOpenDetails={handleOpenDetails}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* SECTION 2: TRACKS (Full table) */}
          {(isSearching || searchResults.length > 0) && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <i className="ri-music-2-line text-[#f7e479] text-base"></i>
                  <h2 className="font-headline-sm text-base font-bold text-white tracking-tight">
                    {messages.search.tracks_section}
                  </h2>
                  <span className="text-xs text-zinc-500 font-mono">({searchResults.length})</span>
                </div>
              </div>

              {isSearching && searchResults.length === 0 ? (
                <div className="py-12 flex items-center justify-center text-zinc-500 gap-2">
                  <i className="ri-loader-4-line text-xl animate-spin text-[#f7e479]"></i>
                  <span className="font-mono text-xs text-zinc-400">Поиск треков...</span>
                </div>
              ) : (
                <TrackTable tracks={searchResults} emptyMessage={messages.search.no_results} />
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
