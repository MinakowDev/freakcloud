import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { PlaylistCard } from '../../playlist-card/ui/PlaylistCard';
import { PlaylistDetailModal } from '../../playlist-detail/ui/PlaylistDetailModal';
import { tauriApi } from '../../../shared/api/tauri-client';
import { useLikes } from '../../../entities/track/model/likes-context';
import { useCache } from '../../../entities/track/model/cache-context';
import { loadTasteGraph, getEffectiveWeight } from '../../../entities/track/lib/taste-graph';
import { useTranslation } from '../../../shared/lib/i18n';
import { useDragScroll } from '../../../shared/lib/use-drag-scroll';
import type { Playlist } from '../../../entities/playlist/model/types';

export const PlaylistRecommendations: React.FC = () => {
  const { messages } = useTranslation();
  const { likedTracks } = useLikes();
  const { cachedTracks } = useCache();
  const { sliderRef, isDragging, scrollLeft, scrollRight, dragEvents } = useDragScroll();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Compute recommendation search terms based on taste graph & library
  const candidateQueries = useMemo(() => {
    const graph = loadTasteGraph();
    const blacklist = new Set((graph.blacklist?.artists || []).map((a) => a.toLowerCase()));

    // 1. Top artists from taste graph
    const topArtists = Object.entries(graph.artists || {})
      .filter(([name]) => !blacklist.has(name.toLowerCase()))
      .map(([name, node]) => ({ name, weight: getEffectiveWeight(node) }))
      .filter((item) => item.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .map((item) => item.name);

    // 2. Artists from recent liked/cached tracks
    const libraryArtists: string[] = [];
    [...likedTracks, ...cachedTracks].forEach((t) => {
      if (t?.artist && !blacklist.has(t.artist.toLowerCase()) && !libraryArtists.includes(t.artist)) {
        libraryArtists.push(t.artist);
      }
    });

    const pool = [...new Set([...topArtists, ...libraryArtists])];

    if (pool.length > 0) {
      return pool.slice(0, 4);
    }

    // Default aesthetic fallback genres/playlists
    return ['Phonk', 'Hyperpop', 'Electronic', 'Lo-Fi', 'Underground', 'Chill'];
  }, [likedTracks, cachedTracks, refreshKey]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const fetchRecommended = async () => {
      try {
        const results: Playlist[] = [];
        const seenIds = new Set<number>();

        // Query playlists for top 2 candidates
        const targetQueries = candidateQueries.slice(0, 2);
        for (const query of targetQueries) {
          try {
            const batch = await tauriApi.searchPlaylists(query, 6);
            for (const item of batch) {
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                results.push(item);
              }
            }
          } catch (e) {
            console.warn('Failed searchPlaylists for query:', query, e);
          }
        }

        if (isMounted) {
          setPlaylists(results.slice(0, 10));
        }
      } catch (err) {
        console.error('Failed to load recommended playlists:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchRecommended();

    return () => {
      isMounted = false;
    };
  }, [candidateQueries]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!isLoading && playlists.length === 0) {
    return null;
  }

  return (
    <section className="animate-cascade flex flex-col gap-space-sm" style={{ animationDelay: '120ms' }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-2.5">
          <div className="neu-button w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400">
            <i className="ri-play-list-2-line text-lg" />
          </div>
          <div className="flex flex-col">
            <h2 className="font-headline-sm text-headline-sm text-white tracking-tight flex items-center gap-2">
              <span>{messages.home?.recommended_playlists || 'Подборка плейлистов'}</span>
            </h2>
          </div>
        </div>

        {/* Navigation buttons: Prev, Next, Refresh */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={scrollLeft}
            className="neu-button w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white"
            title="Листать назад"
          >
            <i className="ri-arrow-left-s-line text-lg" />
          </button>
          <button
            type="button"
            onClick={scrollRight}
            className="neu-button w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white"
            title="Листать вперед"
          >
            <i className="ri-arrow-right-s-line text-lg" />
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="neu-button w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-50 ml-1"
            title="Обновить подборку"
          >
            <i className={`ri-refresh-line text-[15px] ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Drag-pull Slider or Loader */}
      {isLoading && playlists.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-zinc-500">
          <i className="ri-loader-4-line text-2xl animate-spin text-emerald-400" />
          <span className="font-mono text-xs">Подбор плейлистов для вашего вкуса...</span>
        </div>
      ) : (
        <div
          ref={sliderRef}
          {...dragEvents}
          className={`flex items-stretch gap-4 overflow-x-auto scroll-smooth py-1 px-0.5 select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {playlists.map((playlist) => (
            <div key={playlist.id} className="w-[185px] sm:w-[210px] shrink-0">
              <PlaylistCard
                playlist={playlist}
                onOpenDetails={setSelectedPlaylist}
              />
            </div>
          ))}
        </div>
      )}

      {/* Playlist Detail Modal */}
      {selectedPlaylist && (
        <PlaylistDetailModal
          playlist={selectedPlaylist}
          isOpen={Boolean(selectedPlaylist)}
          onClose={() => setSelectedPlaylist(null)}
        />
      )}
    </section>
  );
};
