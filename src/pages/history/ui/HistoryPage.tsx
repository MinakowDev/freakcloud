import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Track } from '../../../entities/track/model/types';
import { getRecentPlayedTracks, clearRecentPlayedTracks } from '../../../entities/track/lib/taste-graph';
import { usePlayer } from '../../../entities/player/model/player-context';
import { TrackTable } from '../../../widgets/track-list/ui/TrackTable';
import { useTranslation } from '../../../shared/lib/i18n';
import { useConfirm } from '../../../shared/lib/confirm-context';
import { CustomDropdown, type DropdownOption } from '../../../shared/ui/CustomDropdown';

export const HistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const { playTrack } = usePlayer();
  const confirm = useConfirm();

  const [tracks, setTracks] = useState<Track[]>(() => getRecentPlayedTracks());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');

  const refreshHistory = useCallback(() => {
    setTracks(getRecentPlayedTracks());
  }, []);

  useEffect(() => {
    window.addEventListener('freakcloud_history_updated', refreshHistory);
    return () => {
      window.removeEventListener('freakcloud_history_updated', refreshHistory);
    };
  }, [refreshHistory]);

  // Extract unique genres from history
  const uniqueGenres = useMemo(() => {
    const set = new Set<string>();
    tracks.forEach((t) => {
      if (t.genre && t.genre.trim()) {
        set.add(t.genre.trim());
      }
    });
    return Array.from(set).sort();
  }, [tracks]);

  // Options for custom genre dropdown
  const genreOptions = useMemo<DropdownOption[]>(() => {
    const list: DropdownOption[] = [
      { value: 'all', label: t('history.all_genres'), icon: 'ri-apps-2-line' },
    ];
    uniqueGenres.forEach((g) => {
      list.push({ value: g, label: g, icon: 'ri-disc-line' });
    });
    return list;
  }, [uniqueGenres, t]);

  // Filtered tracks by search query and genre
  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tracks.filter((t) => {
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q);

      const matchesGenre =
        selectedGenre === 'all' ||
        (t.genre && t.genre.trim().toLowerCase() === selectedGenre.toLowerCase());

      return matchesSearch && matchesGenre;
    });
  }, [tracks, searchQuery, selectedGenre]);

  const handlePlayAll = () => {
    if (filteredTracks.length > 0) {
      playTrack(filteredTracks[0], filteredTracks);
    }
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: t('history.clear_confirm_title'),
      message: t('history.clear_confirm_desc'),
      confirmText: t('common.clear'),
      cancelText: t('common.cancel'),
      isDanger: true,
    });
    if (ok) {
      clearRecentPlayedTracks();
      setTracks([]);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6 pb-12 animate-fade-in">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <i className="ri-history-line text-2xl text-amber-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {t('history.title')}
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            {t('history.subtitle')}
          </p>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-3">
          {tracks.length > 0 && (
            <>
              <button
                type="button"
                onClick={handlePlayAll}
                className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <i className="ri-play-fill text-sm" />
                <span>{t('history.play_all')}</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900/60 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title={t('history.clear_btn')}
              >
                <i className="ri-delete-bin-line text-sm" />
                <span>{t('history.clear_btn')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter toolbar */}
      {tracks.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search filter input */}
          <div className="relative flex-1">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('history.search_placeholder')}
              className="w-full pl-9 pr-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <i className="ri-close-line text-sm" />
              </button>
            )}
          </div>

          {/* Genre filter custom dropdown */}
          {uniqueGenres.length > 0 && (
            <CustomDropdown
              value={selectedGenre}
              options={genreOptions}
              onChange={setSelectedGenre}
              prefixLabel={t('history.genre_filter')}
              prefixIcon="ri-equalizer-line"
              className="w-full sm:w-auto min-w-[190px]"
            />
          )}
        </div>
      )}

      {/* Track list or empty message */}
      <TrackTable
        tracks={filteredTracks}
        emptyMessage={
          tracks.length === 0
            ? t('history.empty_desc')
            : t('search.no_results')
        }
      />
    </div>
  );
};
