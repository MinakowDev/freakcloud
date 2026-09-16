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

export const AlbumRecommendations: React.FC = () => {
  const { messages } = useTranslation();
  const { likedTracks } = useLikes();
  const { cachedTracks } = useCache();
  const { sliderRef, isDragging, scrollLeft, scrollRight, dragEvents } = useDragScroll();

  const [albums, setAlbums] = useState<Playlist[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Playlist | null>(null);
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

    // Default aesthetic fallback genres/styles
    return ['Synthwave', 'Ambient', 'Electronic', 'Lo-Fi'];
  }, [likedTracks, cachedTracks, refreshKey]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const fetchRecommended = async () => {
      try {
        const results: Playlist[] = [];
        const seenIds = new Set<number>();

        // Query albums for top 2 candidates
        const targetQueries = candidateQueries.slice(0, 2);
        for (const query of targetQueries) {
          try {
            const batch = await tauriApi.searchAlbums(query, 6);
            for (const album of batch) {
              if (!seenIds.has(album.id)) {
                seenIds.add(album.id);
                results.push(album);
              }
            }
          } catch (e) {
            console.warn('Failed searchAlbums for query:', query, e);
          }
        }

        if (isMounted) {
          setAlbums(results.slice(0, 10));
        }
      } catch (err) {
        console.error('Failed to load recommended albums:', err);
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

  if (!isLoading && albums.length === 0) {
    return null;
  }

  return (
    <section className="animate-cascade flex flex-col gap-space-sm" style={{ animationDelay: '80ms' }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-2.5">
          <div className="neu-button w-8 h-8 rounded-lg flex items-center justify-center text-amber-400">
            <i className="ri-disc-line text-lg" />
          </div>
          <div className="flex flex-col">
            <h2 className="font-headline-sm text-headline-sm text-white tracking-tight flex items-center gap-2">
              <span>{messages.home?.recommended_albums || 'Рекомендованные альбомы'}</span>
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
            title="Обновить рекомендации"
          >
            <i className={`ri-refresh-line text-[15px] ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Drag-pull Slider or Loader */}
      {isLoading && albums.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-zinc-500">
          <i className="ri-loader-4-line text-2xl animate-spin text-amber-400" />
          <span className="font-mono text-xs">Подбор альбомов для вашего вкуса...</span>
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
          {albums.map((album) => (
            <div key={album.id} className="w-[185px] sm:w-[210px] shrink-0">
              <PlaylistCard
                playlist={album}
                onOpenDetails={setSelectedAlbum}
              />
            </div>
          ))}
        </div>
      )}

      {/* Album Detail Modal */}
      {selectedAlbum && (
        <PlaylistDetailModal
          playlist={selectedAlbum}
          isOpen={Boolean(selectedAlbum)}
          onClose={() => setSelectedAlbum(null)}
        />
      )}
    </section>
  );
};
